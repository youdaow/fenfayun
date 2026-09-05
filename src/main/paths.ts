import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, accessSync, constants, writeFileSync, rmSync } from 'fs'

/**
 * 数据目录策略，尽量兼容各种电脑与安装习惯：
 *  1) 环境变量 VDIST_DATA_DIR 指定（绿色版 / 多开测试用）
 *  2) 安装目录下 portable-data\（放了这个目录就用它 → 真正的绿色便携版，U 盘可用）
 *  3) 默认 userData\data（%APPDATA%，任何账户都有写权限）
 * 若 2 存在但不可写（Program Files 需要管理员权限、U 盘变只读等），自动回落到 3 并留下提示文件。
 */

function canWrite(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK)
    // 目录可能存在但磁盘只读：实打实写一个探针文件
    const probe = join(dir, '.vdist-probe')
    writeFileSync(probe, '1')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

function ensure(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

let cached: string | null = null
let portableUsed = false

function resolveDataRoot(): string {
  // 开发态：项目内 data/
  if (!app.isPackaged) {
    return ensure(join(app.getAppPath(), 'data'))
  }

  const envDir = (process.env.VDIST_DATA_DIR ?? '').trim()
  if (envDir) {
    try {
      ensure(envDir)
      if (canWrite(envDir)) return envDir
    } catch {
      /* 环境变量指向的位置不可用，继续往下 */
    }
  }

  // 便携模式：exe 旁放一个 portable-data 目录即启用
  // （portable 单文件版运行时 exe 解到临时目录，用 electron-builder 注入的
  //   PORTABLE_EXECUTABLE_DIR 指向真正的 exe 所在目录）
  const exeDir = (process.env.PORTABLE_EXECUTABLE_DIR || '').trim() || dirname(app.getPath('exe'))
  const portable = join(exeDir, 'portable-data')
  if (existsSync(portable)) {
    if (canWrite(portable)) {
      portableUsed = true
      return ensure(join(portable, 'data'))
    }
    // 不可写：在能写的地方留提示，避免用户以为没生效
    try {
      const fb = ensure(join(app.getPath('userData'), 'data'))
      writeFileSync(
        join(fb, 'PORTABLE_FALLBACK.txt'),
        `便携目录不可写，已改用默认数据目录。\n便携目录：${portable}\n实际使用：${fb}\n`,
        'utf8'
      )
    } catch {
      /* ignore */
    }
  }

  return ensure(join(app.getPath('userData'), 'data'))
}

/** 应用数据根目录 */
export function getDataRoot(): string {
  if (!cached) cached = resolveDataRoot()
  return cached
}

/** 是否运行在便携（绿色）模式 */
export function isPortable(): boolean {
  getDataRoot()
  return portableUsed
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
