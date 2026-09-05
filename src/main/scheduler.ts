import * as db from './db'
import { enqueueTask } from './task-runner'
import { PLATFORM_MAP } from '../shared/platforms'
import type { TaskRow } from '../shared/types'

let timer: NodeJS.Timeout | null = null

/** 把 "2026-09-05 18:30" / "2026-09-05T18:30" 统一成 SQLite 可比较的 "YYYY-MM-DD HH:MM:SS" */
export function normalizeTime(input: string): string {
  const s = input.replace('T', ' ').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(:(\d{2}))?/)
  if (!m) return s
  return `${m[1]} ${m[2]}:${m[3]}:${m[5] ?? '00'}`
}

/** 该任务的所有目标平台是否都支持平台侧定时（决定是否值得提前入队） */
function allTargetsSupportSchedule(task: TaskRow): boolean {
  try {
    const targets = JSON.parse(task.targets || '[]') as { platform: string }[]
    return (
      targets.length > 0 &&
      targets.every((t) => PLATFORM_MAP[t.platform]?.supportSchedule === true)
    )
  } catch {
    return false
  }
}

function sweep(): void {
  try {
    const now = nowString()
    for (const t of db.listDueTasks(now)) {
      // 平台侧定时的任务会被 listDueTasks 提前 15 分钟带出：
      // 只有全部目标平台都支持定时才提前跑，否则等真正到点再由本地定时发
      const stillFuture = (t.scheduled_at ?? '') > now
      if (stillFuture && !allTargetsSupportSchedule(t)) continue
      enqueueTask(t)
    }
  } catch (err) {
    console.error('[scheduler] sweep error', err)
  }
}

function nowString(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`
}

export function startScheduler(intervalMs = 20000): void {
  if (timer) return
  // 启动时立即扫一次：补发关机期间错过的任务
  setTimeout(sweep, 3000)
  timer = setInterval(sweep, intervalMs)
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
