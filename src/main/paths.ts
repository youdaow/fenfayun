import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

function ensure(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 应用数据根目录（打包后在 userData，开发时在项目根 data/） */
export function getDataRoot(): string {
  return ensure(app.isPackaged ? join(app.getPath('userData'), 'data') : join(app.getAppPath(), 'data'))
}

/** 浏览器独立 profile 目录：每个账号一个，登录态长期保留 */
export function getProfilesRoot(): string {
  return ensure(join(getDataRoot(), 'profiles'))
}

export function getProfileDir(accountId: number): string {
  return ensure(join(getProfilesRoot(), `acc_${accountId}`))
}

/** 素材库目录 */
export function getMediaRoot(): string {
  return ensure(join(getDataRoot(), 'media'))
}

/** 封面缓存目录 */
export function getCoverRoot(): string {
  return ensure(join(getDataRoot(), 'covers'))
}

/** 失败现场截图目录 */
export function getErrShotRoot(): string {
  return ensure(join(getDataRoot(), 'errshots'))
}

export function getDbPath(): string {
  return join(getDataRoot(), 'app.db')
}

export function getLogPath(): string {
  return join(getDataRoot(), 'main.log')
}
