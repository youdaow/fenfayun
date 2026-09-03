import type { BrowserContext, Page, Locator } from 'playwright-core'

/** 随机延迟，模拟真人节奏 */
export function delay(min = 500, max = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min)
  return new Promise((r) => setTimeout(r, ms))
}

/** 带超时的 Promise 包装，超时后抛出可读错误 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout
  const timer = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`)), ms)
  })
  return Promise.race([p, timer]).finally(() => clearTimeout(t!)) as Promise<T>
}

/** 拟人点击：先移动鼠标再点，避免固定坐标被识别 */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const box = await locator.boundingBox().catch(() => null)
  if (!box) {
    await locator.click({ timeout: 10000 })
    return
  }
  const x = box.x + box.width * (0.3 + Math.random() * 0.4)
  const y = box.y + box.height * (0.3 + Math.random() * 0.4)
  await page.mouse.move(x, y, { steps: 3 + Math.floor(Math.random() * 5) })
  await delay(120, 320)
  await page.mouse.click(x, y)
}

/** 逐字输入 */
export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.click()
  await delay(150, 350)
  await locator.pressSequentially(text, { delay: 40 + Math.floor(Math.random() * 90) })
}

/** 在一组候选选择器里找第一个可见元素 */
export async function firstVisible(
  page: Page,
  selectors: string[],
  timeout = 3000
): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    try {
      if (await loc.isVisible({ timeout })) return loc
    } catch {
      /* 继续尝试下一个 */
    }
  }
  return null
}

/** 点击第一个可见的候选元素 */
export async function clickFirst(
  page: Page,
  selectors: string[],
  timeout = 3000
): Promise<boolean> {
  const loc = await firstVisible(page, selectors, timeout)
  if (!loc) return false
  try {
    await humanClick(page, loc)
    return true
  } catch {
    return false
  }
}

/** 往第一个可见的输入框填内容 */
export async function fillFirst(
  page: Page,
  selectors: string[],
  text: string,
  timeout = 3000
): Promise<boolean> {
  const loc = await firstVisible(page, selectors, timeout)
  if (!loc) return false
  try {
    await loc.click()
    await delay(100, 300)
    await loc.fill('')
    await loc.pressSequentially(text, { delay: 20 + Math.floor(Math.random() * 50) })
    return true
  } catch {
    try {
      await loc.fill(text)
      return true
    } catch {
      return false
    }
  }
}

/** 上传文件：找到隐藏的 input[type=file] */
export async function setFile(
  page: Page,
  fileSelectors: string[],
  filePath: string
): Promise<boolean> {
  for (const sel of fileSelectors) {
    const input = page.locator(sel).first()
    try {
      if ((await input.count()) > 0) {
        await input.setInputFiles(filePath, { timeout: 15000 })
        return true
      }
    } catch {
      /* 试下一个 */
    }
  }
  return false
}

/** 等待页面进入稳定态 */
export async function settle(page: Page, min = 1500, max = 3000): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await delay(min, max)
}

export function noop(_ctx?: BrowserContext): void {
  /* 占位：保持接口可扩展 */
}

/**
 * 从页面里尽力抓取头像与粉丝数（通用兜底）。
 * 头像：优先找 img 且 src 含 avatar/头像 关键字，否则取当前域名下的首个人物头像候选。
 * 粉丝：匹配页面文本中的「粉丝 xxx」模式。
 */
export async function scrapeProfile(page: Page): Promise<{ avatar?: string; fans?: string }> {
  const result: { avatar?: string; fans?: string } = {}
  try {
    const avatar = await page
      .evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'))
        const pick = imgs.find(
          (i) => /avatar|头像|profile|head|user/i.test((i.getAttribute('src') || '') + (i.getAttribute('alt') || ''))
        )
        return pick?.getAttribute('src') || ''
      })
      .catch(() => '')
    if (avatar) result.avatar = avatar

    const fans = await page
      .evaluate(() => {
        const t = document.body?.innerText || ''
        const m = t.match(/粉丝[：: ]*([\d.]+[万亿]?)/)
        return m ? m[1] : ''
      })
      .catch(() => '')
    if (fans) result.fans = fans
  } catch {
    /* 忽略抓取失败 */
  }
  return result
}
