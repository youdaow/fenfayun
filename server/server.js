#!/usr/bin/env node
/**
 * 视频中转服务器（零依赖，Node 18+）
 *
 * iPad 上传视频 → 本服务器暂存 → 电脑端（分发云）定时拉取。
 *
 * 环境变量：
 *   PORT     监听端口，默认 3880
 *   TOKEN    鉴权密钥（强烈建议设置）
 *   DATA_DIR 存储目录，默认 ./uploads
 *   MAX_SIZE 单文件上限(MB)，默认 2000
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = parseInt(process.env.PORT || '3880', 10)
const TOKEN = process.env.TOKEN || ''
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'uploads')
const MAX_SIZE = (parseInt(process.env.MAX_SIZE || '2000', 10)) * 1024 * 1024
/** 滞留文件最长保留小时数（无人拉取的兜底清理），0 = 永不清理 */
const TTL_HOURS = parseFloat(process.env.TTL_HOURS || '72')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// 定期清掉超期滞留的文件，避免无人拉取时磁盘涨满
if (TTL_HOURS > 0) {
  setInterval(
    () => {
      try {
        const deadline = Date.now() - TTL_HOURS * 3600 * 1000
        for (const f of fs.readdirSync(DATA_DIR)) {
          const p = path.join(DATA_DIR, f)
          try {
            const st = fs.statSync(p)
            if (st.isFile() && st.mtimeMs < deadline) fs.unlinkSync(p)
          } catch (e) {
            /* 忽略竞态 */
          }
        }
      } catch (e) {
        console.error('[ttl cleanup]', e)
      }
    },
    30 * 60 * 1000
  ).unref()
}

function safeName(name) {
  return path.basename(name).replace(/[\\/:*?"<>|]/g, '_')
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function checkAuth(req, res, query) {
  if (!TOKEN) return true
  const hdr = req.headers['authorization'] || ''
  const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : ''
  if (query.get('token') === TOKEN || bearer === TOKEN) return true
  json(res, 401, { ok: false, error: '未授权' })
  return false
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const query = url.searchParams

  // 健康检查
  if (req.method === 'GET' && url.pathname === '/ping') {
    return json(res, 200, { ok: true, time: new Date().toISOString() })
  }

  // iPad 上传页
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderUploadPage())
    return
  }

  // 文件列表
  if (req.method === 'GET' && url.pathname === '/list') {
    if (!checkAuth(req, res, query)) return
    try {
      const files = fs.readdirSync(DATA_DIR)
        .filter((f) => fs.statSync(path.join(DATA_DIR, f)).isFile())
        .map((f) => {
          const st = fs.statSync(path.join(DATA_DIR, f))
          return { name: f, size: st.size, time: st.mtimeMs }
        })
        .sort((a, b) => a.time - b.time)
      return json(res, 200, { ok: true, files })
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e) })
    }
  }

  // 上传
  if (req.method === 'POST' && url.pathname === '/upload') {
    if (!checkAuth(req, res, query)) return
    const contentType = req.headers['content-type'] || ''
    const m = contentType.match(/boundary=(.+)/)
    if (!m) return json(res, 400, { ok: false, error: '缺少 boundary' })

    const boundary = m[1]
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      chunks.push(c)
      size += c.length
      if (size > MAX_SIZE) {
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks)
        const { filename, filedata } = parseMultipart(buf, boundary)
        if (!filedata || !filename) return json(res, 400, { ok: false, error: '未收到文件' })
        const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName(filename)}`
        fs.writeFileSync(path.join(DATA_DIR, name), filedata)
        json(res, 200, { ok: true, name, size: filedata.length })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e) })
      }
    })
    return
  }

  // 下载
  const dlMatch = url.pathname.match(/^\/download\/(.+)$/)
  if (req.method === 'GET' && dlMatch) {
    if (!checkAuth(req, res, query)) return
    const name = safeName(decodeURIComponent(dlMatch[1]))
    const file = path.join(DATA_DIR, name)
    if (!fs.existsSync(file)) return json(res, 404, { ok: false, error: '文件不存在' })
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fs.statSync(file).size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`
    })
    fs.createReadStream(file).pipe(res)
    return
  }

  // 删除
  const delMatch = url.pathname.match(/^\/delete\/(.+)$/)
  if (req.method === 'POST' && delMatch) {
    if (!checkAuth(req, res, query)) return
    const name = safeName(decodeURIComponent(delMatch[1]))
    const file = path.join(DATA_DIR, name)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
      return json(res, 200, { ok: true })
    }
    return json(res, 404, { ok: false, error: '文件不存在' })
  }

  json(res, 404, { ok: false, error: 'Not found' })
})

function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`)
  let filename = ''
  let filedata = Buffer.alloc(0)
  let start = buf.indexOf(delim)
  while (start !== -1) {
    const headerEnd = buf.indexOf('\r\n\r\n', start)
    if (headerEnd === -1) break
    const header = buf.slice(start, headerEnd).toString('utf8')
    const next = buf.indexOf(delim, headerEnd)
    const bodyStart = headerEnd + 4
    const bodyEnd = next === -1 ? buf.length - 2 : next - 2
    const body = buf.slice(bodyStart, Math.max(bodyStart, bodyEnd))
    const fnMatch = header.match(/filename="([^"]*)"/)
    if (fnMatch) {
      filename = fnMatch[1]
      filedata = body
    }
    start = next
  }
  return { filename, filedata }
}

function renderUploadPage() {
  const tokenQuery = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>分发云 · 视频上传</title>
<style>
  :root {
    /* 暗色（默认，与品牌一致：深底 + 青蓝渐变） */
    --bg: #0a1117;
    --card: #131c25;
    --border: #1e2a36;
    --text: #e6f5f3;
    --muted: #6b8a96;
    --accent: #36e0c8;
    --accent-2: #2bd4e5;
    --accent-from: #1fb3a6;
    --danger: #f87171;
    --success: #34d399;
    --chip: #1a2530;
  }
  [data-theme="light"] {
    --bg: #f6fafb;
    --card: #ffffff;
    --border: #e2edf2;
    --text: #0a1117;
    --muted: #5b7a86;
    --accent: #0fb5a8;
    --accent-2: #0a96b8;
    --accent-from: #14c8c8;
    --danger: #dc2626;
    --success: #059669;
    --chip: #eef6f8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body { min-height: 100vh; min-height: 100dvh; }
  body { font-family: -apple-system, "PingFang SC", sans-serif; background: var(--bg); color: var(--text);
         display: flex; align-items: center; justify-content: center; padding: 24px;
         transition: background .25s, color .25s; }
  .card { width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--border);
          border-radius: 20px; padding: 32px 24px; text-align: center; position: relative;
          box-shadow: 0 8px 40px rgba(0,0,0,.18); transition: background .25s, border-color .25s; }

  /* 品牌 logo 区 */
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px;
           flex-wrap: nowrap; }
  .logo { width: 32px; height: 32px; flex: 0 0 auto; }
  .logo path { stroke: var(--accent); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; fill: none;
              stroke-dasharray: 80; stroke-dashoffset: 0; }
  .name { font-size: 18px; font-weight: 700; letter-spacing: 1px;
          background: linear-gradient(135deg, var(--accent-from), var(--accent-2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
          white-space: nowrap; flex: 0 0 auto; }

  h1 { font-size: 16px; font-weight: 600; margin-top: 8px; line-height: 1.4; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.5;
         font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "微软雅黑", sans-serif;
         text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
         word-spacing: 1px; }

  .drop { margin-top: 22px; border: 2px dashed var(--border); border-radius: 16px; padding: 32px 16px;
          cursor: pointer; transition: .2s; background: var(--chip);
          display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .drop:active, .drop.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .ico { width: 40px; height: 40px; color: var(--accent); }
  .ico svg { width: 100%; height: 100%; display: block; }
  .drop p { font-size: 14px; color: var(--text); }
  .drop small { color: var(--muted); font-size: 11px; }
  #file { display: none; }

  .progress { margin-top: 16px; height: 6px; background: var(--chip); border-radius: 3px;
              overflow: hidden; display: none; }
  .progress > i { display: block; height: 100%; width: 0;
                  background: linear-gradient(90deg, var(--accent-from), var(--accent-2));
                  transition: width .2s; }
  .status { margin-top: 14px; font-size: 13px; min-height: 20px; color: var(--muted);
                word-break: break-all; }
  .ok { color: var(--success); } .err { color: var(--danger); }

  /* 主题切换器 */
  .theme { position: absolute; top: 14px; right: 14px;
           display: flex; gap: 4px; background: var(--chip); border: 1px solid var(--border);
           border-radius: 999px; padding: 3px; }
  .theme button { background: transparent; border: none; cursor: pointer;
                 width: 28px; height: 26px; border-radius: 999px;
                 display: flex; align-items: center; justify-content: center;
                 color: var(--muted); transition: .2s; }
  .theme button.active { background: var(--accent); color: #062021; box-shadow: 0 0 12px rgba(54,224,200,.35); }
  .theme svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
</head>
<body>
<div class="card">
  <div class="theme" id="theme" role="tablist" aria-label="主题切换">
    <button data-t="dark" aria-label="深色">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <button data-t="light" aria-label="浅色">
      <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    </button>
    <button data-t="auto" aria-label="跟随系统">
      <svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 20h8M12 18v2"/></svg>
    </button>
  </div>

  <div class="brand">
    <svg class="logo" viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 28 L6 4 L14 16 L14 4 M18 4 L18 28 L26 16 L26 4" />
    </svg>
    <div class="name">视频分发</div>
  </div>

  <h1>分发云</h1>
  <div class="sub">iPad 上传视频，电脑端自动拉取</div>

  <label class="drop" for="file">
    <svg class="ico" viewBox="0 0 24 24" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 6h18v12H3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M14 9l5 3-5 3z" fill="currentColor"/>
    </svg>
    <p>点击选择视频或拖拽到此处</p>
    <small>选完自动上传到中转服务器</small>
  </label>
  <input type="file" id="file" accept="video/*">
  <div class="progress" id="prog"><i id="progbar"></i></div>
  <div class="status" id="status"></div>
</div>

<script>
  /* 主题 */
  const themeBtns = document.querySelectorAll('#theme button');
  function applyTheme(mode) {
    let actual = mode;
    if (mode === 'auto') {
      actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', actual);
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.t === mode));
  }
  const saved = localStorage.getItem('vdrelay-theme') || 'auto';
  applyTheme(saved);
  themeBtns.forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.t;
    localStorage.setItem('vdrelay-theme', m);
    applyTheme(m);
  }));
  if (saved === 'auto') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme('auto'));
  }

  /* 上传 */
  const input = document.getElementById('file');
  const status = document.getElementById('status');
  const prog = document.getElementById('prog');
  const progbar = document.getElementById('progbar');
  const drop = document.querySelector('.drop');
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('on'); }));

  function upload(file) {
    if (file.size > 2 * 1024 * 1024 * 1024) { status.textContent = '文件超过 2GB，请压缩后重试'; status.className = 'status err'; return; }
    status.textContent = '上传中：' + file.name; status.className = 'status';
    prog.style.display = 'block'; progbar.style.width = '0%';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload${tokenQuery}');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progbar.style.width = Math.round(e.loaded/e.total*100)+'%'; };
    xhr.onload = () => {
      prog.style.display = 'none';
      try { const r = JSON.parse(xhr.responseText);
        if (r.ok) { status.textContent = '✅ 上传成功，电脑端会自动拉取'; status.className = 'status ok'; }
        else { status.textContent = '❌ ' + (r.error || '失败'); status.className = 'status err'; }
      } catch { status.textContent = '❌ 上传失败'; status.className = 'status err'; }
      input.value = '';
    };
    xhr.onerror = () => { prog.style.display = 'none'; status.textContent = '❌ 网络错误'; status.className = 'status err'; };
    const fd = new FormData(); fd.append('file', file); xhr.send(fd);
  }
  input.addEventListener('change', () => { const f = input.files[0]; if (f) upload(f); });
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) upload(f); });
</script>
</body>
</html>`
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[vd-relay] 中转服务器已启动，端口 ${PORT}`)
  console.log(`[vd-relay] 存储目录：${DATA_DIR}`)
  console.log(`[vd-relay] 鉴权：${TOKEN ? '已启用' : '⚠️ 未设置 TOKEN，任何人可访问'}`)
  if (!TOKEN) console.log('[vd-relay] 建议设置环境变量 TOKEN')
})
