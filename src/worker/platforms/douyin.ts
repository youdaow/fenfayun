import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOptions, PublishOutcome } from './types'
import { delay, fillFirst, setFile, clickFirst, withTimeout, settle, scrapeProfile } from '../humanize'

const HOME = 'https://creator.douyin.com/creator-micro/content/manage'
const UPLOAD = 'https://creator.douyin.com/creator-micro/content/upload'

export const douyin: PlatformAdapter = {
  id: 'douyin',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2000, 3500)
    if (page.url().includes('login') || page.url().includes('passport')) {
      return { loggedIn: false }
    }
    // 已登录时页面里会出现创作者昵称 / 头像
    const name = await page
      .locator('.avatar, [class*="user-info"] [class*="name"], header [class*="nick"]')
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
      onProgress('launching', '打开抖音创作中心…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 2500, 4000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        ['input[type="file"][accept*="video"]', '.upload-btn input[type="file"]', 'input[type="file"]'],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口，页面结构可能已变化')

      onProgress('uploading', '视频上传中，请耐心等待…', 30)
      await withTimeout(
        page
          .waitForFunction(
            () => {
              const t = document.body.innerText || ''
              return (
                t.includes('重新上传') ||
                t.includes('上传成功') ||
                t.includes('发布') && !t.includes('上传中')
              )
            },
            { timeout: 900000, polling: 2000 }
          ),
        900000,
        '抖音视频上传'
      )
      onProgress('filling', '填写标题与话题…', 65)
      await delay(1500, 3000)

      // 标题（抖音是 contenteditable）
      await fillFirst(
        page,
        [
          'input[placeholder*="填写作品标题"]',
          '.notranslate[contenteditable="true"]',
          '[class*="title"] [contenteditable="true"]',
          'input[placeholder*="标题"]'
        ],
        options.title.slice(0, 30)
      )
      await delay(800, 1500)

      // 简介 + 话题：一起填到描述框，话题用 # 形式
      if (options.description || options.tags.length) {
        const desc = [options.description, ...options.tags.map((t) => `#${t.replace(/^#/, '')}`)]
          .filter(Boolean)
          .join(' ')
        await fillFirst(
          page,
          [
            '[class*="desc"] [contenteditable="true"]',
            '.zone-container [contenteditable="true"]',
            'textarea[placeholder*="简介"]',
            'textarea'
          ],
          desc.slice(0, 1000)
        )
        await delay(1000, 2000)
        // 触发话题联想后按回车确认
        await page.keyboard.press('Enter').catch(() => {})
      }

      // 封面
      if (options.coverPath) {
        await setFile(
          page,
          ['input[type="file"][accept*="image"]', '[class*="cover"] input[type="file"]'],
          options.coverPath
        ).catch(() => false)
        await delay(2000, 3500)
        await clickFirst(page, ['button:has-text("完成")', '[class*="confirm"]:has-text("完成")'])
      }

      // 定时发布
      if (options.scheduledAt) {
        onProgress('filling', '设置定时发布…', 80)
        await clickFirst(page, ['label:has-text("定时发布")', ':text("定时发布")'], 3000)
        await delay(800, 1500)
        const dateInput = page.locator('input[placeholder*="日期"], input[placeholder*="时间"]').first()
        if (await dateInput.count()) {
          await dateInput.click()
          await dateInput.fill(options.scheduledAt.replace('T', ' '))
          await page.keyboard.press('Enter')
          await delay(500, 1000)
        }
      }

      onProgress('publishing', '提交发布…', 90)
      await delay(1000, 2000)
      const posted = await clickFirst(page, [
        'button:has-text("发布")',
        '[class*="button-publish"]',
        'button:has-text("定时发布")'
      ])
      if (!posted) throw new Error('未找到发布按钮')

      await withTimeout(
        page
          .waitForFunction(
            () => {
              const t = document.body.innerText || ''
              return t.includes('发布成功') || t.includes('作品发布成功') || t.includes('定时发布成功')
            },
            { timeout: 120000, polling: 1500 }
          ),
        120000,
        '抖音发布确认'
      )

      onProgress('success', '抖音发布成功', 100)
      return { success: true, url: page.url(), duration: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg, duration: Date.now() - start }
    }
  }
}
