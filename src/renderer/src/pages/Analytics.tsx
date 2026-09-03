import { useEffect, useId, useMemo, useState } from 'react'
import { api, cx } from '../lib/api'
import { Card, Button, Input, Field, Modal, Badge, Empty } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PLATFORM_MAP } from '../../../shared/platforms'
import type { AnalyticsSummary, WorkMetricRow, WorkStatRow } from '../../../shared/types'

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [works, setWorks] = useState<WorkStatRow[]>([])
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordTarget, setRecordTarget] = useState<WorkStatRow | null>(null)
  const [snapshotTarget, setSnapshotTarget] = useState<WorkStatRow | null>(null)
  const [snapshots, setSnapshots] = useState<WorkMetricRow[]>([])

  const load = async () => {
    const [s, w] = await Promise.all([api().getAnalytics(), api().getWorks()])
    setSummary(s)
    setWorks(w)
  }

  useEffect(() => {
    void load()
    return api().onRefresh(() => void load())
  }, [])

  const noData = !summary || summary.totalWorks === 0
  const peakHour = useMemo(() => {
    const rows = summary?.playsByHour ?? []
    if (!rows.length) return '-'
    return rows.reduce((a, b) => (b.count > a.count ? b : a)).hour
  }, [summary])

  return (
    <div className="space-y-5">
      {/* 顶部指标卡 */}
      <div className="grid grid-cols-6 gap-4">
        <MetricCard label="作品数" value={fmt(summary?.totalWorks)} />
        <MetricCard label="总播放" value={fmt(summary?.totalPlays)} />
        <MetricCard label="总点赞" value={fmt(summary?.totalLikes)} />
        <MetricCard label="总评论" value={fmt(summary?.totalComments)} />
        <MetricCard label="净涨粉" value={fmt(summary?.totalFans)} />
        <MetricCard label="互动率" value={summary ? `${summary.avgEngagementRate}%` : '-'} />
      </div>

      {noData ? (
        <Card>
          <Empty
            text="还没有数据。发布成功后，在下方作品列表点「录数据」，把播放/点赞等填进来，就能看到分析。"
            icon="📊"
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card title="各平台播放量" className="col-span-1">
              <div className="space-y-3">
                {summary!.byPlatform.map((p) => {
                  const max = Math.max(1, ...summary!.byPlatform.map((x) => x.plays))
                  return (
                    <div key={p.platform} className="flex items-center gap-3">
                      <PlatformAvatar platform={p.platform} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-ink-200">{PLATFORM_MAP[p.platform]?.name ?? p.platform}</span>
                          <span className="text-ink-400">{fmt(p.plays)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-aqua-400 transition-all duration-500"
                          style={{ width: `${(p.plays / max) * 100}%` }}
                        />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card title="账号表现" className="col-span-1">
              <div className="space-y-3">
                {summary!.byAccount.slice(0, 8).map((a) => (
                  <div key={a.account_id} className="flex items-center gap-2 text-xs">
                    <PlatformAvatar platform={a.platform} size={22} />
                    <span className="min-w-0 flex-1 truncate text-ink-200">{a.account_name}</span>
                    <span className="text-ink-400">{a.works} 作品</span>
                    <span className="w-16 text-right text-brand-300">{fmt(a.total_plays)}</span>
                    <span className="w-14 text-right text-emerald-300">{a.avg_like_rate}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="发布时间分布" extra={<span className="text-[11px] text-ink-400">峰值 {peakHour} 点</span>}>
              <div className="flex h-40 items-end gap-1">
                {summary!.playsByHour.map((h) => {
                  const max = Math.max(1, ...summary!.playsByHour.map((x) => x.count))
                  const isPeak = h.count === max && h.count > 0
                  return (
                    <div key={h.hour} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div
                        title={`${h.hour} 点发布 ${h.count} 条`}
                        className={cx(
                          'w-full rounded-t-md transition-all duration-300 group-hover:brightness-110',
                          isPeak
                            ? 'bg-gradient-to-b from-aqua-400 to-brand-500 shadow-[0_0_12px_-2px_var(--color-glow)]'
                            : h.count
                              ? 'bg-gradient-to-b from-brand-400/85 to-brand-600'
                              : 'bg-ink-700/70'
                        )}
                        style={{ height: `${Math.max((h.count / max) * 100, 1.5)}%` }}
                      />
                      {h.hour % 4 === 0 && <div className="text-[9px] text-ink-500">{h.hour}</div>}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-center text-[11px] text-ink-400">一天中各时段的发布条数</div>
            </Card>
          </div>

          {/* 作品榜单 */}
          <Card title="作品表现榜" extra={<span className="text-[11px] text-ink-400">点击「录数据」追加最新数据</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-700 text-ink-400">
                    <th className="px-3 py-2.5 font-medium">作品</th>
                    <th className="px-3 py-2.5 font-medium">平台</th>
                    <th className="px-3 py-2.5 text-right font-medium">播放</th>
                    <th className="px-3 py-2.5 text-right font-medium">点赞</th>
                    <th className="px-3 py-2.5 text-right font-medium">评论</th>
                    <th className="px-3 py-2.5 text-right font-medium">转发</th>
                    <th className="px-3 py-2.5 text-right font-medium">收藏</th>
                    <th className="px-3 py-2.5 text-right font-medium">涨粉</th>
                    <th className="px-3 py-2.5 text-right font-medium">互动率</th>
                    <th className="px-3 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map((w) => {
                    const rate = w.plays > 0 ? (((w.likes + w.comments) / w.plays) * 100).toFixed(2) : '0'
                    return (
                      <tr key={w.log_id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/50">
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-200">
                          {w.title ?? '(任务已删除)'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <PlatformAvatar platform={w.platform} size={18} />
                            <span className="text-ink-300">{w.account_name ?? '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-ink-200">{fmt(w.plays)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-200">{fmt(w.likes)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-200">{fmt(w.comments)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-200">{fmt(w.shares)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-200">{fmt(w.favorites)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-300">{w.fans_delta > 0 ? `+${fmt(w.fans_delta)}` : fmt(w.fans_delta)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-400">{rate}%</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-2">
                            <button
                              className="text-brand-400 transition-colors hover:text-brand-300"
                              onClick={() => {
                                setRecordTarget(w)
                                setRecordOpen(true)
                              }}
                            >
                              录数据
                            </button>
                            <button
                              className="text-ink-400 hover:text-ink-200"
                              onClick={async () => {
                                setSnapshotTarget(w)
                                setSnapshots(await api().getSnapshots(w.log_id))
                              }}
                            >
                              趋势
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* 录数据弹窗 */}
      <Modal
        open={recordOpen}
        title="录入作品数据"
        onClose={() => setRecordOpen(false)}
        footer={
          <>
            <Button onClick={() => setRecordOpen(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={async () => {
                const f = document.getElementById('metric-form') as HTMLFormElement | null
                if (!f) return
                const fd = new FormData(f)
                const num = (k: string) => parseInt(String(fd.get(k) ?? '0'), 10) || 0
                await api().recordMetric({
                  logId: recordTarget!.log_id,
                  plays: num('plays'),
                  likes: num('likes'),
                  comments: num('comments'),
                  shares: num('shares'),
                  favorites: num('favorites'),
                  fansDelta: num('fansDelta')
                })
                setRecordOpen(false)
                void load()
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <form id="metric-form" className="space-y-4">
          <div className="text-xs text-ink-400">
            为「{recordTarget?.title ?? '作品'}」录入最新数据，可多次录入形成时间趋势。
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="播放量"><Input name="plays" type="number" defaultValue={0} /></Field>
            <Field label="点赞"><Input name="likes" type="number" defaultValue={0} /></Field>
            <Field label="评论"><Input name="comments" type="number" defaultValue={0} /></Field>
            <Field label="转发"><Input name="shares" type="number" defaultValue={0} /></Field>
            <Field label="收藏"><Input name="favorites" type="number" defaultValue={0} /></Field>
            <Field label="涨粉"><Input name="fansDelta" type="number" defaultValue={0} /></Field>
          </div>
        </form>
      </Modal>

      {/* 趋势弹窗 */}
      <Modal
        open={!!snapshotTarget}
        title={`数据趋势 · ${snapshotTarget?.title ?? ''}`}
        onClose={() => setSnapshotTarget(null)}
      >
        {snapshots.length === 0 ? (
          <Empty text="该作品还没录入过数据" icon="📉" />
        ) : (
          <div className="space-y-4">
            <TrendLine data={snapshots.map((s) => ({ t: s.recorded_at.slice(5, 16), v: s.plays }))} label="播放" />
            <TrendLine data={snapshots.map((s) => ({ t: s.recorded_at.slice(5, 16), v: s.likes }))} label="点赞" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-700 text-ink-400">
                    <th className="px-2 py-1.5 font-medium">时间</th>
                    <th className="px-2 py-1.5 text-right font-medium">播放</th>
                    <th className="px-2 py-1.5 text-right font-medium">点赞</th>
                    <th className="px-2 py-1.5 text-right font-medium">评论</th>
                    <th className="px-2 py-1.5 text-right font-medium">涨粉</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b border-ink-800 last:border-0">
                      <td className="px-2 py-1.5 text-ink-400">{s.recorded_at.slice(5, 19)}</td>
                      <td className="px-2 py-1.5 text-right text-ink-200">{fmt(s.plays)}</td>
                      <td className="px-2 py-1.5 text-right text-ink-200">{fmt(s.likes)}</td>
                      <td className="px-2 py-1.5 text-right text-ink-200">{fmt(s.comments)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300">{s.fans_delta > 0 ? `+${s.fans_delta}` : s.fans_delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-ink-100">{value}</div>
    </Card>
  )
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '-'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function TrendLine({ data, label }: { data: { t: string; v: number }[]; label: string }) {
  const gid = useId().replace(/[:]/g, '')
  const W = 600
  const H = 180
  const PAD_X = 8
  const PAD_TOP = 12
  const PAD_BOT = 10

  const { linePath, areaPath, points, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.v))
    const min = Math.min(...data.map((d) => d.v))
    const range = max - min || 1
    const pts = data.map((d, i) => ({
      x: data.length === 1 ? W / 2 : PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2),
      y:
        data.length === 1
          ? H / 2
          : PAD_TOP + (1 - (d.v - min) / range) * (H - PAD_TOP - PAD_BOT)
    }))
    let line = ''
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      if (i === 0) {
        line += `M ${p1.x},${p1.y}`
        if (pts.length === 1) break
        continue
      }
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      line += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x},${p2.y}`
    }
    const area =
      pts.length > 1
        ? `${line} L ${pts[pts.length - 1].x},${H - PAD_BOT} L ${pts[0].x},${H - PAD_BOT} Z`
        : ''
    return { linePath: line, areaPath: area, points: pts, max }
  }, [data])

  const last = points[points.length - 1]

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
        <span>{label}</span>
        <span>峰值 {fmt(max)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full">
        <defs>
          <linearGradient id={`lg-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14c2ae" />
            <stop offset="100%" stopColor="#2bd4e5" />
          </linearGradient>
          <linearGradient id={`ar-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14c2ae" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#2bd4e5" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1="0"
            x2={W}
            y1={H * p}
            y2={H * p}
            stroke="var(--color-ink-800)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {areaPath && <path d={areaPath} fill={`url(#ar-${gid})`} />}
        {points.length === 1 && points[0] && (
          <circle cx={points[0].x} cy={points[0].y} r="4" fill="#2bd4e5" vectorEffect="non-scaling-stroke" />
        )}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#lg-${gid})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
            r="4"
            fill="#2bd4e5"
            stroke="var(--color-ink-850)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-500">
        <span>{data[0]?.t}</span>
        <span>{data[data.length - 1]?.t}</span>
      </div>
    </div>
  )
}
