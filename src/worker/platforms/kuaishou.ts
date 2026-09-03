import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOptions, PublishOutcome } from './types'
import { delay, fillFirst, setFile, clickFirst, withTimeout, settle, scrapeProfile } from '../humanize'

const HOME = 'https://cp.kuaishou.com/article/manage/video'
const UPLOAD = 'https://cp.kuaishou.com/article/publish/video'

export const kuaishou: PlatformAdapter = {
  id: 'kuaishou',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2000, 3500)
    const url = page.url()
    if (url.includes('login') || url.includes('passport')) return { loggedIn: false }

    const name = await page
      .locator('[class*="user-name"], [class*="nickname"], .user-info')
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
      onProgress('launching', '打开快手创作者服务平台…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 2500, 4000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        ['input[type="file"][accept*="video"]', '.uploader input[type="file"]', 'input[type="file"]'],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口')

      onProgress('uploading', '视频上传中…', 30)
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('上传成功') || t.includes('重新上传') || t.includes('已上传')
          },
          { timeout: 900000, polling: 2000 }
        ),
        900000,
        '快手视频上传'
      )

      onProgress('filling', '填写描述与话题…', 65)
      await delay(1500, 3000)

      // 快手标题与描述共用描述框，首行作为标题
      const text =
        options.title + (options.description ? `\n${options.description}` : '') +
        (options.tags.length ? `\n${options.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}` : '')
      await fillFirst(
        page,
        [
          '[class*="description"] [contenteditable="true"]',
          '.ant-mentions textarea',
          'textarea[placeholder*="说点什么"]',
          'textarea'
        ],
        text.slice(0, 1000)
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

      if (options.scheduledAt) {
        onProgress('filling', '设置定时发布…', 80)
        await clickFirst(page, [':text("定时发布")', 'label:has-text("定时")'], 3000)
        await delay(800, 1500)
        const input = page.locator('input[placeholder*="时间"], input[placeholder*="日期"]').first()
        if (await input.count()) {
          await input.click()
          await input.fill(options.scheduledAt.replace('T', ' '))
          await page.keyboard.press('Enter')
        }
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1000, 2000)
      const posted = await clickFirst(page, [
        'button:has-text("发布")',
        '[class*="publish-btn"]',
        'button:has-text("定时发布")'
      ])
      if (!posted) throw new Error('未找到发布按钮')

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('发布成功') || t.includes('作品发布成功')
          },
          { timeout: 120000, polling: 1500 }
        ),
        120000,
        '快手发布确认'
      )

      onProgress('success', '快手发布成功', 100)
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
