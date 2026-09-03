import { useEffect, useMemo, useState } from 'react'
import { api, shortTime, formatDurationMs } from '../lib/api'
import { Card, Input, Empty, Button } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORMS } from '../../../shared/platforms'
import { StatusBadge } from './Dashboard'
import type { PublishLogRow } from '../../../shared/types'

export default function History() {
  const [logs, setLogs] = useState<PublishLogRow[]>([])
  const [platform, setPlatform] = useState('all')
  const [status, setStatus] = useState('all')
  const [days, setDays] = useState(0)
  const [kw, setKw] = useState('')

  const load = async () => {
    setLogs(await api().getLogs({ limit: 300, platform, status, days, keyword: kw }))
  }

  useEffect(() => {
    void load()
    return api().onRefresh(() => void load())
  }, [platform, status, days])

  const summary = useMemo(() => {
    const total = logs.length
    const ok = logs.filter((l) => l.status === 'success').length
    const fail = logs.filter((l) => l.status === 'failed').length
    const avg = logs.filter((l) => l.duration_ms).reduce((s, l) => s + (l.duration_ms ?? 0), 0)
    const n = logs.filter((l) => l.duration_ms).length
    return { total, ok, fail, avg: n ? Math.round(avg / n) : 0 }
  }, [logs])

  const retryFailed = async () => {
    const failed = logs.filter((l) => l.status === 'failed' || l.status === 'canceled')
    if (!failed.length) return
    if (!confirm(`将重新发布 ${failed.length} 条失败记录，确定吗？`)) return
    for (const l of failed) {
      try {
        await api().retryLog(l.id)
      } catch (e) {
        console.error(e)
      }
    }
    void load()
  }

  const exportCsv = async () => {
    const p = await api().exportLogs({ platform, status, days, keyword: kw })
    if (p) alert(`已导出到：\n${p}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="搜索标题 / 账号…"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void load()}
        />
        <Select value={platform} onChange={setPlatform} options={[['all', '全部平台'], ...PLATFORMS.map((p) => [p.id, p.name] as [string, string])]} />
        <Select
          value={status}
          onChange={setStatus}
          options={[
            ['all', '全部状态'],
            ['success', '成功'],
            ['failed', '失败'],
            ['running', '进行中'],
            ['pending', '等待中'],
            ['canceled', '已取消']
          ]}
        />
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            ['0', '全部时间'],
            ['1', '近 1 天'],
            ['7', '近 7 天'],
            ['30', '近 30 天']
          ]}
        />
        <Button size="sm" onClick={() => void load()}>
          查询
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => void retryFailed()} disabled={!summary.fail}>
            重发失败（{summary.fail}）
          </Button>
          <Button size="sm" onClick={() => void exportCsv()} disabled={!logs.length}>
            导出 CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MiniCard label="记录总数" value={summary.total} />
        <MiniCard label="成功" value={summary.ok} tone="text-emerald-400" />
        <MiniCard label="失败" value={summary.fail} tone="text-red-400" />
        <MiniCard label="平均耗时" value={`${Math.floor(summary.avg / 60)}分${summary.avg % 60}秒`} />
      </div>

      <Card className="p-0">
        {!logs.length ? (
          <Empty text="没有符合条件的发布记录" icon="📊" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ink-700 text-ink-400">
                  <th className="px-4 py-3 font-medium">平台</th>
                  <th className="px-4 py-3 font-medium">标题</th>
                  <th className="px-4 py-3 font-medium">账号</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">耗时</th>
                  <th className="px-4 py-3 font-medium">完成时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <PlatformAvatar platform={l.platform} size={22} />
                      </div>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 text-ink-200">
                      {l.task_title ?? '(任务已删除)'}
                      {l.error && (
                        <div className="mt-0.5 truncate text-[11px] text-red-400" title={l.error}>
                          {l.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-300">{l.account_name ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-2.5 text-ink-400">{formatDurationMs(l.duration_ms)}</td>
                    <td className="px-4 py-2.5 text-ink-400">{shortTime(l.finished_at ?? l.started_at)}</td>
                    <td className="px-4 py-2.5">
                      {l.result_url ? (
                        <button
                          className="text-brand-400 hover:text-brand-300"
                          onClick={() => api().openExternal(l.result_url!)}
                        >
                          打开链接
                        </button>
                      ) : (
                        <span className="text-ink-500">-</span>
                      )}
                      {['failed', 'canceled'].includes(l.status) && (
                        <button
                          className="ml-3 text-amber-400 hover:underline"
                          onClick={async () => {
                            try {
                              await api().retryLog(l.id)
                              void load()
                            } catch (e) {
                              alert((e as Error).message)
                            }
                          }}
                        >
                          重发
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function MiniCard({ label, value, tone = 'text-ink-100' }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${tone}`}>{value}</div>
    </Card>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-ink-600 bg-ink-900 px-3 text-xs text-ink-200 focus:border-brand-500"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}
