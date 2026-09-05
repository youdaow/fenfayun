import { existsSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { chromium, type BrowserContext } from 'playwright-core'

/** 从注册表 App Paths 读浏览器绝对路径（很多电脑浏览器装在 D 盘等非常规位置） */
function fromRegistry(exeName: string): string | null {
  if (process.platform !== 'win32') return null
  const roots = [
    `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    // 32 位方式安装的浏览器
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
  ]
  for (const key of roots) {
    try {
      const out = execFileSync('reg.exe', ['query', key, '/ve'], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
      })
      const m = out.match(/REG_SZ\s+([A-Za-z]:\\[^\r\n]+\.exe)/i)
      if (m && existsSync(m[1].trim())) return m[1].trim()
    } catch {
      /* 该注册表项不存在则继续 */
    }
  }
  return null
}

/** 按优先级探测本机可用的 Chromium 内核浏览器 */
export function detectBrowser(): { executablePath?: string; channel?: 'chrome' | 'msedge'; label: string } {
  const envPath = process.env.VDIST_BROWSER_PATH
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(
        `设置的浏览器路径不存在：${envPath}，请在「设置 → 浏览器路径」重新选择或留空自动探测`
      )
    }
    return { executablePath: envPath, label: `自定义：${envPath}` }
  }

  const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env['LOCALAPPDATA'] ?? ''

  const candidates: [string, string][] = [
    [join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Google Chrome'],
    [join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Google Chrome (x86)'],
    [join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Google Chrome (用户级)'],
    [join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge'],
    [join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge (x64)'],
    [join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge (用户级)']
  ]

  for (const [p, label] of candidates) {
    if (existsSync(p)) return { executablePath: p, label }
  }

  // 常见路径没中：查注册表 App Paths（浏览器装 D 盘 / 自定义目录的情况）
  const regChrome = fromRegistry('chrome.exe')
  if (regChrome) return { executablePath: regChrome, label: `Google Chrome（注册表）：${regChrome}` }
  const regEdge = fromRegistry('msedge.exe')
  if (regEdge) return { executablePath: regEdge, label: `Microsoft Edge（注册表）：${regEdge}` }

  // 最后尝试 playwright 自带内核（若用户执行过 playwright install）
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) {
      return { executablePath: bundled, label: 'Playwright Chromium' }
    }
  } catch {
    /* ignore */
  }

  throw new Error(
    '未检测到可用的浏览器。请安装 Google Chrome 或 Microsoft Edge（任一即可），' +
      '或在「设置 → 浏览器路径」手动指定 chrome.exe / msedge.exe 的完整路径。'
  )
}

const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
if (!window.chrome) { window.chrome = {}; }
window.chrome.runtime = window.chrome.runtime || {};
const origQuery = window.navigator.permissions && window.navigator.permissions.query;
if (origQuery) {
  window.navigator.permissions.query = (p) =>
    p && p.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(p);
}
`

export interface LaunchConfig {
  profileDir: string
  headless?: boolean
  slowMo?: number
  /** 代理服务器，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080 */
  proxy?: string
  /** 低配 / 核显兼容模式：禁用 GPU 加速 */
  disableGpu?: boolean
}

export async function launchContext(cfg: LaunchConfig): Promise<BrowserContext> {
  const browser = detectBrowser()
  console.log(`[browser] 使用 ${browser.label}`)

  const context = await chromium.launchPersistentContext(cfg.profileDir, {
    executablePath: browser.executablePath,
    channel: browser.executablePath ? undefined : browser.channel,
    headless: cfg.headless ?? false,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    slowMo: cfg.slowMo ?? 0,
    proxy: cfg.proxy ? { server: cfg.proxy } : undefined,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process',
      '--start-maximized',
      // 老显卡 / 驱动异常的机器上，视频编辑页容易黑屏闪烁；由设置开关控制
      ...(cfg.disableGpu ? ['--disable-gpu', '--disable-software-rasterizer'] : [])
    ]
  })

  await context.addInitScript(STEALTH_SCRIPT)
  return context
}

export async function closeContext(ctx: BrowserContext | undefined): Promise<void> {
  if (!ctx) return
  try {
    await ctx.close()
  } catch {
    /* 忽略关闭异常 */
  }
}
