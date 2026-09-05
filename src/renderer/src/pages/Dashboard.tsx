import { useEffect, useState } from 'react'
import { api, cx, shortTime } from '../lib/api'
import { Card, Badge, Empty, Button } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORM_MAP } from '../../../shared/platforms'
import type { Stats, PublishLogRow } from '../../../shared/types'

export default function Dashboard({ onNavigate }: { onNavigate: (k: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [logs, setLogs] = useState<PublishLogRow[]>([])

  const load = async () => {
    const [s, l] = await Promise.all([api().getStats(), api().getLogs({ limit: 12 })])
    setStats(s)
    setLogs(l)
  }

  useEffect(() => {
    void load()
    const off = api().onRefresh(() => void load())
    return off
  }, [])

  const rate = stats && stats.logSuccess + stats.logFailed > 0
    ? Math.round((stats.logSuccess / (stats.logSuccess + stats.logFailed)) * 100)
    : 0

  const cards = [
    { label: '在线账号', value: `${stats?.accountOnline ?? 0}/${stats?.accountTotal ?? 0}`, hint: '已登录 / 总数', to: 'accounts' },
    { label: '素材数量', value: stats?.materialTotal ?? 0, hint: '本地素材库', to: 'materials' },
    { label: '待处理任务', value: stats?.taskPending ?? 0, hint: '等待 / 进行中', to: 'tasks' },
    { label: '今日发布', value: stats?.logToday ?? 0, hint: '成功计入统计', to: 'history' }
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className="group cursor-pointer transition-all hover:border-brand-500/40 hover:shadow-[0_10px_30px_-14px_var(--color-glow)]"
          >
            <div onClick={() => onNavigate(c.to)}>
              <div className="flex items-center justify-between">
                <div className="text-xs text-ink-400">{c.label}</div>
                <div className="h-6 w-1.5 rounded-full bg-brand-gradient opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-ink-100">{c.value}</div>
              <div className="mt-1 text-[11px] text-ink-400">{c.hint}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="近 7 天发布量" className="col-span-2">
          <WeekChart data={stats?.last7Days ?? []} />
        </Card>

        <Card
          title="发布成功率"
          extra={<span className="text-[11px] text-ink-400">成功 / 总尝试</span>}
        >
          <div className="flex flex-col items-center justify-center py-4">
            <GaugeRing rate={rate} />
            <div className="mt-3 text-xs text-ink-400">
              成功 {stats?.logSuccess ?? 0} · 失败 {stats?.logFailed ?? 0}
            </div>
            <Button className="mt-4" size="sm" onClick={() => onNavigate('publish')}>
              新建发布任务
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="各平台发布情况" className="col-span-1">
          {!stats?.byPlatform.length ? (
            <Empty text="还没有发布记录" />
          ) : (
            <div className="space-y-3">
              {stats.byPlatform.map((p) => {
                const ok = p.total ? Math.round((p.success / p.total) * 100) : 0
                return (
                  <div key={p.platform} className="flex items-center gap-3">
                    <PlatformAvatar platform={p.platform} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-200">{PLATFORM_MAP[p.platform]?.name ?? p.platform}</span>
                        <span className="text-ink-400">{p.total} 次</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-aqua-400 transition-all duration-500"
                          style={{ width: `${ok}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-9 text-right text-[11px] text-ink-400">{ok}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card
          title="最近发布记录"
          className="col-span-2"
          extra={
            <button className="text-xs text-brand-400 transition-colors hover:text-brand-300" onClick={() => onNavigate('history')}>
              查看全部 →
            </button>
          }
        >
          {!logs.length ? (
            <Empty text="暂无记录" />
          ) : (
            <div className="space-y-1.5">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-800">
                  <PlatformAvatar platform={l.platform} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-ink-200">{l.task_title ?? '(已删除任务)'}</div>
                    <div className="text-[11px] text-ink-400">
                      {l.account_name ?? '未知账号'} · {shortTime(l.finished_at ?? l.started_at)}
                    </div>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; tone: 'default' | 'blue' | 'green' | 'red' | 'amber' }> = {
    pending: { text: '等待中', tone: 'default' },
    running: { text: '进行中', tone: 'blue' },
    waiting: { text: '等待重试', tone: 'amber' },
    'waiting-captcha': { text: '等待验证', tone: 'amber' },
    'waiting-manual': { text: '等待手动发布', tone: 'amber' },
    uploading: { text: '上传中', tone: 'blue' },
    filling: { text: '填写中', tone: 'blue' },
    publishing: { text: '提交中', tone: 'blue' },
    launching: { text: '启动浏览器', tone: 'blue' },
    success: { text: '成功', tone: 'green' },
    failed: { text: '失败', tone: 'red' },
    canceled: { text: '已取消', tone: 'amber' },
    draft: { text: '草稿', tone: 'default' },
    partial: { text: '部分成功', tone: 'amber' }
  }
  const m = map[status] ?? { text: status, tone: 'default' as const }
  return <Badge tone={m.tone}>{m.text}</Badge>
}

function WeekChart({ data }: { data: { date: string; count: number }[] }) {
  const days: { date: string; count: number; isToday: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    days.push({
      date: key,
      count: data.find((x) => x.date === key)?.count ?? 0,
      isToday: i === 0
    })
  }
  const max = Math.max(1, ...days.map((d) => d.count))

  return (
    <div>
      <div className="relative h-44">
        {/* 横向网格线 */}
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="pointer-events-none absolute inset-x-0 border-t border-ink-800/70"
            style={{ top: `${p}%` }}
          />
        ))}
        <div className="relative flex h-full items-end gap-2">
          {days.map((d) => {
            const h = (d.count / max) * 100
            return (
              <div
                key={d.date}
                title={`${d.date} · 发布 ${d.count} 条`}
                className="group flex h-full flex-1 cursor-default flex-col justify-end"
              >
                <div
                  className={cx(
                    'mb-1.5 text-center text-[11px] font-medium transition-colors',
                    d.count ? (d.isToday ? 'text-aqua-400' : 'text-ink-300') : 'text-transparent'
                  )}
                >
                  {d.count}
                </div>
                <div
                  className={cx(
                    'w-full rounded-t-lg transition-all duration-300 group-hover:brightness-110',
                    d.count
                      ? d.isToday
                        ? 'bg-gradient-to-b from-aqua-400 to-brand-500 shadow-[0_0_16px_-2px_var(--color-glow)]'
                        : 'bg-gradient-to-b from-brand-400/90 to-brand-600'
                      : 'bg-ink-700/70'
                  )}
                  style={{ height: `${Math.max(h, d.count ? 8 : 1.5)}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2.5 flex gap-2 border-t border-ink-800 pt-2">
        {days.map((d) => (
          <div key={d.date} className="flex-1 text-center">
            <span className={cx('text-[11px]', d.isToday ? 'font-medium text-brand-300' : 'text-ink-400')}>
              {d.isToday ? '今天' : d.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GaugeRing({ rate }: { rate: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  const filled = (rate / 100) * C
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="gauge-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#36e0c8" />
            <stop offset="100%" stopColor="#2bd4e5" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--color-ink-700)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="url(#gauge-g)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-semibold text-ink-100">{rate}%</div>
        <div className="text-[10px] text-ink-400">成功率</div>
      </div>
    </div>
  )
}
