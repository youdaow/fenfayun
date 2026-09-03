import * as db from './db'
import { enqueueTask } from './task-runner'

let timer: NodeJS.Timeout | null = null

/** 把 "2026-09-05 18:30" / "2026-09-05T18:30" 统一成 SQLite 可比较的 "YYYY-MM-DD HH:MM:SS" */
export function normalizeTime(input: string): string {
  const s = input.replace('T', ' ').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(:(\d{2}))?/)
  if (!m) return s
  return `${m[1]} ${m[2]}:${m[3]}:${m[5] ?? '00'}`
}

function sweep(): void {
  try {
    const due = db.listDueTasks(nowString())
    for (const t of due) enqueueTask(t)
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
