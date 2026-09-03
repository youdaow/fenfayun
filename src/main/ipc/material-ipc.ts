import { ipcMain, dialog } from 'electron'
import { existsSync, statSync, copyFileSync } from 'fs'
import { join, basename, extname } from 'path'
import * as db from '../db'
import { getMediaRoot, getCoverRoot } from '../paths'
import { getMp4Duration } from '../media'
import { toMediaUrl } from '../media-protocol'

export function registerMaterialIPC(notify: () => void): void {
  ipcMain.handle('material:list', (_e, keyword = '') => db.listMaterials(keyword))

  /** 用系统文件选择框挑选视频并登记进素材库（可选复制到应用目录） */
  ipcMain.handle('material:pick', async (_e, copyToApp = false) => {
    const res = await dialog.showOpenDialog({
      title: '选择视频素材',
      filters: [{ name: '视频', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'flv', 'webm'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled || !res.filePaths.length) return []

    const created = []
    for (const p of res.filePaths) {
      if (!existsSync(p)) continue
      const st = statSync(p)
      let target = p
      if (copyToApp) {
        target = join(getMediaRoot(), `${Date.now()}_${basename(p)}`)
        try {
          copyFileSync(p, target)
        } catch {
          target = p
        }
      }
      const existing = db.listMaterials().find((m) => m.path === target)
      if (existing) {
        created.push(existing)
        continue
      }
      const duration = extname(target).toLowerCase() === '.mp4' ? getMp4Duration(target) : null
      created.push(
        db.createMaterial({
          name: basename(p),
          path: target,
          size: statSync(target).size,
          duration,
          coverPath: null
        })
      )
      void st
    }
    notify()
    return created
  })

  ipcMain.handle('material:update', (_e, id: number, patch: Record<string, unknown>) => {
    db.updateMaterial(id, patch as Parameters<typeof db.updateMaterial>[1])
    notify()
    return true
  })

  ipcMain.handle('material:remove', (_e, id: number) => {
    db.removeMaterial(id)
    notify()
    return true
  })

  ipcMain.handle('cover:root', () => getCoverRoot())

  /** 本地视频路径 → 可播放的 vdist-media:// URL */
  ipcMain.handle('material:mediaUrl', (_e, path: string) => {
    if (!existsSync(path)) return null
    return toMediaUrl(path)
  })
}
