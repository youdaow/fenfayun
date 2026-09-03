import { existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import * as db from './db'
import { getMediaRoot } from './paths'
import { getMp4Duration } from './media'

/**
 * 远程中转拉取器：定时从用户自己的服务器拉取 iPad 上传的视频到素材库。
 * 服务器端跑 server/server.js（零依赖中转）。
 */

let timer: NodeJS.Timeout | null = null
let running = false

export interface RelayConfig {
  enabled: boolean
  baseUrl: string
  token: string
  intervalSec: number
}

export function getRelayConfig(): RelayConfig {
  return {
    enabled: db.getSetting('relay.enabled', '0') === '1',
    baseUrl: db.getSetting('relay.baseUrl', '').replace(/\/+$/, ''),
    token: db.getSetting('relay.token', ''),
    intervalSec: Math.max(10, parseInt(db.getSetting('relay.intervalSec', '60'), 10) || 60)
  }
}

export function saveRelayConfig(cfg: Partial<RelayConfig>): RelayConfig {
  if (cfg.enabled !== undefined) db.setSetting('relay.enabled', cfg.enabled ? '1' : '0')
  if (cfg.baseUrl !== undefined) db.setSetting('relay.baseUrl', cfg.baseUrl)
  if (cfg.token !== undefined) db.setSetting('relay.token', cfg.token)
  if (cfg.intervalSec !== undefined) db.setSetting('relay.intervalSec', String(cfg.intervalSec))
  return getRelayConfig()
}

export function startRelay(onFile: (name: string) => void): void {
  stopRelay()
  const cfg = getRelayConfig()
  if (!cfg.enabled || !cfg.baseUrl) return

  const sweep = async () => {
    if (running) return
    running = true
    try {
      const files = await fetchList(cfg)
      for (const f of files) {
        const ok = await downloadAndRegister(cfg, f.name)
        if (ok) {
          await fetch(`${cfg.baseUrl}/delete/${encodeURIComponent(f.name)}?token=${encodeURIComponent(cfg.token)}`, {
            method: 'POST'
          }).catch(() => {})
          onFile(f.name)
        }
      }
    } catch (err) {
      console.error('[relay] 拉取失败', err)
    } finally {
      running = false
    }
  }

  void sweep()
  timer = setInterval(sweep, cfg.intervalSec * 1000)
}

export function stopRelay(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function fetchList(cfg: RelayConfig): Promise<{ name: string }[]> {
  const res = await fetch(`${cfg.baseUrl}/list?token=${encodeURIComponent(cfg.token)}`)
  if (!res.ok) throw new Error(`服务器返回 ${res.status}`)
  const data = (await res.json()) as { ok: boolean; files?: { name: string }[] }
  return data.files ?? []
}

async function downloadAndRegister(cfg: RelayConfig, name: string): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.baseUrl}/download/${encodeURIComponent(name)}?token=${encodeURIComponent(cfg.token)}`)
    if (!res.ok) return false
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return false

    const safeName = basename(name)
    const ext = extname(safeName).toLowerCase()
    const target = join(getMediaRoot(), `${Date.now()}_${randomUUID().slice(0, 6)}${ext}`)
    writeFileSync(target, buf)

    const existing = db.listMaterials().find((m) => m.path === target)
    if (!existing) {
      db.createMaterial({
        name: safeName,
        path: target,
        size: buf.length,
        duration: ext === '.mp4' ? getMp4Duration(target) : null,
        coverPath: null
      })
    }
    return true
  } catch (err) {
    console.error('[relay] 下载失败', name, err)
    return false
  }
}
