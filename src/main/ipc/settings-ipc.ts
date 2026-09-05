import { ipcMain, app, dialog, shell } from 'electron'
import * as db from '../db'
import { getDataRoot, getProfilesRoot, getDbPath } from '../paths'
import { join } from 'path'

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    db.setSetting(key, value)
    return true
  })
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataRoot: getDataRoot(),
    profilesRoot: getProfilesRoot(),
    dbPath: getDbPath()
  }))
  ipcMain.handle('app:openDataDir', () => {
    void shell.openPath(getDataRoot())
    return true
  })

  /** 开机自启（Windows 登录项） */
  ipcMain.handle('app:setLaunchAtLogin', (_e, enabled: boolean) => {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('app:getLaunchAtLogin', () => {
    try {
      return app.getLoginItemSettings().openAtLogin
    } catch {
      return false
    }
  })

  /** 备份数据库：弹出保存框，把当前 SQLite 备份到目标文件 */
  ipcMain.handle('app:backupDb', async () => {
    const res = await dialog.showSaveDialog({
      title: '备份数据库',
      defaultPath: `分发云备份_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) return null
    await db.backupDatabase(res.filePath)
    return res.filePath
  })

  /** 恢复数据库：选备份文件，替换当前库（重启后生效） */
  ipcMain.handle('app:restoreDb', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择备份文件',
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return null
    const src = res.filePaths[0]
    // 先自动备份现状，再覆盖，失败可回退
    await db.backupDatabase(join(getDataRoot(), `auto_before_restore_${Date.now()}.db`))
    await db.restoreDatabase(src)
    return src
  })
}
