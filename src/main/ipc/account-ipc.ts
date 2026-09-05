import { ipcMain } from 'electron'
import * as db from '../db'
import { getProfileDir } from '../paths'
import { WorkerHandle, resolveWorkerPath } from '../worker-bridge'
import { PLATFORM_MAP } from '../../shared/platforms'
import type { PlatformId } from '../../shared/platforms'
import type { WorkerEvent } from '../../shared/types'

const loginSessions = new Map<string, WorkerHandle>()

export function registerAccountIPC(notify: () => void): void {
  ipcMain.handle('account:list', () => db.listAccounts())

  ipcMain.handle(
    'account:add',
    (_e, platform: PlatformId, name: string, remark = '', group = '', proxy = '') => {
      // 先插入占位，拿到自增 id 后再回填 profile 目录
      const tmp = db.createAccount(platform, name, `pending_${Date.now()}_${Math.random()}`, remark, group, proxy)
      db.setAccountProfileDir(tmp.id, getProfileDir(tmp.id))
      notify()
      return db.getAccount(tmp.id)
    }
  )

  ipcMain.handle(
    'account:update',
    (_e, id: number, patch: { name?: string; remark?: string; group_name?: string; proxy?: string }) => {
      db.updateAccount(id, patch)
      notify()
      return db.getAccount(id)
    }
  )

  ipcMain.handle('account:remove', (_e, id: number) => {
    db.removeAccount(id)
    notify()
    return true
  })

  ipcMain.handle('account:login', async (_e, id: number) => {
    const acc = db.getAccount(id)
    if (!acc) return { ok: false, error: '账号不存在' }
    const meta = PLATFORM_MAP[acc.platform]
    if (!meta) return { ok: false, error: '平台不存在' }

    const profileDir = getProfileDir(id)
    const existing = loginSessions.get(profileDir)
    if (existing) existing.kill()

    const handle = new WorkerHandle(resolveWorkerPath())
    loginSessions.set(profileDir, handle)

    let closed = false
    handle.on((e: WorkerEvent) => {
      if (e.type === 'loginClosed') {
        closed = true
        loginSessions.delete(profileDir)
        // 关闭浏览器后再检测一次登录态
        void checkOne(id).then(() => notify())
      }
    })

    handle.send({ type: 'login', platform: acc.platform, profileDir, loginUrl: meta.loginUrl })
    return { ok: true, closed }
  })

  ipcMain.handle('account:checkLogin', (_e, id: number) => checkOne(id))
  ipcMain.handle('account:checkAll', async () => {
    const accs = db.listAccounts()
    // 串行检测，避免同时拉起一堆浏览器
    for (const a of accs) await checkOne(a.id)
    notify()
    return db.listAccounts()
  })

  /** 手动更新粉丝数（用户从后台看到的数字手动同步进来） */
  ipcMain.handle('account:setFans', (_e, id: number, fans: string) => {
    db.setAccountProfile(id, { fans })
    notify()
    return true
  })
}

async function checkOne(id: number): Promise<boolean> {
  const acc = db.getAccount(id)
  if (!acc) return false
  const profileDir = getProfileDir(id)
  const handle = new WorkerHandle(resolveWorkerPath())

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      off()
      handle.kill()
      db.setAccountLogin(id, false)
      resolve(false)
    }, 60000)

    const off = handle.on((e: WorkerEvent) => {
      if (e.type !== 'loginStatus') return
      clearTimeout(timer)
      off()
      handle.kill()
      db.setAccountLogin(id, e.loggedIn)
      if (e.loggedIn) {
        db.setAccountProfile(id, {
          avatar: e.avatar,
          fans: e.fans
        })
      }
      resolve(e.loggedIn)
    })

    handle.send({ type: 'checkLogin', platform: acc.platform, profileDir })
  })
}

/**
 * 静默巡检全部账号登录态（headless、串行），返回过期账号名列表。
 * 供主进程定时任务调用；与 checkAll（用户手动触发）共用 checkOne。
 */
export async function checkAllAccountsSilent(): Promise<string[]> {
  const expired: string[] = []
  for (const a of db.listAccounts()) {
    const ok = await checkOne(a.id)
    if (!ok) expired.push(a.name)
  }
  return expired
}
