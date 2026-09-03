import { openSync, readSync, closeSync, fstatSync } from 'fs'

/**
 * 零依赖读取 MP4 时长（解析 moov/mvhd）。
 * 取不到就返回 null，不阻塞主流程。
 */
export function getMp4Duration(filePath: string): number | null {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const size = fstatSync(fd).size
    let offset = 0
    // 只扫描前 8MB，足够覆盖放在文件头部的 moov
    const maxScan = Math.min(size, 8 * 1024 * 1024)

    while (offset < maxScan) {
      const header = Buffer.alloc(8)
      readSync(fd, header, 0, 8, offset)
      let boxSize = header.readUInt32BE(0)
      const type = header.toString('latin1', 4, 8)
      let headerSize = 8

      if (boxSize === 1) {
        const ext = Buffer.alloc(8)
        readSync(fd, ext, 0, 8, offset + 8)
        boxSize = Number(ext.readBigUInt64BE(0))
        headerSize = 16
      } else if (boxSize === 0) {
        boxSize = size - offset
      }
      if (boxSize < headerSize) break

      if (type === 'moov') {
        return readMvhd(fd, offset + headerSize, offset + boxSize)
      }
      // 常见情况 moov 在 mdat 之后，若遇到 mdat 则跳到其后继续找
      offset += boxSize
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function readMvhd(fd: number, start: number, end: number): number | null {
  let pos = start
  while (pos < end - 8) {
    const header = Buffer.alloc(8)
    readSync(fd, header, 0, 8, pos)
    const boxSize = header.readUInt32BE(0)
    const type = header.toString('latin1', 4, 8)
    if (boxSize < 8) return null
    if (type === 'mvhd') {
      const body = Buffer.alloc(boxSize - 8)
      readSync(fd, body, 0, body.length, pos + 8)
      const version = body[0]
      if (version === 1) {
        const timescale = body.readUInt32BE(20)
        const duration = Number(body.readBigUInt64BE(24))
        return timescale ? duration / timescale : null
      }
      const timescale = body.readUInt32BE(12)
      const duration = body.readUInt32BE(16)
      return timescale ? duration / timescale : null
    }
    pos += boxSize
  }
  return null
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}
