import type { Page } from 'playwright-core'
import type { PlatformAdapter, LoginState, PublishOptions, PublishOutcome } from './types'
import { delay, fillFirst, setFile, clickFirst, withTimeout, settle, scrapeProfile } from '../humanize'

const HOME = 'https://member.bilibili.com/platform/home'
const UPLOAD = 'https://member.bilibili.com/platform/upload/video/frame'

export const bilibili: PlatformAdapter = {
  id: 'bilibili',

  async checkLogin(page: Page): Promise<LoginState> {
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await settle(page, 2000, 3500)
    if (page.url().includes('passport.bilibili.com')) return { loggedIn: false }

    const name = await page
      .locator('.up-name, [class*="up-name"], .header-avatar, [class*="nickname"]')
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
      onProgress('launching', '打开 B 站投稿页…', 5)
      await page.goto(UPLOAD, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await settle(page, 2500, 4000)

      onProgress('uploading', '上传视频文件…', 12)
      const ok = await setFile(
        page,
        ['input[type="file"][accept*="video"]', '.upload-btn input[type="file"]', 'input[type="file"]'],
        options.videoPath
      )
      if (!ok) throw new Error('未找到上传入口')

      onProgress('uploading', '视频上传中…', 30)
      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('上传完成') || t.includes('重新上传') || t.includes('转码中') || t.includes('已上传')
          },
          { timeout: 1200000, polling: 2000 }
        ),
        1200000,
        'B 站视频上传'
      )

      onProgress('filling', '填写稿件信息…', 65)
      await delay(2500, 4500)

      await fillFirst(
        page,
        [
          'input[placeholder*="请输入稿件标题"]',
          '.video-title input',
          'input[maxlength="80"]',
          'input[placeholder*="标题"]'
        ],
        options.title.slice(0, 80)
      )
      await delay(600, 1200)

      // 简介
      if (options.description) {
        await fillFirst(
          page,
          ['textarea[placeholder*="简介"]', '.ql-editor', '[contenteditable="true"]'],
          options.description.slice(0, 2000)
        )
        await delay(600, 1200)
      }

      // 标签：B 站最多 10 个
      for (const tag of options.tags.slice(0, 10)) {
        const tagInput = page
          .locator('input[placeholder*="标签"], .tag-input-wrp input, [class*="tag"] input')
          .first()
        if (!(await tagInput.count())) break
        try {
          await tagInput.click()
          await tagInput.fill(tag)
          await delay(300, 700)
          await page.keyboard.press('Enter')
          await delay(300, 600)
        } catch {
          break
        }
      }

      // 封面
      if (options.coverPath) {
        await setFile(
          page,
          ['[class*="cover"] input[type="file"]', 'input[type="file"][accept*="image"]'],
          options.coverPath
        ).catch(() => false)
        await delay(2000, 3500)
        await clickFirst(page, ['button:has-text("完成")', '.bcc-dialog button:has-text("确定")'])
      }

      // 定时发布
      if (options.scheduledAt) {
        onProgress('filling', '设置定时发布…', 80)
        const toggled = await clickFirst(
          page,
          [':text("定时发布")', 'label:has-text("定时发布")', '[class*="timing"]'],
          3000
        )
        if (toggled) {
          await delay(800, 1500)
          const input = page.locator('input[placeholder*="时间"], input[placeholder*="日期"]').first()
          if (await input.count()) {
            await input.click()
            await input.fill(options.scheduledAt.replace('T', ' '))
            await page.keyboard.press('Enter')
          }
        }
      }

      onProgress('publishing', '提交投稿…', 90)
      await delay(1200, 2500)
      const posted = await clickFirst(page, [
        'button:has-text("立即投稿")',
        'button:has-text("定时发布")',
        '.submit-add',
        'button:has-text("投稿")'
      ])
      if (!posted) throw new Error('未找到投稿按钮')

      await withTimeout(
        page.waitForFunction(
          () => {
            const t = document.body.innerText || ''
            return t.includes('稿件投递成功') || t.includes('投稿成功') || location.href.includes('success')
          },
          { timeout: 180000, polling: 1500 }
        ),
        180000,
        'B 站投稿确认'
      )

      onProgress('success', 'B 站投稿成功', 100)
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
