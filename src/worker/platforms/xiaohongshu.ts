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

const HOME = 'https://creator.xiaohongshu.com/publish/success'
const UPLOAD = 'https://creator.xiaohongshu.com/publish/publish?target=video'

export const xiaohongshu: PlatformAdapter = {
  id: 'xiaohongshu',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2500, 4000)
    const url = page.url()
    if (url.includes('/login') || url.includes('signin')) return { loggedIn: false }

    const name = await page
      .locator('[class*="user-name"], [class*="nickname"], .user.name')
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
      onProgress('launching', '打开小红书创作中心…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 3000, 5000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        [
          'input[type="file"][accept*="video"]',
          '.upload-input',
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
        '小红书视频上传'
      )

      onProgress('filling', '填写笔记内容…', 65)
      await delay(2500, 4000)

      // 标题最长 20 字
      await fillFirst(
        page,
        [
          'input[placeholder*="标题"]',
          '[class*="title"] input',
          '#post-title',
          '.title-input input'
        ],
        options.title.slice(0, 20)
      )
      await delay(600, 1200)

      // 正文
      const body =
        (options.description || '') +
        (options.tags.length ? `\n${options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}` : '')
      if (body.trim()) {
        await fillFirst(
          page,
          ['#post-textarea', '[contenteditable="true"]', 'textarea[placeholder*="正文"]', 'textarea'],
          body.slice(0, 1000)
        )
        await delay(1200, 2200)
        // 触发话题联想面板后回车确认
        await page.keyboard.press('Enter').catch(() => {})
        await delay(500, 1000)
      }

      // 封面（小红书视频默认取首帧，可选上传）
      if (options.coverPath) {
        await setFile(
          page,
          ['[class*="cover"] input[type="file"]', 'input[type="file"][accept*="image"]'],
          options.coverPath
        ).catch(() => false)
        await delay(1500, 2500)
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1200, 2200)
      // 小红书不支持平台内定时，定时由本工具的调度器控制
      const posted = await clickFirst(page, [
        'button:has-text("发布")',
        '.publish-btn',
        '[class*="submit"] button:has-text("发布")'
      ])
      if (!posted) throw new Error('未找到发布按钮')

      // 平台常在提交时弹滑块/拼图：等用户手动通过后再等成功文案
      await waitCaptchaCleared(page, onProgress, 180000, 92)

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('发布成功') || location.href.includes('/publish/success')
          },
          { timeout: 180000, polling: 1500 }
        ),
        180000,
        '小红书发布确认'
      )

      onProgress('success', '小红书发布成功', 100)
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
