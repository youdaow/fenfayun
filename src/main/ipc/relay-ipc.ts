import { ipcMain } from 'electron'
import { getRelayConfig, saveRelayConfig, startRelay, stopRelay } from '../relay'

export function registerRelayIPC(notify: () => void): void {
  ipcMain.handle('relay:get', () => getRelayConfig())
  ipcMain.handle('relay:save', (_e, cfg) => {
    const saved = saveRelayConfig(cfg)
    if (saved.enabled && saved.baseUrl) {
      startRelay(() => notify())
    } else {
      stopRelay()
    }
    notify()
    return saved
  })
  ipcMain.handle('relay:test', async (_e, cfg) => {
    try {
      const base = (cfg.baseUrl ?? '').replace(/\/+$/, '')
      const res = await fetch(`${base}/ping`)
      return { ok: res.ok, status: res.status }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
}
