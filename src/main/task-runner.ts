import { BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { WorkerHandle, resolveWorkerPath } from './worker-bridge'
import * as db from './db'
import { getProfileDir, getErrShotRoot } from './paths'
import { PLATFORM_MAP } from '../shared/platforms'
import type { PlatformId } from '../shared/platforms'
import type {
  ProgressPayload,
  PublishLogRow,
  TaskRow,
  PublishOptions,
  PlatformOverrides
} from '../shared/types'

interface Job {
  taskId: number
  logId: number
  platform: PlatformId
  accountId: number
  profileDir: string
  payload: Parameters<WorkerHandle['send']>[0] & { type: 'publish' }
}

const queue: Job[] = []
const active = new Map<number, WorkerHandle>()
/** 账号 id → 占用数，实现同账号互斥（同一 profile 不能被两个浏览器同时打开） */
const busyAccounts = new Map<number, number>()
/** 被主动取消的任务：结束后不再自动重试 */
const canceledTasks = new Set<number>()
let running = false
let win: BrowserWindow | null = null

/** 自动重试次数：settings.autoRetry，0~3，退避 30s/90s/180s */
function maxRetries(): number {
  const n = parseInt(db.getSetting('autoRetry', '1'), 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 1
}

const RETRY_WAITS = [30_000, 90_000, 180_000]

export function setRunnerWindow(w: BrowserWindow): void {
  win = w
}

function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    if (win && !win.isDestroyed() && win.isFocused()) return
    new Notification({ title, body: body.slice(0, 140) }).show()
  } catch {
    /* 通知失败不影响主流程 */
  }
}

function emit(p: ProgressPayload): void {
  if (win && !win.isDestroyed()) win.webContents.send('publish:progress', p)
}

function emitRefresh(): void {
  if (win && !win.isDestroyed()) win.webContents.send('data:refresh')
}

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

/** 账号代理优先，其次全局代理，都没有则直连 */
function proxyFor(accountId: number): string | undefined {
  const acc = db.getAccount(accountId)
  const p = (acc?.proxy || '').trim() || db.getSetting('proxy.global', '').trim()
  return p || undefined
}

/** 组装平台实际文案：overrides 覆盖基础文案；满足条件时透传平台侧定时 */
function buildOptions(task: TaskRow, platform: PlatformId): PublishOptions {
  const overrides = safeParse<PlatformOverrides>(task.overrides, {})
  const ov = overrides[platform] || {}
  const meta = PLATFORM_MAP[platform]
  const farEnough =
    task.publish_mode === 'scheduled' &&
    !!task.scheduled_at &&
    new Date((task.scheduled_at as string).replace(' ', 'T')).getTime() - Date.now() >
      10 * 60 * 1000
  const usePlatformSchedule =
    !!task.platform_schedule && !!meta?.supportSchedule && farEnough
  return {
    title: (ov.title ?? task.title).trim(),
    description: ov.description ?? task.description ?? '',
    tags: ov.tags ?? safeParse<string[]>(task.tags, []),
    videoPath: task.video_path,
    coverPath: task.cover_path ?? undefined,
    scheduledAt: usePlatformSchedule ? (task.scheduled_at as string) : null
  }
}

function makeJob(task: TaskRow, logId: number, t: { platform: PlatformId; accountId: number }): Job {
  return {
    taskId: task.id,
    logId,
    platform: t.platform,
    accountId: t.accountId,
    profileDir: getProfileDir(t.accountId),
    payload: {
      type: 'publish',
      taskId: task.id,
      logId,
      platform: t.platform,
      profileDir: getProfileDir(t.accountId),
      options: buildOptions(task, t.platform),
      errShotPath: join(getErrShotRoot(), `log_${logId}.png`),
      proxy: proxyFor(t.accountId)
    }
  }
}

export function enqueueTask(task: TaskRow): void {
  let targets: { platform: PlatformId; accountId: number }[] = []
  try {
    targets = JSON.parse(task.targets || '[]')
  } catch {
    targets = []
  }
  if (!targets.length) {
    db.updateTaskStatus(task.id, 'failed')
    return
  }

  canceledTasks.delete(task.id)
  for (const t of targets) {
    const log = db.createPublishLog(task.id, t.platform, t.accountId)
    queue.push(makeJob(task, log.id, t))
  }

  db.updateTaskStatus(task.id, 'running')
  emitRefresh()
  pump()
}

/** 只重跑某一条发布记录（某任务在某个账号上失败时用） */
export function enqueueLog(logId: number): void {
  const log = db.getPublishLog(logId)
  if (!log || !log.account_id) throw new Error('发布记录不存在或账号已被删除')
  const task = db.getTask(log.task_id)
  if (!task) throw new Error('关联的任务已被删除')

  db.updatePublishLog(logId, {
    status: 'pending',
    error: null,
    message: null,
    resultUrl: null,
    durationMs: null
  })
  canceledTasks.delete(task.id)

  queue.push(makeJob(task, log.id, { platform: log.platform, accountId: log.account_id }))

  db.updateTaskStatus(task.id, 'running')
  emitRefresh()
  pump()
}

/** 取消单个任务：排队项直接标记取消，运行中的杀进程、不再重试 */
export function cancelTask(taskId: number): void {
  canceledTasks.add(taskId)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].taskId === taskId) {
      db.updatePublishLog(queue[i].logId, { status: 'canceled', message: '已取消' })
      queue.splice(i, 1)
    }
  }
  for (const [logId, h] of [...active]) {
    const log = db.getPublishLog(logId)
    if (log && log.task_id === taskId) h.kill()
  }
  setTimeout(() => {
    const t = db.getTask(taskId)
    if (t && (t.status === 'running' || t.status === 'pending')) db.updateTaskStatus(taskId, 'canceled')
    emitRefresh()
    tick()
  }, 2500)
}

function concurrency(): number {
  const n = parseInt(db.getSetting('concurrency', '1'), 10)
  return Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 1
}

function pump(): void {
  if (running) return
  running = true
  tick()
}

function tick(): void {
  const limit = concurrency()
  while (active.size < limit && queue.length) {
    // 同账号互斥：跳过账号正忙的队首，找账号空闲的任务先启动
    const idx = queue.findIndex((j) => !busyAccounts.has(j.accountId))
    if (idx === -1) break
    const job = queue.splice(idx, 1)[0]
    startJob(job)
  }

  if (!active.size && !queue.length) {
    running = false
    finalizeTasks()
    emitRefresh()
  }
}

function scheduleRetry(job: Job, nextAttempt: number): void {
  const wait = RETRY_WAITS[Math.min(nextAttempt - 2, RETRY_WAITS.length - 1)] ?? 60_000
  setTimeout(() => {
    if (canceledTasks.has(job.taskId)) return
    db.updatePublishLog(job.logId, {
      status: 'pending',
      message: `自动重试（第 ${nextAttempt} 次尝试）…`,
      attempt: nextAttempt
    })
    queue.push(job)
    emitRefresh()
    pump()
  }, wait)
}

function startJob(job: Job): void {
  const handle = new WorkerHandle(resolveWorkerPath())
  active.set(job.logId, handle)
  busyAccounts.set(job.accountId, (busyAccounts.get(job.accountId) ?? 0) + 1)

  const log = db.getPublishLog(job.logId)
  const attempt = (log?.attempt ?? 0) + 1
  db.updatePublishLog(job.logId, { attempt })

  const off = handle.on((e) => {
    if (e.type === 'progress') {
      db.updatePublishLog(job.logId, { status: 'running', message: e.message ?? null })
      emit({
        taskId: job.taskId,
        logId: job.logId,
        platform: job.platform,
        accountId: job.accountId,
        status: e.status as ProgressPayload['status'],
        message: e.message,
        percent: e.percent
      })
      return
    }
    if (e.type === 'result') {
      off()
      handle.kill()
      active.delete(job.logId)
      const busy = (busyAccounts.get(job.accountId) ?? 1) - 1
      if (busy <= 0) busyAccounts.delete(job.accountId)
      else busyAccounts.set(job.accountId, busy)

      // 失败自动重试（主动取消的任务除外）
      if (!e.success && attempt <= maxRetries() && !canceledTasks.has(job.taskId)) {
        const waitSec = Math.round(
          (RETRY_WAITS[Math.min(attempt - 1, RETRY_WAITS.length - 1)] ?? 60_000) / 1000
        )
        db.updatePublishLog(job.logId, {
          message: `发布失败，${waitSec} 秒后自动重试：${e.error ?? ''}`.slice(0, 200)
        })
        emit({
          taskId: job.taskId,
          logId: job.logId,
          platform: job.platform,
          accountId: job.accountId,
          status: 'waiting',
          message: `失败，${waitSec} 秒后自动重试（${attempt}/${maxRetries()}）`
        })
        scheduleRetry(job, attempt + 1)
        tick()
        return
      }
      canceledTasks.delete(job.taskId)

      db.updatePublishLog(job.logId, {
        status: e.success ? 'success' : 'failed',
        resultUrl: e.url ?? null,
        error: e.error ?? null,
        durationMs: e.duration ?? null,
        message: e.success ? '发布成功' : (e.error ?? '发布失败'),
        screenshot: e.screenshot ?? null
      })
      emit({
        taskId: job.taskId,
        logId: job.logId,
        platform: job.platform,
        accountId: job.accountId,
        status: e.success ? 'success' : 'failed',
        message: e.success ? '发布成功' : (e.error ?? '发布失败'),
        percent: e.success ? 100 : undefined,
        resultUrl: e.url,
        error: e.error
      })
      if (!e.success) {
        const acc = db.getAccount(job.accountId)
        notify(
          '分发云 · 发布失败',
          `${PLATFORM_MAP[job.platform]?.name ?? job.platform}（${acc?.name ?? '账号 #' + job.accountId}）：${e.error ?? '未知错误'}`
        )
      }
      tick()
    }
  })

  handle.send(job.payload)
}

function finalizeTasks(): void {
  const runningTasks = db.listTasks({ status: 'running', limit: 200 })
  for (const t of runningTasks) {
    const logs = db.listLogsByTask(t.id)
    if (!logs.length) continue
    if (logs.some((l) => l.status === 'pending' || l.status === 'running')) continue
    const ok = logs.filter((l: PublishLogRow) => l.status === 'success').length
    const status = ok === logs.length ? 'success' : ok > 0 ? 'partial' : 'failed'
    db.updateTaskStatus(t.id, status)
  }
}

export function cancelAll(): void {
  for (const [logId, h] of active) {
    h.kill()
    db.updatePublishLog(logId, { status: 'canceled', message: '已取消' })
    active.delete(logId)
  }
  for (const job of queue) {
    db.updatePublishLog(job.logId, { status: 'canceled', message: '已取消' })
  }
  queue.length = 0
  busyAccounts.clear()
  for (const t of db.listTasks({ status: 'running', limit: 200 })) {
    db.updateTaskStatus(t.id, 'canceled')
  }
  emitRefresh()
}

export function isBusy(): boolean {
  return active.size > 0 || queue.length > 0
}
