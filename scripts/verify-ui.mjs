/* 临时验证脚本：无头 Chrome + stub API 验证新 UI（跑完即删） */
import { chromium } from 'playwright-core'
import { existsSync, readFileSync } from 'fs'
import { createServer } from 'http'
import { join, extname } from 'path'

/* 内置静态服务（file:// 会拦截 ES module） */
const ROOT = decodeURIComponent(new URL('../out/renderer', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  try {
    const body = readFileSync(p)
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('nf')
  }
})
await new Promise((r) => server.listen(3977, '127.0.0.1', r))

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const exe = CHROME_PATHS.find((p) => existsSync(p))
if (!exe) throw new Error('no chrome/edge found')

const PAGE_URL = 'http://127.0.0.1:3977/index.html'
const results = []
const check = (name, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`
  results.push(line)
  console.log(line)
}

const browser = await chromium.launch({ executablePath: exe, headless: true })

/* ---------- 场景 A：有密码 → 锁屏 → 解锁 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } })
  await ctx.addInitScript(() => {
    const unsub = () => {}
    const d = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }
    window.api = {
      isBusy: async () => false,
      onRefresh: () => unsub,
      authStatus: async () => ({ hasPassword: true }),
      authVerify: async (p) => ({ ok: p === '1234' }),
      getStats: async () => ({
        accountOnline: 3, accountTotal: 5, materialTotal: 12, taskPending: 2,
        logToday: 4, logSuccess: 30, logFailed: 6,
        last7Days: [{ date: d(0), count: 3 }, { date: d(1), count: 5 }, { date: d(3), count: 2 }, { date: d(5), count: 4 }], byPlatform: []
      }),
      getLogs: async () => [],
      getSettings: async () => ({ accent: 'ocean' }),
      setSetting: async () => true,
      getAppInfo: async () => ({ version: '0.1.0', dataRoot: 'C:\\x', profilesRoot: 'C:\\y' }),
      inboxStatus: async () => ({ running: false, port: 3870, url: '', ip: '' }),
      relayGet: async () => ({ enabled: false, baseUrl: '', token: '', intervalSec: 60 })
    }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => check('页面无 JS 错误', false, String(e).slice(0, 120)))
  await page.goto(PAGE_URL)
  await page.waitForTimeout(800)

  // 锁屏元素
  check('锁屏显示品牌「分发云」', await page.locator('text=分发云').first().isVisible())
  check('锁屏有密码输入框', (await page.locator('input[type=password]').count()) === 1)
  const theme0 = await page.evaluate(() => document.documentElement.dataset.theme)
  check('默认深色主题', theme0 === 'dark', theme0)

  // 错误密码
  await page.fill('input[type=password]', '9999')
  await page.click('button:has-text("解锁")')
  await page.waitForTimeout(400)
  check('错误密码有提示', await page.locator('text=密码不正确').isVisible())

  // 正确密码
  await page.fill('input[type=password]', '1234')
  await page.click('button:has-text("解锁")')
  await page.waitForSelector('nav', { timeout: 3000 })
  check('解锁后进入工作台', await page.locator('nav >> text=账号管理').isVisible())

  // 品牌与渐变
  const brandHtml = await page.evaluate(() => {
    const els = [...document.querySelectorAll('aside .text-gradient')]
    return els.map((e) => e.textContent).join(',')
  })
  check('侧边栏品牌名分发云(渐变字)', brandHtml.includes('分发云'), brandHtml)

  // 深色变量（启动时已应用存的配色 ocean）
  check('启动时应用已存配色 ocean', (await page.evaluate(() => document.documentElement.dataset.accent)) === 'ocean')
  const darkVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-500').trim()
  )
  check('深色 ocean brand-500=#3b82f6', darkVar === '#3b82f6', darkVar)
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('深色页面底色(中性炭黑)', darkBg === 'rgb(15, 17, 21)', darkBg)

  // 主题切换 → 浅色
  await page.click('button[title="浅色"]')
  await page.waitForTimeout(400)
  const theme1 = await page.evaluate(() => document.documentElement.dataset.theme)
  const lightVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-500').trim()
  )
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('浅色主题生效', theme1 === 'light', theme1)
  check('浅色 ocean brand-500=#2563eb', lightVar === '#2563eb', lightVar)
  check('浅色页面底色(标准白灰)', lightBg === 'rgb(245, 245, 247)', lightBg)

  // localStorage 持久化
  const saved = await page.evaluate(() => localStorage.getItem('vd-theme'))
  check('主题偏好已持久化', saved === 'light', saved)

  // 概览图表：7 根渐变柱
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('.group .rounded-t-lg')].filter((e) =>
      e.className.includes('bg-gradient-to-b')
    ).length
  )
  check('近7天柱状图渐变渲染', bars === 4, `bars=${bars}`)

  // 设置页：配色方案实时切换
  await page.click('nav >> text=设置')
  await page.waitForSelector('button[title="樱花粉"]')
  const accentCards = await page.evaluate(() =>
    ['蓝绿', '海洋蓝', '暗夜紫', '日落橙', '樱花粉', '翡翠绿'].filter(
      (n) => document.querySelector(`button[title="${n}"]`) !== null
    ).length
  )
  check('6 套配色方案可选', accentCards === 6, `cards=${accentCards}`)
  await page.click('button[title="樱花粉"]')
  await page.waitForTimeout(300)
  const sakuraVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-500').trim()
  )
  check(
    '切樱花粉实时生效',
    (await page.evaluate(() => document.documentElement.dataset.accent)) === 'sakura' && ['#ec4899', '#db2777'].includes(sakuraVar),
    sakuraVar
  )
  await page.screenshot({ path: 'verify-accent-sakura.png' })
  await page.click('nav >> text=概览')
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'verify-main-light.png' })
  await page.click('button[title="深色"]')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'verify-main-dark.png' })
  await ctx.close()
}

/* ---------- 场景 B：无密码 → 直接进入 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } })
  await ctx.addInitScript(() => {
    const unsub = () => {}
    window.api = {
      isBusy: async () => false,
      onRefresh: () => unsub,
      authStatus: async () => ({ hasPassword: false }),
      getSettings: async () => ({}),
      getStats: async () => ({
        accountOnline: 0, accountTotal: 0, materialTotal: 0, taskPending: 0,
        logToday: 0, logSuccess: 0, logFailed: 0, last7Days: [], byPlatform: []
      }),
      getLogs: async () => []
    }
  })
  const page = await ctx.newPage()
  await page.goto(PAGE_URL)
  await page.waitForSelector('nav', { timeout: 3000 })
  check('无密码时直接进入', await page.locator('nav >> text=设置').isVisible())
  const theme2 = await page.evaluate(() => document.documentElement.dataset.theme)
  check('无密码默认仍是深色', theme2 === 'dark', theme2)
  await ctx.close()
}

await browser.close()
server.close()
console.log(results.join('\n'))
const fails = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
