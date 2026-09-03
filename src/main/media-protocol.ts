import { protocol, net } from 'electron'
import { existsSync, statSync } from 'fs'
import { extname } from 'path'
import { pathToFileURL } from 'url'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.flv': 'video/x-flv'
}

/**
 * 自定义协议 vdist-media://，把本地视频文件流式喂给渲染层的 <video>。
 * 支持 Range 请求，才能拖动进度条。
 */
export function registerMediaProtocol(): void {
  protocol.handle('vdist-media', (request) => {
    try {
      const url = new URL(request.url)
      // 路径在 host + pathname 里：vdist-media:///C:/path/to.mp4
      const filePath = decodeURIComponent(url.host + url.pathname).replace(/^\//, '')
      // Windows 盘符：/C:/xxx → C:/xxx
      const normalized = /^[a-zA-Z]:/.test(filePath) ? filePath : filePath

      if (!existsSync(normalized)) {
        return new Response('Not found', { status: 404 })
      }

      const stat = statSync(normalized)
      const ext = extname(normalized).toLowerCase()
      const mime = MIME[ext] ?? 'application/octet-stream'
      const range = request.headers.get('range')

      if (range) {
        const m = range.match(/bytes=(\d+)-(\d*)/)
        if (m) {
          const start = parseInt(m[1], 10)
          const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
          const chunkSize = end - start + 1
          const stream = net.fetch(pathToFileURL(normalized).toString(), {
            headers: { Range: `bytes=${start}-${end}` }
          })
          return stream.then((resp) => {
            const headers = new Headers({
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize)
            })
            return new Response(resp.body, { status: 206, headers })
          })
        }
      }

      const resp = net.fetch(pathToFileURL(normalized).toString())
      return resp.then((r) => {
        const headers = new Headers({
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(stat.size)
        })
        return new Response(r.body, { status: 200, headers })
      })
    } catch (err) {
      return new Response(String(err), { status: 500 })
    }
  })
}

/** 把本地路径转成 vdist-media:// URL */
export function toMediaUrl(filePath: string): string {
  // vdist-media:///<盘符绝对路径>
  return `vdist-media://${filePath.replace(/\\/g, '/')}`
}
