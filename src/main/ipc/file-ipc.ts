import { ipcMain, dialog, shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import { extname } from 'path'
import { getDbPath } from '../paths'
import { getMp4Duration } from '../media'

export function registerFileIPC(): void {
  ipcMain.handle('file:selectVideo', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择视频文件',
      filters: [{ name: '视频', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'flv', 'webm'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })

  ipcMain.handle('file:selectImage', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择封面图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })

  /** 选择可执行文件（浏览器路径） */
  ipcMain.handle('file:selectExe', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择浏览器可执行文件',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })

  /** 用系统默认程序打开任意文件（如失败截图） */
  ipcMain.handle('file:openFile', async (_e, p: string) => {
    if (!existsSync(p)) return false
    const { shell } = await import('electron')
    await shell.openPath(p)
    return true
  })

  ipcMain.handle('file:stat', (_e, p: string) => {
    if (!existsSync(p)) return null
    const st = statSync(p)
    return {
      path: p,
      name: basename(p),
      size: st.size,
      duration: extname(p).toLowerCase() === '.mp4' ? getMp4Duration(p) : null
    }
  })

  ipcMain.handle('file:openInFolder', (_e, p: string) => {
    if (existsSync(p)) shell.showItemInFolder(p)
    return true
  })

  ipcMain.handle('file:openExternal', (_e, url: string) => {
    if (url) void shell.openExternal(url)
    return true
  })

  ipcMain.handle('file:exists', (_e, p: string) => existsSync(p))

  ipcMain.handle('db:path', () => getDbPath())
}
