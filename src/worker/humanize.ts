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

/* ================= 风控 / 验证码看门狗 ================= */

const CAPTCHA_TEXTS = [
  '拖动滑块', '请完成下方拼图', '拼图验证', '滑动验证', '安全验证', '点击按钮进行验证',
  '输入验证码', '图形验证', 'verify to continue', 'complete the captcha', 'slide to verify'
]

/** 页面上是否出现验证码/风控特征（可见文本或常见容器） */
export async function captchaPresent(page: Page): Promise<boolean> {
  try {
    return await page.evaluate((texts: string[]) => {
      const t = (document.body?.innerText || '').toLowerCase()
      if (texts.some((s) => t.includes(s.toLowerCase()))) return true
      const frameSelectors = [
        'iframe[src*="captcha"]', 'iframe[src*="verify"]', 'iframe[id*="captcha"]',
        '.captcha', '[class*="captcha"]', '[class*="slider-verify"]', '.geetest_panel',
        '.verify-bar', '#captcha_div'
      ]
      return frameSelectors.some((sel) => {
        const el = document.querySelector(sel)
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 40 && r.height > 20
      })
    }, CAPTCHA_TEXTS)
  } catch {
    return false
  }
}

/**
 * 验证码看门狗：检测到验证码时保持打开浏览器并周期性回报，
 * 等待用户手动完成（默认最长 waitMs），期间不判失败。
 * 返回 true = 验证码已消失/从未出现；false = 超时仍未通过。
 */
export async function waitCaptchaCleared(
  page: Page,
  onProgress: (status: string, message?: string, percent?: number) => void,
  waitMs = 180000,
  percent = 85
): Promise<boolean> {
  if (!(await captchaPresent(page))) return true
  onProgress('waiting-captcha', '检测到验证码/安全验证，请在浏览器窗口中手动完成…', percent)
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await delay(2500, 3500)
    if (!(await captchaPresent(page))) {
      onProgress('publishing', '验证已通过，继续流程…', percent)
      return true
    }
  }
  return false
}

/**
 * assist 人工兜底：内容已填好，等待用户在浏览器里自己点发布。
 * 轮询检测成功文案 / 页面跳离发布页，最长 waitMs。
 */
export async function waitForManualPublish(
  page: Page,
  successTexts: string[],
  onProgress: (status: string, message?: string, percent?: number) => void,
  waitMs = 300000,
  startUrl = ''
): Promise<boolean> {
  onProgress('waiting-manual', '请在弹出的浏览器窗口中确认并发布（本页面会自动检测发布结果）', 80)
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await delay(2000, 3000)
    try {
      const ok = await page.evaluate((texts: string[]) => {
        const t = document.body?.innerText || ''
        return texts.some((s) => t.includes(s))
      }, successTexts)
      if (ok) return true
      // 页面已跳离发布页（多数平台发布成功后会跳转）
      if (startUrl && page.url() !== startUrl && !/login|passport/.test(page.url())) {
        // 跳走且没在登录，多半成功了
        return true
      }
    } catch {
      /* 页面导航中，忽略瞬时异常 */
    }
  }
  return false
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
