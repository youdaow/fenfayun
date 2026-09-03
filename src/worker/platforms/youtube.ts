import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOutcome } from './types'
import { delay, fillFirst, setFile, clickFirst, withTimeout, settle, scrapeProfile } from '../humanize'

const HOME = 'https://studio.youtube.com/'
const UPLOAD = 'https://studio.youtube.com/videos/upload'

export const youtube: PlatformAdapter = {
  id: 'youtube',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2500, 4000)
    const url = page.url()
    // 未登录会跳转到 Google 账号登录
    if (url.includes('accounts.google.com') || url.includes('signin')) {
      return { loggedIn: false }
    }
    const name = await page
      .locator('#avatar-btn img, .ytcp-avatar img, [aria-label*="账号"]')
      .first()
      .getAttribute('alt', { timeout: 5000 })
      .catch(() => null)
    // YouTube 工作室首页不直接显示粉丝数，抓头像即可
    const avatar = await page
      .locator('#avatar-btn img, .ytcp-avatar img')
      .first()
      .getAttribute('src', { timeout: 5000 })
      .catch(() => null)
    return { loggedIn: true, nickname: name || undefined, avatar: avatar || undefined }
  },

  async publish(
    page: Page,
    options: import('../../shared/types').PublishOptions,
    onProgress: (s: string, m?: string, p?: number) => void
  ): Promise<PublishOutcome> {
    const start = Date.now()
    try {
      onProgress('launching', '打开 YouTube 工作室…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 2500, 4000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        ['input[type="file"][accept*="video"]', 'input[type="file"]'],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口')

      onProgress('uploading', '视频上传与处理中（YouTube 需转码，可能较久）…', 30)
      // YouTube 上传后还要等"处理完成"才能发布
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('处理完成') || t.includes('已就绪') || t.includes('已完成处理')
          },
          { timeout: 1800000, polling: 3000 }
        ),
        1800000,
        'YouTube 视频处理'
      )

      onProgress('filling', '填写标题与描述…', 70)
      await delay(2000, 3500)

      await fillFirst(
        page,
        ['#textbox[aria-label*="标题"], #title-textarea', 'input[placeholder*="标题"]', 'input[placeholder*="title" i]'],
        options.title.slice(0, 100)
      )
      await delay(600, 1200)

      if (options.description) {
        await fillFirst(
          page,
          ['#description-textarea, #textbox[aria-label*="描述"]', 'textarea[placeholder*="描述"]', '[contenteditable="true"]'],
          options.description.slice(0, 5000)
        )
        await delay(600, 1200)
      }

      // YouTube 标签（在"更多选项"里）
      if (options.tags.length) {
        const moreBtn = await clickFirst(page, [':text("更多选项")', 'ytcp-text-button:has-text("更多")'], 3000)
        if (moreBtn) {
          await delay(500, 1000)
          const tagInput = page.locator('#tags-container input, input[placeholder*="标签"], [aria-label*="标签"] input').first()
          if (await tagInput.count()) {
            for (const t of options.tags.slice(0, 15)) {
              await tagInput.fill(t.replace(/^#/, ''))
              await page.keyboard.press('Enter').catch(() => {})
              await delay(150, 350)
            }
          }
        }
      }

      // 封面（YouTube 是缩略图）
      if (options.coverPath) {
        await setFile(
          page,
          ['input[type="file"][accept*="image"]'],
          options.coverPath
        ).catch(() => false)
        await delay(2000, 3500)
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1000, 2000)
      const posted = await clickFirst(page, [
        'ytcp-button#done-button, button:has-text("发布"), button:has-text("保存")',
        '#done-button',
        '[id="done-button"]'
      ])
      if (!posted) throw new Error('未找到发布按钮')

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('已发布') || t.includes('处理完成') && location.href.includes('/videos')
          },
          { timeout: 180000, polling: 2000 }
        ),
        180000,
        'YouTube 发布确认'
      )

      onProgress('success', 'YouTube 发布成功', 100)
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
