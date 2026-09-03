import { ipcMain, app } from 'electron'
import * as db from '../db'
import { getDataRoot, getProfilesRoot } from '../paths'

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
    dbPath: ((): string => {
      try {
        return getDataRoot()
      } catch {
        return ''
      }
    })()
  }))
  ipcMain.handle('app:openDataDir', () => {
    void (async () => {
      const { shell } = await import('electron')
      shell.openPath(getDataRoot())
    })()
    return true
  })
}
