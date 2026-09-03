/**
 * 生成应用图标（build/icon.ico，256x256，PNG 内嵌格式）。
 * 不依赖任何图形库，纯手绘像素 + zlib 编码，避免为打包再装 canvas。
 * 用法：node scripts/make-icon.js
 */
const { deflateSync } = require('zlib')
const { existsSync, mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const SIZE = 256
const BG = [43, 212, 229] // 青（aqua #2bd4e5）
const BG_DARK = [14, 165, 152] // 蓝绿（brand #0ea598）
const FG = [255, 255, 255]

function roundedAlpha(x, y, radius) {
  // 计算像素相对圆角的可见度（0~1，用于抗锯齿）
  const cx = Math.min(Math.max(x, radius), SIZE - 1 - radius)
  const cy = Math.min(Math.max(y, radius), SIZE - 1 - radius)
  const dx = x - cx
  const dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy)
  return Math.max(0, Math.min(1, radius - d + 0.5))
}

function inTriangle(px, py, pts) {
  const sign = (ax, ay, bx, by, cx, cy) =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const [a, b, c] = pts
  const d1 = sign(px, py, a[0], a[1], b[0], b[1])
  const d2 = sign(px, py, b[0], b[1], c[0], c[1])
  const d3 = sign(px, py, c[0], c[1], a[0], a[1])
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function buildPixels() {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  const radius = 56

  // 主三角（播放按钮）
  const tri = [
    [96, 74],
    [96, 182],
    [178, 128]
  ]
  // 右侧三个分发节点
  const dots = [
    [204, 88, 13],
    [206, 128, 13],
    [204, 168, 13]
  ]

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      // 背景：斜向渐变
      const t = (x + y) / (2 * SIZE)
      let r = BG_DARK[0] + (BG[0] - BG_DARK[0]) * (1 - t)
      let g = BG_DARK[1] + (BG[1] - BG_DARK[1]) * (1 - t)
      let b = BG_DARK[2] + (BG[2] - BG_DARK[2]) * (1 - t)
      let a = roundedAlpha(x, y, radius)

      // 播放三角
      if (inTriangle(x + 0.5, y + 0.5, tri)) {
        r = FG[0]
        g = FG[1]
        b = FG[2]
        a = Math.round(255 * a)
      }

      // 分发节点
      for (const [dx, dy, dr] of dots) {
        const d = Math.hypot(x + 0.5 - dx, y + 0.5 - dy)
        if (d <= dr) {
          const cov = Math.min(1, dr - d + 0.5)
          r = r + (FG[0] - r) * cov
          g = g + (FG[1] - g) * cov
          b = b + (FG[2] - b) * cov
          a = Math.round(255 * a)
        }
      }

      buf[i] = Math.round(r)
      buf[i + 1] = Math.round(g)
      buf[i + 2] = Math.round(b)
      buf[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)))
    }
  }
  return buf
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // 每行前置 filter 字节 0
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function wrapIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count

  const entry = Buffer.alloc(16)
  entry[0] = SIZE === 256 ? 0 : SIZE // width
  entry[1] = SIZE === 256 ? 0 : SIZE // height
  entry[2] = 0 // palette
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32BE(0, 8)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12)

  return Buffer.concat([header, entry, png])
}

const outDir = join(__dirname, '..', 'build')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const png = encodePng(buildPixels())
writeFileSync(join(outDir, 'icon.png'), png)
writeFileSync(join(outDir, 'icon.ico'), wrapIco(png))
console.log('图标已生成：build/icon.png, build/icon.ico')
