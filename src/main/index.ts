import { app, shell, BrowserWindow, nativeImage, protocol, net, Tray, Menu, Notification } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDB, getSetting, setSetting, countUnrecordedWorks } from './db'
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
import { registerMediaProtocol } from './media-protocol'
import { initLogger } from './logger'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 真正退出标记（托盘菜单/更新才置真，点 X 默认只是隐藏） */
let quitting = false

/* ================= 老机器 / 异常显卡兼容 =================
 * Electron 在部分核显、驱动过旧或远程桌面环境下可能 GPU 初始化失败导致白屏。
 * 三重保障：
 *  1) 用户在设置里开「兼容模式」→ 关闭硬件加速（写 safe-mode.json 标记）；
 *  2) 启动写 boot 标记，连续 2 次没能成功进入界面就自动进兼容模式，
 *     避免"装了打不开 / 更新后白屏"的死循环（单次强退或正常关机不误伤）；
 *  3) 命令行 --compat 强制兼容，用于客服远程指导排障。 */
const FLAG_FILE = join(app.getPath('userData'), 'boot-flag.json')
const SAFE_MODE_FILE = join(app.getPath('userData'), 'safe-mode.json')

interface BootFlag {
  ok?: boolean
  fails?: number
  at?: number
}

function readFlag(): BootFlag | null {
  try {
    return existsSync(FLAG_FILE) ? (JSON.parse(readFileSync(FLAG_FILE, 'utf8')) as BootFlag) : null
  } catch {
    return null
  }
}

function writeFlag(v: BootFlag): void {
  try {
    writeFileSync(FLAG_FILE, JSON.stringify(v), 'utf8')
  } catch {
    /* 标记写失败不影响启动 */
  }
}

/** 用户主动开启兼容模式（设置页写标记文件，启动早期即可读到） */
export function isCompatFlagOnDisk(): boolean {
  return existsSync(SAFE_MODE_FILE)
}

let usingCompat = false
let compatReason = ''

function prepareCompatMode(): void {
  const last = readFlag()
  const fails = last?.ok === true ? 0 : (last?.fails ?? 0) + 1
  const forcedByCrash = fails >= 2
  const forcedByUser = isCompatFlagOnDisk() || process.argv.includes('--compat')

  // 记录本次启动尝试（成功进入界面后会 reset）
  writeFlag({ ok: false, fails, at: Date.now() })

  if (forcedByUser || forcedByCrash) {
    usingCompat = true
    compatReason = forcedByCrash && !forcedByUser ? '上次启动异常，已自动启用' : '已按设置启用'
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-software-rasterizer')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    console.warn('[compat] 兼容模式：已关闭硬件加速 ·', compatReason)
  }
}

/** 成功进入界面后调用：清掉失败计数 */
function markBootOk(): void {
  writeFlag({ ok: true, fails: 0, at: Date.now() })
}

prepareCompatMode()

function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return
    new Notification({ title, body: body.slice(0, 140) }).show()
  } catch {
    /* ignore */
  }
}

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

  win.on('ready-to-show', () => {
    win.show()
    // 稳定显示 3 秒才算启动成功，避免"白屏闪一下也算起来"误清计数
    setTimeout(() => markBootOk(), 3000)
  })

  // 关闭按钮默认最小化到托盘（可在设置里关掉该行为）
  win.on('close', (e) => {
    if (!quitting && getSetting('closeToTray', '1') === '1' && tray) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('minimize', () => {
    if (getSetting('minimizeToTray', '0') === '1') win.hide()
  })

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

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    setRunnerWindow(mainWindow)
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(iconPath: string | null): void {
  try {
    const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }))
    tray.setToolTip('分发云 · 多平台视频分发')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开分发云', click: () => showWindow() },
        { type: 'separator' },
        {
          label: '开机自动启动',
          type: 'checkbox',
          checked: getSetting('launchAtLogin', '0') === '1',
          click: (item) => {
            setSetting('launchAtLogin', item.checked ? '1' : '0')
            try {
              app.setLoginItemSettings({ openAtLogin: item.checked })
            } catch {
              /* 开发模式下可能失败 */
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', () => showWindow())
  } catch (err) {
    console.error('[tray] 创建失败', err)
    tray = null
  }
}

/** 登录态每日巡检（headless，静默），过期账号系统通知 */
let lastLoginSweep = 0
async function loginSweep(): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10)
  if (getSetting('lastLoginSweep', '') === dayKey) return
  if (Date.now() - lastLoginSweep < 6 * 3600 * 1000) return
  lastLoginSweep = Date.now()
  try {
    // 标记本次已巡检（登录成功后 account-ipc 会刷新 last_check）
    const { checkAllAccountsSilent } = await import('./ipc/account-ipc')
    const expired = await checkAllAccountsSilent()
    setSetting('lastLoginSweep', dayKey)
    if (expired.length) {
      notify(
        '分发云 · 登录态过期',
        `${expired.length} 个账号需要重新登录：${expired.slice(0, 3).join('、')}${expired.length > 3 ? ' 等' : ''}`
      )
      notifyRenderer()
    }
  } catch (err) {
    console.error('[loginSweep]', err)
  }
}

/** 录数据提醒：有成功但从未录过数据的作品时轻提醒（每天一次） */
function metricsReminder(): void {
  try {
    const dayKey = new Date().toISOString().slice(0, 10)
    if (getSetting('lastMetricsReminder', '') === dayKey) return
    const n = countUnrecordedWorks()
    if (n > 0) {
      setSetting('lastMetricsReminder', dayKey)
      notify('分发云 · 数据回顾', `${n} 条已发布作品还没有录入播放/点赞数据，去「数据分析」补录可生成趋势`)
    }
  } catch {
    /* ignore */
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.whenReady().then(() => {
    initLogger()
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
    createTray(existsSync(iconPath) ? iconPath : null)

    // 同步开机自启开关（以用户在托盘里的最后选择为准）
    try {
      if (getSetting('launchAtLogin', '0') === '1') {
        app.setLoginItemSettings({ openAtLogin: true })
      }
    } catch {
      /* ignore */
    }

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

    // 启动后的静默巡检与提醒（延迟一点，等窗口稳定）
    setTimeout(() => {
      void loginSweep()
      metricsReminder()
    }, 20000)
    setInterval(() => void loginSweep(), 6 * 3600 * 1000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
        setRunnerWindow(mainWindow)
      }
    })
  })
}

app.on('window-all-closed', () => {
  // 托盘存在且开启「关闭到托盘」时不退出
  if (tray && getSetting('closeToTray', '1') === '1') return
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  // 退出前尽量体面地停掉所有自动化子进程
  cancelAll()
})
