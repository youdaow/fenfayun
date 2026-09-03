import type { Page } from 'playwright-core'
import type { PlatformId } from '../../shared/platforms'
import type { PublishOptions } from '../../shared/types'

export type { PublishOptions }

export type ProgressFn = (status: string, message?: string, percent?: number) => void

export interface PublishOutcome {
  success: boolean
  url?: string
  error?: string
  duration?: number
}

export interface LoginState {
  loggedIn: boolean
  nickname?: string
  /** 头像图片 URL（各平台创作者后台的头像元素） */
  avatar?: string
  /** 粉丝数（字符串形式，因为各平台显示方式不同：1.2万 / 12345） */
  fans?: string
}

export interface PlatformAdapter {
  id: PlatformId
  /** 判断当前 profile 是否已登录 */
  checkLogin(page: Page): Promise<LoginState>
  /** 走完整个投稿流程 */
  publish(page: Page, options: PublishOptions, onProgress: ProgressFn): Promise<PublishOutcome>
}
