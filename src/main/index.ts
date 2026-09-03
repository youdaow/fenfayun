import { app, shell, BrowserWindow, nativeImage, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDB } from './db'
import { registerAccountIPC } from './ipc/account-ipc'
import { registerMaterialIPC } from './ipc/material-ipc'
import { registerTaskIPC } from './ipc/task-ipc'
import { registerFileIPC } from './ipc/file-ipc'
import { registerSettingsIPC } from './ipc/settings-ipc'
import { registerAnalyticsIPC } from './ipc/analytics-ipc'
import { registerInboxIPC } from './ipc/inbox-ipc'
import { registerRelayIPC } from './ipc/relay-ipc'
import { registerAuthIPC } from './ipc/auth-ipc'
import { setRunnerWindow, cancelAll } from './task-runner'
import { startScheduler } from './scheduler'
import { startRelay } from './relay'
import { existsSync } from 'fs'
import { registerMediaProtocol } from './media-protocol'

let mainWindow: BrowserWindow | null = null

function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:refresh')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: '分发云',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initDB()
    electronApp.setAppUserModelId('com.workbuddy.fenfayun')

    // 注册本地媒体协议，供视频预览（支持 Range 拖动进度条）
    registerMediaProtocol()

    // 应用图标：开发期与打包后共用 build/icon.png
    const iconPath = join(app.getAppPath(), 'build', 'icon.png')
    const iconImage = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    mainWindow = createWindow()
    if (iconImage && !iconImage.isEmpty()) mainWindow.setIcon(iconImage)
    setRunnerWindow(mainWindow)

    registerAccountIPC(notifyRenderer)
    registerMaterialIPC(notifyRenderer)
    registerTaskIPC(notifyRenderer)
    registerFileIPC()
    registerSettingsIPC()
    registerAnalyticsIPC(notifyRenderer)
    registerInboxIPC(notifyRenderer)
    registerRelayIPC(notifyRenderer)
    registerAuthIPC()

    startScheduler()
    // 启动远程中转拉取（若已配置）
    startRelay(() => notifyRenderer())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
        setRunnerWindow(mainWindow)
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // 退出前尽量体面地停掉所有自动化子进程
  cancelAll()
})
