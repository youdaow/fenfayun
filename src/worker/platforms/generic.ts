import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOutcome, ProgressFn } from './types'
import {
  delay,
  fillFirst,
  setFile,
  clickFirst,
  withTimeout,
  settle,
  scrapeProfile,
  waitCaptchaCleared,
  waitForManualPublish
} from '../humanize'
import type { PlatformMeta, PlatformId } from '../../shared/platforms'

/**
 * 通用适配器：用一组宽松的选择器 + 文案判断，覆盖大多数"上传页结构相似"的平台。
 * 不追求每个平台 100% 精确，目标是能走完"传文件 → 填标题/描述/标签 → 点发布"主流程。
 * 页面差异大的平台应另写 dedicated 适配器（level=full）。
 *
 * 选择器按"命中概率"排序，第一个可见即用。
 */
const VIDEO_INPUT = [
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*="mp4"]',
  '.upload input[type="file"]',
  '[class*="upload"] input[type="file"]',
  'input[type="file"]'
]

const TITLE_INPUT = [
  'input[placeholder*="标题"]',
  'input[placeholder*="title" i]',
  '.title input',
  '[class*="title"] input',
  'input[maxlength="80"]'
]

const DESC_INPUT = [
  'textarea[placeholder*="简介"]',
  'textarea[placeholder*="描述"]',
  'textarea[placeholder*="正文"]',
  'textarea[placeholder*="说点什么"]',
  '[contenteditable="true"]',
  'textarea'
]

const TAG_INPUT = [
  'input[placeholder*="标签"]',
  'input[placeholder*="话题"]',
  'input[placeholder*="tag" i]',
  '[class*="tag"] input'
]

const PUBLISH_BTN = [
  'button:has-text("发布")',
  'button:has-text("投稿")',
  'button:has-text("发表")',
  'button:has-text("提交")',
  'button:has-text("确定")',
  '[class*="submit"]',
  '[class*="publish"]'
]

const SUCCESS_TEXT = ['发布成功', '投稿成功', '发表成功', '提交成功', '已发布', '审核中']

export function createGenericAdapter(meta: PlatformMeta): PlatformAdapter {
  const id = meta.id

  async function checkLogin(page: Page): Promise<LoginState> {
    await page.goto(meta.uploadUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2000, 3500)
    const url = page.url().toLowerCase()
    // 被重定向到登录页视为未登录
    if (/login|passport|signin|sign-in|auth/.test(url)) return { loggedIn: false }
    // 页面上有明确"登录"按钮且没有上传入口，视为未登录
    const hasUpload = await page
      .locator('input[type="file"], [class*="upload"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    if (!hasUpload) {
      const hasLoginBtn = await page
        .locator('button:has-text("登录"), a:has-text("登录")')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)
      if (hasLoginBtn) return { loggedIn: false }
    }
    const profile = await scrapeProfile(page)
    return { loggedIn: true, ...profile }
  }

  async function publish(
    page: Page,
    options: import('../../shared/types').PublishOptions,
    onProgress: ProgressFn
  ): Promise<PublishOutcome> {
    const start = Date.now()
    try {
      onProgress('launching', `打开 ${meta.name} 发布页…`, 5)
      await page.goto(meta.uploadUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 2500, 4000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(page, VIDEO_INPUT, options.videoPath)
      if (!ok) throw new Error('未找到上传入口，页面结构可能已改版')

      onProgress('uploading', '视频上传中…', 30)
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return (
              t.includes('上传成功') ||
              t.includes('重新上传') ||
              t.includes('转码') ||
              !!document.querySelector('video')
            )
          },
          { timeout: 900000, polling: 2500 }
        ),
        900000,
        `${meta.name} 视频上传`
      )

      onProgress('filling', '填写标题与描述…', 65)
      await delay(2000, 3500)

      await fillFirst(page, TITLE_INPUT, options.title.slice(0, meta.titleMax))
      await delay(600, 1200)

      const desc = options.description + (options.tags.length ? `\n${options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}` : '')
      if (desc.trim()) {
        await fillFirst(page, DESC_INPUT, desc.slice(0, meta.descMax))
        await delay(800, 1500)
      }

      // 若标签有独立输入框（标题/描述之外），逐个填
      if (options.tags.length) {
        const tagLoc = page.locator(TAG_INPUT.join(', ')).first()
        if (await tagLoc.isVisible({ timeout: 1500 }).catch(() => false)) {
          for (const t of options.tags.slice(0, meta.tagMax)) {
            await tagLoc.fill(t.replace(/^#/, '')).catch(() => {})
            await page.keyboard.press('Enter').catch(() => {})
            await delay(200, 500)
          }
        }
      }

      if (options.coverPath && meta.supportCover) {
        await setFile(
          page,
          ['input[type="file"][accept*="image"]', '[class*="cover"] input[type="file"]'],
          options.coverPath
        ).catch(() => false)
        await delay(1500, 2500)
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1000, 2000)
      const posted = await clickFirst(page, PUBLISH_BTN)
      if (!posted) throw new Error('未找到发布按钮，页面结构可能已改版')

      // 有的平台点发布后弹验证码：等用户手动过
      await waitCaptchaCleared(page, onProgress, 180000, 92)

      // 等待成功提示或跳转
      await withTimeout(
        page.waitForFunction(
          (texts) => {
            const t = document.body.innerText || ''
            return texts.some((s: string) => t.includes(s))
          },
          SUCCESS_TEXT,
          { timeout: 180000, polling: 1500 }
        ),
        180000,
        `${meta.name} 发布确认`
      )

      onProgress('success', `${meta.name} 发布成功`, 100)
      return { success: true, url: page.url(), duration: Date.now() - start }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start
      }
    }
  }

  return { id, checkLogin, publish }
}

/** 兜底适配器（level=assist）：自动传文件 + 填表后停下，等用户人工点发布 */
export function createAssistAdapter(meta: PlatformMeta): PlatformAdapter {
  const base = createGenericAdapter(meta)
  return {
    ...base,
    async publish(page, options, onProgress) {
      const start = Date.now()
      try {
        onProgress('launching', `打开 ${meta.name} 发布页…`, 5)
        await page.goto(meta.uploadUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await settle(page, 2500, 4000)

        onProgress('uploading', '上传视频文件…', 20)
        const ok = await setFile(page, VIDEO_INPUT, options.videoPath)
        if (!ok) throw new Error('未找到上传入口')

        onProgress('uploading', '视频上传中…', 40)
        await withTimeout(
          page.waitForFunction(
            () => {
              const t = document.body.innerText || ''
              return t.includes('上传成功') || t.includes('重新上传') || !!document.querySelector('video')
            },
            { timeout: 900000, polling: 2500 }
          ),
          900000,
          `${meta.name} 视频上传`
        )

        onProgress('filling', '自动填写内容…', 65)
        await delay(2000, 3500)
        await fillFirst(page, TITLE_INPUT, options.title.slice(0, meta.titleMax))
        await delay(500, 1000)
        const desc = options.description + (options.tags.length ? `\n${options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}` : '')
        if (desc.trim()) await fillFirst(page, DESC_INPUT, desc.slice(0, meta.descMax))

        // 该平台页面复杂：等待用户在浏览器里手动点发布，并尽力检测成功
        const startUrl = page.url()
        const manualOk = await waitForManualPublish(page, SUCCESS_TEXTS_ALL, onProgress, 300000, startUrl)
        if (manualOk) {
          onProgress('success', `${meta.name} 发布成功（人工确认）`, 100)
          return { success: true, url: page.url(), duration: Date.now() - start }
        }
        return {
          success: false,
          error: `${meta.name}：等待手动发布超时。若其实已发布成功，可在「发布记录」里忽略本条`,
          duration: Date.now() - start
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          duration: Date.now() - start
        }
      }
    }
  }
}

const SUCCESS_TEXTS_ALL = [...SUCCESS_TEXT, 'Your video is live', 'Posted', 'Shared']
