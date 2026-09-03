import { ipcMain } from 'electron'
import * as db from '../db'
import type { PlatformId } from '../../shared/platforms'
import type { AnalyticsSummary, WorkMetricInput } from '../../shared/types'

export function registerAnalyticsIPC(notify: () => void): void {
  ipcMain.handle('analytics:record', (_e, input: WorkMetricInput) => {
    if (!input.logId) throw new Error('缺少作品记录 ID')
    db.addWorkMetric(input)
    notify()
    return true
  })

  ipcMain.handle('analytics:snapshots', (_e, logId: number) => db.listWorkSnapshots(logId))

  ipcMain.handle('analytics:works', () => db.listWorkStats())

  ipcMain.handle('analytics:summary', (): AnalyticsSummary => {
    const works = db.listWorkStats()
    const byAccount = db.listAccountAnalytics()

    const totalPlays = works.reduce((s, w) => s + w.plays, 0)
    const totalLikes = works.reduce((s, w) => s + w.likes, 0)
    const totalComments = works.reduce((s, w) => s + w.comments, 0)
    const totalFans = byAccount.reduce((s, a) => s + a.total_fans, 0)

    // 按平台汇总
    const byPlatformMap = new Map<string, { platform: PlatformId; plays: number; likes: number; works: number }>()
    for (const w of works) {
      const cur = byPlatformMap.get(w.platform) ?? { platform: w.platform, plays: 0, likes: 0, works: 0 }
      cur.plays += w.plays
      cur.likes += w.likes
      cur.works += 1
      byPlatformMap.set(w.platform, cur)
    }

    // 发布时间分布（按小时）
    const hourMap = new Map<number, number>()
    for (const w of works) {
      if (!w.published_at) continue
      const h = parseInt(w.published_at.slice(11, 13), 10)
      if (Number.isFinite(h)) hourMap.set(h, (hourMap.get(h) ?? 0) + 1)
    }
    const playsByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourMap.get(hour) ?? 0 }))

    // 按天发布量
    const dayMap = new Map<string, number>()
    for (const w of works) {
      if (!w.published_at) continue
      const d = w.published_at.slice(0, 10)
      dayMap.set(d, (dayMap.get(d) ?? 0) + 1)
    }
    const worksByDay = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }))

    const avgEngagementRate =
      totalPlays > 0
        ? Math.round(((totalLikes + totalComments) / totalPlays) * 10000) / 100
        : 0

    return {
      totalWorks: works.length,
      totalPlays,
      totalLikes,
      totalComments,
      totalFans,
      avgEngagementRate,
      topWorks: [...works].sort((a, b) => b.plays - a.plays).slice(0, 10),
      byPlatform: [...byPlatformMap.values()].sort((a, b) => b.plays - a.plays),
      byAccount,
      playsByHour,
      worksByDay
    }
  })
}
