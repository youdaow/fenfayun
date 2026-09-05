import { useEffect, useState } from 'react'
import { api, cx } from '../lib/api'
import { applyAccent } from '../components/ThemeToggle'
import { Card, Button, Input, Field, Badge } from '../components/ui'
import QRCode from 'qrcode'

type InboxStatus = { running: boolean; port: number; url: string; ip: string }

export default function Settings() {
  const [info, setInfo] = useState<{ version: string; dataRoot: string; profilesRoot: string; dbPath: string } | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [inbox, setInbox] = useState<InboxStatus | null>(null)
  const [qr, setQr] = useState<string>('')
  const [pin, setPin] = useState<string>('')

  useEffect(() => {
    void api().getAppInfo().then(setInfo)
    void api().getSettings().then((s) => {
      setSettings(s)
      setPin(s['inbox.pin'] ?? '')
    })
    void api().inboxStatus().then(setInbox)
  }, [])

  const save = async (k: string, v: string) => {
    await api().setSetting(k, v)
    setSettings((s) => ({ ...s, [k]: v }))
  }

  const toggleInbox = async () => {
    if (inbox?.running) {
      await api().inboxStop()
      setInbox(await api().inboxStatus())
      setQr('')
    } else {
      const st = await api().inboxStart()
      setInbox(st)
      try {
        const url = pin ? `${st.url}/?pin=${encodeURIComponent(pin)}` : st.url
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 240 }))
      } catch {
        setQr('')
      }
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* iPad 收件箱 */}
      <Card title="📥 iPad 视频收件箱" className="col-span-2">
        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs leading-relaxed text-ink-300">
              在 iPad 上剪好视频后，用同一 WiFi 网络打开下面地址，选视频上传，文件会直接落到电脑素材库并自动登记，随后就能在「发布」里分发了。
            </p>
            {inbox?.running ? (
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  收件箱已开启
                </div>
                <div className="mt-2 font-mono text-lg text-ink-100">{inbox.url}</div>
                <div className="mt-1 text-[11px] text-ink-400">
                  iPad 用 Safari 打开上面的地址即可上传（需与电脑同一 WiFi）
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-ink-800 p-3 text-xs text-ink-400">
                收件箱未开启，点击右侧按钮启动。
              </div>
            )}
            <Button variant={inbox?.running ? 'danger' : 'primary'} onClick={toggleInbox}>
              {inbox?.running ? '停止收件箱' : '开启收件箱'}
            </Button>
            <Field label="上传 PIN" hint="设置后 iPad 需输入 PIN 才能上传；清空则不设防">
              <div className="flex gap-2">
                <Input
                  className="w-32"
                  value={pin}
                  maxLength={8}
                  placeholder="例如 2468"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => void save('inbox.pin', pin)}
                />
                {inbox?.running && pin && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const st = await api().inboxStatus()
                      setInbox(st)
                      try {
                        setQr(
                          await QRCode.toDataURL(`${st.url}/?pin=${encodeURIComponent(pin)}`, {
                            margin: 1,
                            width: 240
                          })
                        )
                      } catch {
                        setQr('')
                      }
                    }}
                  >
                    重新生成二维码
                  </Button>
                )}
              </div>
            </Field>
          </div>

          <div className="shrink-0 text-center">
            {qr ? (
              <div className="rounded-lg bg-white p-2">
                <img src={qr} alt="扫码上传" className="h-40 w-40" />
              </div>
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-ink-800 text-5xl">
                📥
              </div>
            )}
            <div className="mt-2 text-[11px] text-ink-400">iPad 扫码打开</div>
          </div>
        </div>
      </Card>

      <Card title="运行参数">
        <div className="space-y-4">
          <Field label="并发发布数" hint="同时拉起几个浏览器窗口，建议 1～2">
            <div className="flex gap-2">
              {['1', '2', '3'].map((n) => (
                <button
                  key={n}
                  onClick={() => save('concurrency', n)}
                  className={`h-9 flex-1 rounded-lg border text-xs transition-colors ${
                    (settings.concurrency ?? '1') === n
                      ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                      : 'border-ink-600 text-ink-400 hover:border-ink-500'
                  }`}
                >
                  {n} 个
                </button>
              ))}
            </div>
          </Field>

          <Field label="浏览器路径" hint="留空自动探测 Chrome / Edge">
            <div className="flex gap-2">
              <Input
                value={settings.browserPath ?? ''}
                placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                onChange={(e) => setSettings((s) => ({ ...s, browserPath: e.target.value }))}
              />
              <Button
                onClick={async () => {
                  const p = await api().selectExe()
                  if (p) {
                    setSettings((s) => ({ ...s, browserPath: p }))
                    await save('browserPath', p)
                  }
                }}
              >
                浏览
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              未指定时按 Chrome → Edge → Playwright Chromium 顺序自动探测。
            </p>
          </Field>

          <Field label="网络代理" hint="发布 TikTok/YouTube 等海外平台通常需要；账号上单独填的优先生效">
            <Input
              value={settings['proxy.global'] ?? ''}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080（留空直连）"
              onChange={(e) => setSettings((s) => ({ ...s, 'proxy.global': e.target.value }))}
              onBlur={() => void save('proxy.global', settings['proxy.global'] ?? '')}
            />
          </Field>

          <Field label="失败自动重试" hint="发布失败后自动重试的次数（退避 30/90/180 秒）">
            <div className="flex gap-2">
              {['0', '1', '2', '3'].map((n) => (
                <button
                  key={n}
                  onClick={() => save('autoRetry', n)}
                  className={`h-9 flex-1 rounded-lg border text-xs transition-colors ${
                    (settings.autoRetry ?? '1') === n
                      ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                      : 'border-ink-600 text-ink-400 hover:border-ink-500'
                  }`}
                >
                  {n} 次
                </button>
              ))}
            </div>
          </Field>

          <Field label="窗口与自启">
            <div className="space-y-2 text-xs text-ink-300">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-brand-500"
                  checked={(settings.closeToTray ?? '1') === '1'}
                  onChange={async (e) => {
                    await save('closeToTray', e.target.checked ? '1' : '0')
                  }}
                />
                点关闭窗口时最小化到系统托盘（保持定时任务运行）
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-brand-500"
                  checked={(settings.minimizeToTray ?? '0') === '1'}
                  onChange={async (e) => {
                    await save('minimizeToTray', e.target.checked ? '1' : '0')
                  }}
                />
                最小化时也收进托盘
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-brand-500"
                  checked={(settings.launchAtLogin ?? '0') === '1'}
                  onChange={async (e) => {
                    const ok = await api().setLaunchAtLogin(e.target.checked)
                    if (ok) await save('launchAtLogin', e.target.checked ? '1' : '0')
                  }}
                />
                开机自动启动分发云
              </label>
            </div>
          </Field>
        </div>
      </Card>

      {/* 远程中转 */}
      <RelayCard />

      {/* 页面配色 */}
      <SchemeCard />

      {/* 安全锁 */}
      <SecurityCard />

      <Card title="数据与环境">
        <div className="space-y-3 text-xs">
          <Row label="应用版本" value={info?.version ?? '-'} />
          <Row label="数据目录" value={info?.dataRoot ?? '-'} />
          <Row label="账号 Profile 目录" value={info?.profilesRoot ?? '-'} />
          <Row label="数据库文件" value={info?.dbPath ?? '-'} />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => api().openDataDir()}>
              打开数据目录
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const p = await api().backupDb()
                if (p) alert('已备份到：\n' + p)
              }}
            >
              备份数据库
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!confirm('恢复会用备份文件整体替换当前数据（账号/任务/记录），并自动先备份现状。继续？')) return
                try {
                  const p = await api().restoreDb()
                  if (p) alert('已从备份恢复：\n' + p + '\n建议立即重启应用。')
                } catch (e) {
                  alert('恢复失败：' + ((e as Error).message ?? e))
                }
              }}
            >
              从备份恢复
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-400">
            备份包含账号列表、任务、发布记录与数据录入；浏览器登录态在各账号 Profile 目录中，
            换机时请连同 Profile 目录一起拷贝。
          </p>
        </div>
      </Card>

      <Card title="使用说明" className="col-span-2">
        <div className="space-y-3 text-xs leading-relaxed text-ink-300">
          <div className="flex gap-2">
            <Badge tone="blue">1</Badge>
            <span>在「账号管理」添加账号并登录，每个账号使用独立浏览器 profile，登录态长期有效。</span>
          </div>
          <div className="flex gap-2">
            <Badge tone="blue">2</Badge>
            <span>把常用视频登记进「素材库」，发布时可一键选用，省去每次找文件的麻烦。</span>
          </div>
          <div className="flex gap-2">
            <Badge tone="blue">3</Badge>
            <span>在「发布」页填写内容、勾选目标账号，可立即发布，也可设定时间定时分发。</span>
          </div>
          <div className="flex gap-2">
            <Badge tone="blue">4</Badge>
            <span>「任务队列」实时展示每个账号的上传进度，「发布记录」可回看历史成败与耗时。</span>
          </div>
          <div className="mt-2 rounded-lg bg-amber-500/10 p-3 text-[11px] text-amber-300">
            注意：各平台页面结构会不定期调整，若某平台发布失败，通常是上传页改版导致选择器失效，
            更新对应平台适配器的选择器即可恢复。
          </div>
        </div>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-ink-800 pb-2.5 last:border-0">
      <span className="w-32 shrink-0 text-ink-400">{label}</span>
      <span className="min-w-0 flex-1 break-all text-ink-200">{value}</span>
    </div>
  )
}

/** 页面配色：品牌色方案切换（存 settings.accent，实时生效） */
const ACCENTS = [
  { key: '', name: '蓝绿', from: '#14c2ae', to: '#2bd4e5' },
  { key: 'ocean', name: '海洋蓝', from: '#3b82f6', to: '#38bdf8' },
  { key: 'violet', name: '暗夜紫', from: '#8b5cf6', to: '#c084fc' },
  { key: 'sunset', name: '日落橙', from: '#f97316', to: '#fbbf24' },
  { key: 'sakura', name: '樱花粉', from: '#ec4899', to: '#f0abfc' },
  { key: 'emerald', name: '翡翠绿', from: '#10b981', to: '#2dd4bf' }
]

function SchemeCard() {
  const [accent, setAccent] = useState('')

  useEffect(() => {
    void api()
      .getSettings()
      .then((s) => setAccent(s.accent ?? ''))
      .catch(() => {})
  }, [])

  const pick = async (k: string) => {
    setAccent(k)
    applyAccent(k)
    await api().setSetting('accent', k)
  }

  return (
    <Card title="🎨 页面配色">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-300">
          选择界面点缀色，搭配上方深浅色模式自由组合，重启后保持。
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              title={a.name}
              onClick={() => void pick(a.key)}
              className={cx(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-all',
                accent === a.key
                  ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                  : 'border-ink-700 text-ink-300 hover:border-ink-600'
              )}
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full shadow-inner"
                style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
              />
              {a.name}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

/** 安全锁：启动密码 */
function SecurityCard() {
  const [hasPassword, setHasPassword] = useState(false)
  const [editing, setEditing] = useState(false)
  const [oldCode, setOldCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void api().authStatus().then((s) => setHasPassword(s.hasPassword))
  }, [])

  const reset = () => {
    setOldCode('')
    setNewCode('')
    setConfirmCode('')
    setEditing(false)
  }

  const saveCode = async () => {
    setMsg(null)
    if (newCode.length < 4) {
      setMsg({ ok: false, text: '密码至少 4 位' })
      return
    }
    if (newCode !== confirmCode) {
      setMsg({ ok: false, text: '两次输入的密码不一致' })
      return
    }
    if (hasPassword) {
      const v = await api().authVerify(oldCode)
      if (!v.ok) {
        setMsg({ ok: false, text: '原密码不正确' })
        return
      }
    }
    const r = await api().authSet(newCode)
    if (r.ok) {
      setHasPassword(true)
      reset()
      setMsg({ ok: true, text: '密码已保存，下次启动软件时需要输入' })
    } else {
      setMsg({ ok: false, text: r.error ?? '保存失败' })
    }
  }

  const removeCode = async () => {
    setMsg(null)
    const r = await api().authClear(oldCode)
    if (r.ok) {
      setHasPassword(false)
      reset()
      setMsg({ ok: true, text: '已解除密码锁' })
    } else {
      setMsg({ ok: false, text: r.error ?? '解除失败' })
    }
  }

  return (
    <Card title="🔒 安全锁">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-300">
          开启后，每次启动「分发云」都需要输入密码才能进入工作台，防止他人动你的账号和素材。
          密钥哈希后存在本地，不会上传。
        </p>

        {!hasPassword || editing ? (
          <div className="space-y-3">
            {hasPassword && editing && (
              <Field label="原密码">
                <Input type="password" value={oldCode} onChange={(e) => setOldCode(e.target.value)} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={hasPassword ? '新密码' : '设置密码'} hint="至少 4 位">
                <Input type="password" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
              </Field>
              <Field label="确认密码">
                <Input type="password" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => void saveCode()} disabled={!newCode || !confirmCode}>
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Badge tone="green">已开启</Badge>
            <Button size="sm" onClick={() => setEditing(true)}>
              修改密码
            </Button>
          </div>
        )}

        {hasPassword && !editing && (
          <div className="space-y-2 border-t border-ink-700 pt-3">
            <Field label="解除密码锁" hint="需输入原密码">
              <div className="flex gap-2">
                <Input type="password" value={oldCode} onChange={(e) => setOldCode(e.target.value)} />
                <Button size="sm" variant="danger" onClick={() => void removeCode()} disabled={!oldCode}>
                  解除
                </Button>
              </div>
            </Field>
          </div>
        )}

        {msg && (
          <div className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</div>
        )}
      </div>
    </Card>
  )
}

/** 远程中转（公网版）配置卡片 */
function RelayCard() {
  const [cfg, setCfg] = useState<{ enabled: boolean; baseUrl: string; token: string; intervalSec: number }>({
    enabled: false,
    baseUrl: '',
    token: '',
    intervalSec: 60
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>('')

  useEffect(() => {
    void api().relayGet().then(setCfg)
  }, [])

  const save = async (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    setCfg(await api().relaySave(next))
  }

  const test = async () => {
    setTesting(true)
    setTestResult('')
    const r = await api().relayTest({ baseUrl: cfg.baseUrl, token: cfg.token })
    setTestResult(r.ok ? '✅ 连接成功' : `❌ 连接失败：${r.error ?? '状态 ' + r.status}`)
    setTesting(false)
  }

  return (
    <Card title="🌐 远程中转（公网版）">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-300">
          iPad 在外网（4G / 异地 WiFi）也能把视频传到电脑：视频先传到你的服务器，电脑定时拉取到素材库。
          需要在服务器上部署 <code className="text-brand-300">server/server.js</code>（零依赖，一个 node 命令即可）。
        </p>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-500"
              checked={cfg.enabled}
              onChange={(e) => save({ enabled: e.target.checked })}
            />
            启用远程拉取
          </label>
        </div>

        <Field label="服务器地址" hint="http(s)://你的域名或 IP:端口">
          <Input
            value={cfg.baseUrl}
            placeholder="https://your-server.com:3880"
            onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
            onBlur={() => save({ baseUrl: cfg.baseUrl })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="密钥 Token" hint="与服务器 TOKEN 一致">
            <Input
              value={cfg.token}
              placeholder="鉴权密钥"
              onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))}
              onBlur={() => save({ token: cfg.token })}
            />
          </Field>
          <Field label="拉取间隔（秒）">
            <Input
              type="number"
              value={cfg.intervalSec}
              min={10}
              onChange={(e) => setCfg((c) => ({ ...c, intervalSec: parseInt(e.target.value, 10) || 60 }))}
              onBlur={() => save({ intervalSec: cfg.intervalSec })}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="soft" onClick={test} disabled={testing || !cfg.baseUrl}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
          {testResult && <span className="text-xs">{testResult}</span>}
        </div>

        <p className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-ink-400">
          部署方法见项目 <code className="text-ink-300">server/README.md</code>。
          iPad 端访问 <code className="text-ink-300">{cfg.baseUrl || '服务器地址'}/</code> 上传，
          或直接给 iPad 用同一个中转服务（可自行加个上传页）。
        </p>
      </div>
    </Card>
  )
}
