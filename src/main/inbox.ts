import { createServer, type Server } from 'http'
import { networkInterfaces } from 'os'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomUUID } from 'crypto'
import * as db from './db'
import { getMediaRoot } from './paths'
import { getMp4Duration } from './media'

/**
 * iPad 局域网收件箱：电脑起一个本地 HTTP 服务，iPad 用 Safari 打开网页上传视频，
 * 文件直接落到素材库目录并自动登记进素材库。
 */

let server: Server | null = null
let port = 0
let onUpload: ((name: string) => void) | null = null

export interface InboxStatus {
  running: boolean
  port: number
  url: string
  ip: string
}

export function getLanIP(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function ipToUrl(ip: string): string {
  return ip.includes(':') ? `[${ip}]` : ip
}

export function startInbox(onFile: (name: string) => void): InboxStatus {
  if (server) return currentStatus()

  port = 3870
  onUpload = onFile
  const mediaRoot = getMediaRoot()

  server = createServer((req, res) => {
    // 首页 / 上传页
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderUploadPage())
      return
    }

    // 健康检查
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // 视频上传
    if (req.method === 'POST' && req.url === '/upload') {
      handleUpload(req, res, mediaRoot)
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      port += 1
      if (server) {
        server.listen(port, '0.0.0.0')
      }
    } else {
      console.error('[inbox] error', err)
    }
  })

  server.listen(port, '0.0.0.0')
  return currentStatus()
}

export function stopInbox(): void {
  if (server) {
    server.close()
    server = null
    onUpload = null
  }
}

export function currentStatus(): InboxStatus {
  const ip = getLanIP()
  return {
    running: !!server,
    port,
    url: `http://${ipToUrl(ip)}:${port}`,
    ip
  }
}

/** 极简 multipart 解析：只处理单个文件字段，字段名 file */
function handleUpload(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  mediaRoot: string
): void {
  const contentType = req.headers['content-type'] || ''
  const m = contentType.match(/boundary=(.+)/)
  if (!m) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: '缺少 boundary' }))
    return
  }
  const boundary = m[1]
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks)
      const { filename, filedata } = parseMultipart(buf, boundary)
      if (!filedata || !filename) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: '未收到文件' }))
        return
      }

      const safeName = basename(filename).replace(/[\\/:*?"<>|]/g, '_')
      const ext = extname(safeName).toLowerCase()
      const target = join(mediaRoot, `${Date.now()}_${randomUUID().slice(0, 6)}${ext}`)
      createWriteStream(target).end(filedata, () => {
        try {
          const existing = db.listMaterials().find((mt) => mt.path === target)
          if (!existing) {
            db.createMaterial({
              name: safeName,
              path: target,
              size: filedata.length,
              duration: ext === '.mp4' ? getMp4Duration(target) : null,
              coverPath: null
            })
          }
          onUpload?.(safeName)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, name: safeName }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e) }))
        }
      })
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(e) }))
    }
  })
}

function parseMultipart(buf: Buffer, boundary: string): { filename: string; filedata: Buffer } {
  const delim = Buffer.from(`--${boundary}`)
  let filename = ''
  let filedata: Buffer = Buffer.alloc(0)

  // 按 boundary 切分
  let start = buf.indexOf(delim)
  while (start !== -1) {
    const headerEnd = buf.indexOf('\r\n\r\n', start)
    if (headerEnd === -1) break
    const header = buf.slice(start, headerEnd).toString('utf8')
    const next = buf.indexOf(delim, headerEnd)
    const bodyStart = headerEnd + 4
    const bodyEnd = next === -1 ? buf.length - 2 : next - 2 // 去掉尾部 \r\n
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

function renderUploadPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>视频收发件箱</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { font-family: -apple-system, "PingFang SC", sans-serif; background: #0f1115; color: #e6e9ef;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 420px; background: #1a1d24; border: 1px solid #232833; border-radius: 20px; padding: 32px 24px; text-align: center; }
  h1 { font-size: 20px; font-weight: 600; }
  .sub { color: #6b7488; font-size: 13px; margin-top: 6px; }
  .drop { margin-top: 24px; border: 2px dashed #313846; border-radius: 16px; padding: 40px 16px; cursor: pointer; transition: .2s; }
  .drop:active, .drop.on { border-color: #3b82f6; background: rgba(59,130,246,.08); }
  .drop .ico { font-size: 40px; }
  .drop p { margin-top: 12px; font-size: 15px; color: #c3cad8; }
  .drop small { color: #6b7488; font-size: 12px; }
  #file { display: none; }
  .btn { margin-top: 20px; width: 100%; height: 48px; border: none; border-radius: 12px; background: #3b82f6; color: #fff; font-size: 16px; font-weight: 600; }
  .btn:disabled { opacity: .4; }
  .status { margin-top: 16px; font-size: 13px; min-height: 20px; }
  .progress { margin-top: 16px; height: 6px; background: #232833; border-radius: 3px; overflow: hidden; display: none; }
  .progress > i { display: block; height: 100%; width: 0; background: #3b82f6; transition: width .2s; }
  .ok { color: #34d399; } .err { color: #f87171; }
</style>
</head>
<body>
<div class="card">
  <h1>📥 视频收发件箱</h1>
  <div class="sub">从 iPad 上传视频到电脑素材库</div>

  <label class="drop" for="file" id="drop">
    <div class="ico">🎬</div>
    <p>点击选择视频</p>
    <small>支持 mp4 / mov 等，选完自动上传</small>
  </label>
  <input type="file" id="file" accept="video/*">

  <div class="progress" id="prog"><i id="progbar"></i></div>
  <div class="status" id="status"></div>
</div>

<script>
  const input = document.getElementById('file');
  const status = document.getElementById('status');
  const prog = document.getElementById('prog');
  const progbar = document.getElementById('progbar');
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024 * 1024) { status.textContent = '文件超过 2GB，请压缩后重试'; status.className = 'status err'; return; }
    status.textContent = '上传中：' + f.name;
    status.className = 'status';
    prog.style.display = 'block';
    progbar.style.width = '0%';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progbar.style.width = Math.round(e.loaded / e.total * 100) + '%';
    };
    xhr.onload = () => {
      prog.style.display = 'none';
      try {
        const r = JSON.parse(xhr.responseText);
        if (r.ok) { status.textContent = '✅ 已发送到电脑：「' + r.name + '」'; status.className = 'status ok'; }
        else { status.textContent = '❌ ' + (r.error || '上传失败'); status.className = 'status err'; }
      } catch { status.textContent = '❌ 上传失败'; status.className = 'status err'; }
      input.value = '';
    };
    xhr.onerror = () => { prog.style.display = 'none'; status.textContent = '❌ 网络错误'; status.className = 'status err'; };
    const fd = new FormData();
    fd.append('file', f);
    xhr.send(fd);
  });
</script>
</body>
</html>`
}
