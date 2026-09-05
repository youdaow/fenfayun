import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOutcome } from './types'
import {
  delay,
  fillFirst,
  setFile,
  clickFirst,
  withTimeout,
  settle,
  scrapeProfile,
  waitCaptchaCleared
} from '../humanize'

const HOME = 'https://www.tiktok.com/creator-center'
const UPLOAD = 'https://www.tiktok.com/creator-center/upload'

export const tiktok: PlatformAdapter = {
  id: 'tiktok',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 3000, 4500)
    const url = page.url()
    if (url.includes('/login') || url.includes('signup') || url.includes('signin')) {
      return { loggedIn: false }
    }
    const name = await page
      .locator('[class*="username"], [class*="nickname"], [class*="avatar"] img')
      .first()
      .getAttribute('alt', { timeout: 5000 })
      .catch(() => null)
    const profile = await scrapeProfile(page)
    return { loggedIn: true, nickname: name || undefined, ...profile }
  },

  async publish(
    page: Page,
    options: import('../../shared/types').PublishOptions,
    onProgress: (s: string, m?: string, p?: number) => void
  ): Promise<PublishOutcome> {
    const start = Date.now()
    try {
      onProgress('launching', '打开 TikTok 创作者中心…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 3000, 4500)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        ['input[type="file"][accept*="video"]', 'input[type="file"]'],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口')

      onProgress('uploading', '视频上传中…', 30)
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('Uploaded') || t.includes('Upload complete') || !!document.querySelector('video')
          },
          { timeout: 900000, polling: 2500 }
        ),
        900000,
        'TikTok 视频上传'
      )

      onProgress('filling', '填写标题与话题…', 65)
      await delay(2000, 3500)

      await fillFirst(
        page,
        ['[contenteditable="true"][data-text="true"]', '[class*="caption"] [contenteditable="true"]', 'textarea[placeholder*="caption" i]', '[contenteditable="true"]'],
        options.title.slice(0, 150)
      )
      await delay(600, 1200)

      if (options.tags.length) {
        // TikTok 话题以 # 形式追加到 caption
        const hashTags = options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
        await fillFirst(page, ['[contenteditable="true"]'], `${options.title} ${hashTags}`.slice(0, 2200))
        await delay(800, 1500)
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1000, 2000)
      const posted = await clickFirst(page, [
        'button:has-text("Post")',
        'button:has-text("Publish")',
        '[class*="publish"] button',
        '[class*="post-btn"]'
      ])
      if (!posted) throw new Error('未找到 Post 按钮')

      // 平台常在提交时弹滑块/拼图：等用户手动通过后再等成功文案
      await waitCaptchaCleared(page, onProgress, 180000, 92)

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('posted') || t.includes('Published') || t.includes('发布成功')
          },
          { timeout: 180000, polling: 2000 }
        ),
        180000,
        'TikTok 发布确认'
      )

      onProgress('success', 'TikTok 发布成功', 100)
      return { success: true, url: page.url(), duration: Date.now() - start }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start
      }
    }
  }
}
