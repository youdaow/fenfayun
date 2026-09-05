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
    // 首页 / 上传页（?pin= 正确才给上传页，否则先要 PIN）
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const q = new URL(req.url ?? '/', 'http://x').searchParams
      const pin = db.getSetting('inbox.pin', '')
      if (pin && q.get('pin') !== pin) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderPinPage())
        return
      }
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
    if (req.method === 'POST' && req.url && req.url.startsWith('/upload')) {
      const q = new URL(req.url, 'http://x').searchParams
      const pin = db.getSetting('inbox.pin', '')
      if (pin && q.get('pin') !== pin) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'PIN 不正确' }))
        return
      }
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

/**
 * 流式 multipart 上传：边收边写盘（不再整包缓存，大文件不撑爆内存）。
 * 手写解析：找到 part 头部结束标记后，把剩余字节流式写入目标文件，
 * 遇到 boundary 结束序列即停。字段名固定 file。
 */
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
  const boundary = Buffer.from('\r\n--' + m[1].replace(/^"|"$/g, ''))
  const MAX_BYTES = 2 * 1024 * 1024 * 1024

  let filename = ''
  let target = ''
  let out: import('fs').WriteStream | null = null
  let headerBuf = Buffer.alloc(0)
  let inHeaders = true
  let total = 0
  let tail = Buffer.alloc(0) // 保留末尾可能的 boundary 前缀
  let done = false

  const finish = (ok: boolean, errText?: string): void => {
    if (done) return
    done = true
    if (out) {
      try { out.end() } catch { /* ignore */ }
    }
    if (!ok) {
      if (target && existsSync(target)) {
        try { require('fs').unlinkSync(target) } catch { /* ignore */ }
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: errText ?? '上传中断' }))
      return
    }
    try {
      const size = total
      const safeName = filename || 'video.mp4'
      void size
      const existing = db.listMaterials().find((mt) => mt.path === target)
      if (!existing) {
        const ext = extname(target).toLowerCase()
        db.createMaterial({
          name: safeName,
          path: target,
          size,
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
  }

  req.on('data', (chunk: Buffer) => {
    if (done) return
    total += chunk.length
    if (total > MAX_BYTES) {
      req.destroy()
      finish(false, '文件超过 2GB')
      return
    }
    if (inHeaders) {
      headerBuf = Buffer.concat([headerBuf, chunk])
      const headEnd = headerBuf.indexOf('\r\n\r\n')
      if (headEnd === -1) {
        if (headerBuf.length > 64 * 1024) {
          req.destroy()
          finish(false, '请求头异常')
        }
        return
      }
      const header = headerBuf.subarray(0, headEnd).toString('utf8')
      const fnMatch = header.match(/filename="([^"]*)"/)
      const rawName = fnMatch ? fnMatch[1] : 'video.mp4'
      filename = basename(rawName).replace(/[\\/:*?"<>|]/g, '_')
      const ext = extname(filename).toLowerCase() || '.mp4'
      const { randomUUID } = require('crypto') as typeof import('crypto')
      target = join(mediaRoot, `${Date.now()}_${randomUUID().slice(0, 6)}${ext}`)
      const { createWriteStream: cws } = require('fs') as typeof import('fs')
      out = cws(target)
      out.on('error', () => finish(false, '写入失败'))
      const bodyStart = headEnd + 4
      chunk = headerBuf.subarray(bodyStart)
      headerBuf = Buffer.alloc(0)
      inHeaders = false
    }
    // 检测 boundary：保留 boundary.length+8 字节的尾巴下次判断
    const buf = tail.length ? Buffer.concat([tail, chunk]) : chunk
    const idx = buf.indexOf(boundary)
    if (idx !== -1) {
      out?.write(buf.subarray(0, idx))
      finish(true)
      req.pause()
      return
    }
    const safeLen = Math.max(0, buf.length - boundary.length - 8)
    if (safeLen > 0) {
      out?.write(buf.subarray(0, safeLen))
      tail = Buffer.from(buf.subarray(safeLen))
    } else {
      tail = Buffer.from(buf)
    }
  })

  req.on('end', () => {
    if (done) return
    // 没有显式 boundary（截断式）：把 tail 写掉收尾
    if (tail.length && out) out.write(tail)
    finish(!!target)
  })
  req.on('error', () => finish(false, '网络错误'))
}

function renderPinPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>视频收发件箱 · 输入 PIN</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", sans-serif; background: #0f1115; color: #e6e9ef;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 360px; background: #1a1d24; border: 1px solid #232833; border-radius: 20px;
          padding: 32px 24px; text-align: center; }
  h1 { font-size: 20px; font-weight: 600; }
  .sub { color: #6b7488; font-size: 13px; margin-top: 6px; }
  input { margin-top: 24px; width: 100%; height: 52px; text-align: center; font-size: 24px; letter-spacing: 8px;
          border-radius: 12px; border: 1px solid #313846; background: #12151b; color: #e6e9ef; outline: none; }
  input:focus { border-color: #3b82f6; }
  .btn { margin-top: 16px; width: 100%; height: 48px; border: none; border-radius: 12px; background: #3b82f6;
         color: #fff; font-size: 16px; font-weight: 600; }
</style>
</head>
<body>
<form class="card" method="get" action="/">
  <h1>📥 视频收发件箱</h1>
  <div class="sub">请输入电脑上显示的 4 位 PIN</div>
  <input name="pin" inputmode="numeric" maxlength="8" autocomplete="off" autofocus placeholder="••••">
  <button class="btn" type="submit">进入上传页</button>
</form>
</body>
</html>`
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
    xhr.open('POST', '/upload' + location.search);
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
