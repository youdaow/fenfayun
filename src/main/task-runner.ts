import { BrowserWindow } from 'electron'
import { WorkerHandle, resolveWorkerPath } from './worker-bridge'
import * as db from './db'
import { getProfileDir } from './paths'
import type { PlatformId } from '../shared/platforms'
import type { ProgressPayload, PublishLogRow, TaskRow } from '../shared/types'

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
let running = false
let win: BrowserWindow | null = null

export function setRunnerWindow(w: BrowserWindow): void {
  win = w
}

function emit(p: ProgressPayload): void {
  if (win && !win.isDestroyed()) win.webContents.send('publish:progress', p)
}

function emitRefresh(): void {
  if (win && !win.isDestroyed()) win.webContents.send('data:refresh')
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

  for (const t of targets) {
    const log = db.createPublishLog(task.id, t.platform, t.accountId)
    queue.push({
      taskId: task.id,
      logId: log.id,
      platform: t.platform,
      accountId: t.accountId,
      profileDir: getProfileDir(t.accountId),
      payload: {
        type: 'publish',
        taskId: task.id,
        logId: log.id,
        platform: t.platform,
        profileDir: getProfileDir(t.accountId),
        options: {
          title: task.title,
          description: task.description ?? '',
          tags: safeParse<string[]>(task.tags, []),
          videoPath: task.video_path,
          coverPath: task.cover_path ?? undefined,
          scheduledAt: null
        }
      }
    })
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

  queue.push({
    taskId: task.id,
    logId: log.id,
    platform: log.platform,
    accountId: log.account_id,
    profileDir: getProfileDir(log.account_id),
    payload: {
      type: 'publish',
      taskId: task.id,
      logId: log.id,
      platform: log.platform,
      profileDir: getProfileDir(log.account_id),
      options: {
        title: task.title,
        description: task.description ?? '',
        tags: safeParse<string[]>(task.tags, []),
        videoPath: task.video_path,
        coverPath: task.cover_path ?? undefined,
        scheduledAt: null
      }
    }
  })

  db.updateTaskStatus(task.id, 'running')
  emitRefresh()
  pump()
}

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
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
    const job = queue.shift()!
    startJob(job)
  }

  if (!active.size && !queue.length) {
    running = false
    finalizeTasks()
    emitRefresh()
  }
}

function startJob(job: Job): void {
  const handle = new WorkerHandle(resolveWorkerPath())
  active.set(job.logId, handle)

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
      db.updatePublishLog(job.logId, {
        status: e.success ? 'success' : 'failed',
        resultUrl: e.url ?? null,
        error: e.error ?? null,
        durationMs: e.duration ?? null,
        message: e.success ? '发布成功' : (e.error ?? '发布失败')
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
      tick()
    }
  })

  handle.send(job.payload)
}

function finalizeTasks(): void {
  const runningTasks = db.listTasks({ status: 'running', limit: 200 })
  for (const t of runningTasks) {
    const logs = db.listPublishLogs({ limit: 1000 }).filter((l) => l.task_id === t.id)
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
  for (const t of db.listTasks({ status: 'running', limit: 200 })) {
    db.updateTaskStatus(t.id, 'canceled')
  }
  emitRefresh()
}

export function isBusy(): boolean {
  return active.size > 0 || queue.length > 0
}
