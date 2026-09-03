import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Button, Card, Input, Field, Modal, Badge, Empty } from '../components/ui'
import { PlatformAvatar } from '../components/PlatformIcon'
import { PlatformLogo } from '../components/platform-logos'
import { PLATFORMS, GROUPS, PLATFORM_MAP } from '../../../shared/platforms'
import type { AccountRow } from '../../../shared/types'

const LEVEL_LABEL: Record<string, { text: string; tone: 'green' | 'amber' | 'default' }> = {
  full: { text: '全自动', tone: 'green' },
  generic: { text: '通用', tone: 'amber' },
  assist: { text: '人工兜底', tone: 'default' }
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [filter, setFilter] = useState('all')
  const [group, setGroup] = useState('all')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [form, setForm] = useState({ platform: 'douyin', name: '', remark: '', group: '' })
  const [editFans, setEditFans] = useState<AccountRow | null>(null)
  const [fansInput, setFansInput] = useState('')

  const load = async () => setAccounts(await api().getAccounts())

  useEffect(() => {
    void load()
    return api().onRefresh(() => void load())
  }, [])

  const countOf = (platform: string) => accounts.filter((a) => a.platform === platform).length

  const filtered = useMemo(() => {
    let list = accounts
    if (group !== 'all') list = list.filter((a) => PLATFORM_MAP[a.platform]?.group === group)
    if (filter !== 'all') list = list.filter((a) => a.platform === filter)
    return list
  }, [accounts, group, filter])

  const add = async () => {
    if (!form.name.trim()) return alert('请填写账号备注名')
    await api().addAccount(form.platform, form.name.trim(), form.remark, form.group)
    setForm({ platform: form.platform, name: '', remark: '', group: '' })
    setOpen(false)
    void load()
  }

  const login = async (id: number) => {
    setBusy((b) => ({ ...b, [id]: true }))
    await api().loginAccount(id)
    alert('已打开浏览器窗口，请在该窗口中完成扫码 / 手机号登录，登录后直接关闭窗口即可。')
    setBusy((b) => ({ ...b, [id]: false }))
  }

  const check = async (id: number) => {
    setBusy((b) => ({ ...b, [id]: true }))
    await api().checkAccount(id)
    void load()
    setBusy((b) => ({ ...b, [id]: false }))
  }

  const checkAll = async () => {
    setBusy(Object.fromEntries(accounts.map((a) => [a.id, true])))
    await api().checkAllAccounts()
    void load()
    setBusy({})
  }

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setGroup('all')
              setFilter('all')
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              group === 'all' && filter === 'all'
                ? 'bg-brand-600 text-white'
                : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
            }`}
          >
            全部
          </button>
          {GROUPS.map((g) => {
            const n = accounts.filter((a) => PLATFORM_MAP[a.platform]?.group === g).length
            return (
              <button
                key={g}
                onClick={() => {
                  setGroup(g)
                  setFilter('all')
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  group === g
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                }`}
              >
                {g} {n > 0 && `(${n})`}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={checkAll} disabled={!accounts.length}>
            检测全部登录态
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            + 添加账号
          </Button>
        </div>
      </div>

      {/* 平台图标筛选条 */}
      <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-3">
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => {
            const n = countOf(p.id)
            const active = filter === p.id
            return (
              <button
                key={p.id}
                onClick={() => setFilter(active ? 'all' : p.id)}
                title={`${p.name}${n ? ` · ${n} 个账号` : ''}`}
                className={`relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border transition-all ${
                  active
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-transparent hover:border-ink-600 hover:bg-ink-800'
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/95 shadow-sm">
                  <PlatformLogo platform={p.id} size={20} />
                </span>
                <span className="text-[10px] leading-none text-ink-300">{p.name}</span>
                {n > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-medium text-white">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 账号列表 */}
      {!filtered.length ? (
        <Card>
          <Empty
            text={accounts.length ? '当前筛选下没有账号' : '还没有账号，点右上角「添加账号」开始'}
            icon="👤"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((a) => {
            const meta = PLATFORM_MAP[a.platform]
            const lv = LEVEL_LABEL[meta?.level ?? 'generic']
            return (
              <Card key={a.id} className="transition-colors hover:border-ink-600">
                <div className="flex items-start gap-3">
                  <AccountAvatar account={a} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink-100">{a.name}</span>
                      <Badge tone={a.is_logged_in ? 'green' : 'default'}>
                        {a.is_logged_in ? '已登录' : '未登录'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
                      <span className="flex items-center gap-1 rounded bg-ink-800 px-1.5 py-0.5">
                        <span className="flex items-center">
                          <PlatformLogo platform={a.platform} size={11} />
                        </span>
                        {meta?.name ?? a.platform}
                      </span>
                      {a.group_name && <span>· {a.group_name}</span>}
                      {a.remark && <span className="truncate">· {a.remark}</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-3">
                  <div className="flex items-center gap-3 text-[11px] text-ink-400">
                    <span className="flex items-center gap-1">
                      👥 粉丝{' '}
                      <button
                        className="font-medium text-ink-200 hover:text-brand-400"
                        title="点击手动同步粉丝数"
                        onClick={() => {
                          setEditFans(a)
                          setFansInput(a.fans ?? '')
                        }}
                      >
                        {a.fans ? formatFans(a.fans) : '点击录入'}
                      </button>
                    </span>
                    <span className="text-ink-500">上次检测 {a.last_check?.slice(5, 16) ?? '从未'}</span>
                  </div>
                  <Badge tone={lv?.tone ?? 'default'}>{lv?.text ?? ''}</Badge>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => login(a.id)} disabled={busy[a.id]}>
                    {a.is_logged_in ? '重新登录' : '登录'}
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => check(a.id)} disabled={busy[a.id]}>
                    检测
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-400 hover:bg-red-500/10"
                    onClick={async () => {
                      if (confirm(`确定删除账号「${a.name}」？登录态也会一并清除。`)) {
                        await api().removeAccount(a.id)
                        void load()
                      }
                    }}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* 添加账号弹窗 */}
      <Modal
        open={open}
        title="添加账号"
        onClose={() => setOpen(false)}
        width="max-w-2xl"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={add}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="选择平台">
            <div className="space-y-4">
              {GROUPS.map((g) => (
                <div key={g}>
                  <div className="mb-2 text-[11px] font-semibold text-ink-400">{g}</div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLATFORMS.filter((p) => p.group === g).map((p) => {
                      const active = form.platform === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => setForm((f) => ({ ...f, platform: p.id }))}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 transition-colors ${
                            active
                              ? 'border-brand-500 bg-brand-500/10'
                              : 'border-ink-700 hover:border-ink-500'
                          }`}
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                            <PlatformLogo platform={p.id} size={26} />
                          </span>
                          <span className={`text-[11px] ${active ? 'text-ink-100' : 'text-ink-300'}`}>
                            {p.name}
                          </span>
                          <Badge tone={LEVEL_LABEL[p.level]?.tone ?? 'default'}>
                            {LEVEL_LABEL[p.level]?.text ?? ''}
                          </Badge>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="账号备注名" hint="区分同平台多个账号">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：主号 / 矩阵号 A / 小王"
              />
            </Field>
            <Field label="分组" hint="选填">
              <Input
                value={form.group}
                onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                placeholder="例如：美妆组"
              />
            </Field>
          </div>

          <Field label="备注" hint="选填">
            <Input
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              placeholder="选填"
            />
          </Field>

          <p className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-ink-400">
            添加后点「登录」，会打开一个独立的浏览器窗口（每个账号独立 profile，登录态长期保存）。
            扫码或手机号登录完成后，直接关闭窗口，随后点「检测」确认状态。
          </p>
        </div>
      </Modal>

      {/* 手动同步粉丝 */}
      <Modal
        open={!!editFans}
        title={`同步粉丝数 · ${editFans?.name ?? ''}`}
        onClose={() => setEditFans(null)}
        footer={
          <>
            <Button onClick={() => setEditFans(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (editFans) {
                  await api().setFans(editFans.id, fansInput.trim())
                  setEditFans(null)
                  void load()
                }
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="粉丝数" hint="从创作者后台看到的数字，支持 1.2万 / 12345 等格式">
            <Input
              value={fansInput}
              onChange={(e) => setFansInput(e.target.value)}
              placeholder="例如：3.5万 或 35000"
              autoFocus
            />
          </Field>
          <p className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-ink-400">
            由于各平台后台粉丝数是动态渲染且风控严格，自动抓取易触发验证码，故采用手动同步。
            登录检测时工具会尽力自动抓一次，若没抓到，你在这里手动填一下即可。
          </p>
        </div>
      </Modal>
    </div>
  )
}

/** 账号头像：有真实头像用真实头像，右下角叠平台 logo 角标；没有则用平台色块头像 */
function AccountAvatar({ account, size = 44 }: { account: AccountRow; size?: number }) {
  if (account.avatar) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <img
          src={account.avatar}
          alt={account.name}
          className="h-full w-full rounded-xl object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 ring-1 ring-ink-700">
          <PlatformLogo platform={account.platform} size={12} />
        </span>
      </div>
    )
  }
  return <PlatformAvatar platform={account.platform} size={size} radius={12} />
}

function formatFans(s: string): string {
  const n = parseFloat(s.replace(/[万亿]/g, (m) => (m === '万' ? 'e4' : 'e8')))
  if (Number.isNaN(n)) return s
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(Math.round(n))
}
