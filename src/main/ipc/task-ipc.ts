import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'
import * as db from '../db'
import { enqueueTask, cancelAll, isBusy, enqueueLog } from '../task-runner'
import { normalizeTime } from '../scheduler'
import { PLATFORM_MAP } from '../../shared/platforms'
import type { TaskInput } from '../../shared/types'

export function registerTaskIPC(notify: () => void): void {
  ipcMain.handle('task:list', (_e, q: import('../db').TaskQuery = {}) => db.listTasks(q))
  ipcMain.handle('task:get', (_e, id: number) => db.getTask(id))

  ipcMain.handle('task:create', (_e, input: TaskInput) => {
    if (!input.title?.trim()) throw new Error('标题不能为空')
    if (!input.videoPath) throw new Error('请选择视频文件')
    if (!input.targets?.length) throw new Error('请至少选择一个发布账号')

    const normalized: TaskInput = { ...input }
    if (input.publishMode === 'scheduled') {
      if (!input.scheduledAt) throw new Error('请选择定时发布时间')
      normalized.scheduledAt = normalizeTime(input.scheduledAt)
    }

    const task = db.createTask(normalized)
    // 立即发布：直接入队开始跑；定时任务交给调度器扫描
    if (task.publish_mode === 'now') enqueueTask(task)
    notify()
    return task
  })

  ipcMain.handle('task:runNow', (_e, id: number) => {
    const t = db.getTask(id)
    if (!t) throw new Error('任务不存在')
    // 清掉旧的失败日志再重跑
    for (const l of db.listPublishLogs({ limit: 1000 })) {
      if (l.task_id === id && (l.status === 'failed' || l.status === 'canceled')) {
        db.updatePublishLog(l.id, { status: 'pending', error: null, message: null })
      }
    }
    enqueueTask({ ...t, publish_mode: 'now' })
    notify()
    return true
  })

  ipcMain.handle('task:remove', (_e, id: number) => {
    db.removeTask(id)
    notify()
    return true
  })

  ipcMain.handle('task:cancel', () => {
    cancelAll()
    notify()
    return true
  })

  ipcMain.handle('task:busy', () => isBusy())

  /* ---- 发布记录 / 统计 ---- */
  ipcMain.handle('log:list', (_e, q) => db.listPublishLogs(q ?? {}))
  ipcMain.handle('stats:get', () => db.getStats())

  /** 单条失败记录重发 */
  ipcMain.handle('log:retry', (_e, id: number) => {
    enqueueLog(id)
    notify()
    return true
  })

  /** 导出当前筛选结果为 CSV（带 BOM，Excel 直接打开不乱码） */
  ipcMain.handle('log:export', async (_e, q) => {
    const rows = db.listPublishLogs({ ...(q ?? {}), limit: 5000 })
    if (!rows.length) throw new Error('没有可导出的记录')

    const esc = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return `"${s}"`
    }
    const head = ['记录ID', '平台', '账号', '标题', '状态', '耗时(毫秒)', '开始时间', '完成时间', '结果链接', '错误信息']
    const body = rows.map((r) =>
      [
        r.id,
        PLATFORM_MAP[r.platform]?.name ?? r.platform,
        r.account_name ?? '',
        r.task_title ?? '',
        STATUS_CN[r.status] ?? r.status,
        r.duration_ms ?? '',
        r.started_at ?? '',
        r.finished_at ?? '',
        r.result_url ?? '',
        r.error ?? ''
      ]
        .map(esc)
        .join(',')
    )
    const csv = '﻿' + [head.map(esc).join(','), ...body].join('\r\n')

    const res = await dialog.showSaveDialog({
      title: '导出发布记录',
      defaultPath: `发布记录_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, csv, 'utf8')
    return res.filePath
  })
}

const STATUS_CN: Record<string, string> = {
  pending: '等待中',
  running: '进行中',
  success: '成功',
  failed: '失败',
  canceled: '已取消'
}
