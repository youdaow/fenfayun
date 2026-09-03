import { ipcMain } from 'electron'
import { startInbox, stopInbox, currentStatus, getLanIP } from '../inbox'

export function registerInboxIPC(notify: () => void): void {
  ipcMain.handle('inbox:start', () => startInbox(() => notify()))
  ipcMain.handle('inbox:stop', () => {
    stopInbox()
    return true
  })
  ipcMain.handle('inbox:status', () => currentStatus())
  ipcMain.handle('inbox:lanip', () => getLanIP())
}
