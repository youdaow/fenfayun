import { existsSync } from 'fs'
import { join } from 'path'
import { chromium, type BrowserContext } from 'playwright-core'

/** 按优先级探测本机可用的 Chromium 内核浏览器 */
export function detectBrowser(): { executablePath?: string; channel?: 'chrome' | 'msedge'; label: string } {
  const envPath = process.env.VDIST_BROWSER_PATH
  if (envPath && existsSync(envPath)) {
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
    [join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge (x64)']
  ]

  for (const [p, label] of candidates) {
    if (existsSync(p)) return { executablePath: p, label }
  }

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
    '未检测到可用的浏览器。请安装 Google Chrome 或 Microsoft Edge，' +
      '也可以在「设置 → 浏览器路径」里手动指定 chrome.exe 的完整路径。'
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
      '--start-maximized'
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
