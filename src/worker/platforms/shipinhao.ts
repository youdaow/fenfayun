import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOptions, PublishOutcome } from './types'
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

const HOME = 'https://channels.weixin.qq.com/platform/creator'
const UPLOAD = 'https://channels.weixin.qq.com/platform/post/create'

export const shipinhao: PlatformAdapter = {
  id: 'shipinhao',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2500, 4000)
    const url = page.url()
    if (url.includes('login') || url.includes('signin')) return { loggedIn: false }

    const name = await page
      .locator('[class*="nickname"], [class*="user-name"], .account-name')
      .first()
      .textContent({ timeout: 5000 })
      .catch(() => null)
    const profile = await scrapeProfile(page)
    return { loggedIn: true, nickname: name?.trim() || undefined, ...profile }
  },

  async publish(
    page: Page,
    options: PublishOptions,
    onProgress: (s: string, m?: string, p?: number) => void
  ): Promise<PublishOutcome> {
    const start = Date.now()
    try {
      onProgress('launching', '打开视频号创作中心…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 3000, 5000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        [
          'input[type="file"][accept*="video"]',
          '.post-album input[type="file"]',
          '[class*="upload"] input[type="file"]',
          'input[type="file"]'
        ],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口')

      onProgress('uploading', '视频上传中…', 30)
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('上传成功') || t.includes('重新上传') || !!document.querySelector('video')
          },
          { timeout: 900000, polling: 2000 }
        ),
        900000,
        '视频号视频上传'
      )

      onProgress('filling', '填写描述…', 65)
      await delay(2000, 3500)

      const body =
        options.title +
        (options.description ? `\n${options.description}` : '') +
        (options.tags.length ? `\n${options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}` : '')

      await fillFirst(
        page,
        [
          '[class*="desc"] [contenteditable="true"]',
          '.editor [contenteditable="true"]',
          'textarea[placeholder*="描述"]',
          'textarea'
        ],
        body.slice(0, 1000)
      )
      await delay(1000, 2000)

      if (options.coverPath) {
        await setFile(
          page,
          ['[class*="cover"] input[type="file"]', 'input[type="file"][accept*="image"]'],
          options.coverPath
        ).catch(() => false)
        await delay(1500, 2500)
        await clickFirst(page, ['button:has-text("确定")', 'button:has-text("完成")'])
      }

      // 视频号暂不开放平台内定时，由本工具调度器在到点时才发起发布
      onProgress('publishing', '提交发布…', 90)
      await delay(1200, 2200)
      const posted = await clickFirst(page, [
        'button:has-text("发表")',
        'button:has-text("发布")',
        '.btn-post',
        '[class*="post-btn"]'
      ])
      if (!posted) throw new Error('未找到发表按钮')

      // 平台常在提交时弹滑块/拼图：等用户手动通过后再等成功文案
      await waitCaptchaCleared(page, onProgress, 180000, 92)

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('发表成功') || t.includes('发布成功')
          },
          { timeout: 180000, polling: 1500 }
        ),
        180000,
        '视频号发布确认'
      )

      onProgress('success', '视频号发布成功', 100)
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
