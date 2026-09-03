import { useEffect, useMemo, useState } from 'react'
import { api, shortTime } from '../lib/api'
import { Card, Button, Badge, Empty, ProgressBar } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORM_MAP } from '../../../shared/platforms'
import { StatusBadge } from './Dashboard'
import type { ProgressPayload, PublishLogRow, TaskRow } from '../../../shared/types'

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [logs, setLogs] = useState<PublishLogRow[]>([])
  const [progress, setProgress] = useState<Record<number, ProgressPayload>>({})
  const [filter, setFilter] = useState('all')

  const load = async () => {
    const [t, l] = await Promise.all([api().getTasks({ limit: 100 }), api().getLogs({ limit: 500 })])
    setTasks(t)
    setLogs(l)
  }

  useEffect(() => {
    void load()
    const offRefresh = api().onRefresh(() => void load())
    const offProgress = api().onProgress((p) => {
      setProgress((m) => ({ ...m, [p.logId ?? 0]: p }))
      if (p.status === 'success' || p.status === 'failed') void load()
    })
    return () => {
      offRefresh()
      offProgress()
    }
  }, [])

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? tasks
        : tasks.filter((t) => (filter === 'active' ? ['pending', 'running'].includes(t.status) : t.status === filter)),
    [tasks, filter]
  )

  const logsOf = (id: number) => logs.filter((l) => l.task_id === id)

  const runningCount = tasks.filter((t) => t.status === 'running').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[
            ['all', '全部'],
            ['active', '进行中'],
            ['success', '成功'],
            ['partial', '部分成功'],
            ['failed', '失败']
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                filter === k ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="danger" disabled={!runningCount} onClick={() => void api().cancelTasks()}>
          取消进行中的任务
        </Button>
      </div>

      {!filtered.length ? (
        <Card>
          <Empty text="没有符合条件的任务" icon="🗂️" />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const ls = logsOf(t.id)
            const done = ls.filter((l) => ['success', 'failed', 'canceled'].includes(l.status)).length
            const pct = ls.length ? Math.round((done / ls.length) * 100) : 0
            return (
              <Card key={t.id}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-100">{t.title}</span>
                      <StatusBadge status={t.status} />
                      {t.publish_mode === 'scheduled' && (
                        <Badge tone="amber">定时 {shortTime(t.scheduled_at)}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-400">
                      创建于 {shortTime(t.created_at)} · {ls.length} 个目标 ·{' '}
                      {t.video_path.split(/[\\/]/).pop()}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {['failed', 'partial', 'canceled'].includes(t.status) && (
                      <Button size="sm" onClick={() => void api().runTaskNow(t.id)}>
                        重新发布
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => api().openInFolder(t.video_path)}>
                      打开视频
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:bg-red-500/10"
                      onClick={async () => {
                        if (confirm('删除该任务及其发布记录？')) {
                          await api().removeTask(t.id)
                          void load()
                        }
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {['pending', 'running'].includes(t.status) && (
                  <div className="mt-3">
                    <ProgressBar value={pct} />
                  </div>
                )}

                <div className="mt-3 space-y-1.5">
                  {ls.map((l) => {
                    const p = progress[l.id]
                    return (
                      <div
                        key={l.id}
                        className="flex items-center gap-3 rounded-lg bg-ink-900/60 px-3 py-2"
                      >
                        <PlatformAvatar platform={l.platform} size={22} />
                        <span className="w-16 shrink-0 text-xs text-ink-300">
                          {PLATFORM_MAP[l.platform]?.name ?? l.platform}
                        </span>
                        <span className="w-24 shrink-0 truncate text-[11px] text-ink-400">
                          {l.account_name ?? `#${l.account_id}`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-400">
                          {p?.message ?? l.message ?? l.error ?? (l.status === 'pending' ? '排队中…' : '')}
                        </span>
                        {l.result_url && (
                          <button
                            className="shrink-0 text-[11px] text-brand-400 hover:text-brand-300"
                            onClick={() => api().openExternal(l.result_url!)}
                          >
                            查看
                          </button>
                        )}
                        <StatusBadge status={p && l.status === 'running' ? p.status : l.status} />
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
