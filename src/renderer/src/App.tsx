import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Materials from './pages/Materials'
import Publish from './pages/Publish'
import Tasks from './pages/Tasks'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import { api, cx } from './lib/api'
import { ThemeToggle, initTheme, applyAccent } from './components/ThemeToggle'
import { LockScreen } from './components/LockScreen'

const NAV = [
  { key: 'dashboard', label: '概览', icon: '📊' },
  { key: 'accounts', label: '账号管理', icon: '👤' },
  { key: 'materials', label: '素材库', icon: '🎬' },
  { key: 'publish', label: '发布', icon: '🚀' },
  { key: 'tasks', label: '任务队列', icon: '🗂️' },
  { key: 'history', label: '发布记录', icon: '📈' },
  { key: 'analytics', label: '数据分析', icon: '📊' },
  { key: 'settings', label: '设置', icon: '⚙️' }
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [preset, setPreset] = useState<{ path: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [gate, setGate] = useState<'loading' | 'locked' | 'open'>('loading')

  useEffect(() => {
    initTheme()
    void api().isBusy().then(setBusy)
    const off = api().onRefresh(() => void api().isBusy().then(setBusy))
    void api()
      .getSettings()
      .then((s) => applyAccent(s.accent ?? ''))
      .catch(() => {})
    void api()
      .authStatus()
      .then((s) => {
        setGate(s.hasPassword && sessionStorage.getItem('vd-unlocked') !== '1' ? 'locked' : 'open')
      })
      .catch(() => setGate('open'))
    return off
  }, [])

  const goto = (key: string) => {
    if (key !== 'publish') setPreset(null)
    setPage(key)
  }

  const useMaterial = (m: { path: string; name: string }) => {
    setPreset(m)
    setPage('publish')
  }

  if (gate === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950">
        <div className="bg-brand-gradient flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl text-lg font-bold text-white">
          分
        </div>
      </div>
    )
  }

  if (gate === 'locked') {
    return <LockScreen onUnlock={() => setGate('open')} />
  }

  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-ink-800 bg-ink-950/90 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white shadow-[0_6px_16px_-6px_var(--color-glow)]">
            分
          </div>
          <div>
            <div className="text-gradient text-[15px] font-bold leading-tight">分发云</div>
            <div className="text-[10px] text-ink-400">多平台一键发布</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => goto(n.key)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all',
                page === n.key
                  ? 'bg-brand-500/12 font-medium text-brand-300 shadow-[inset_0_0_0_1px_rgba(20,194,174,0.18)]'
                  : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100'
              )}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
              {n.key === 'tasks' && busy && (
                <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </nav>

        <div className="space-y-3 border-t border-ink-800 px-4 py-4">
          <ThemeToggle />
          <div className="px-1 text-[11px] leading-relaxed text-ink-500">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-emerald-400' : 'bg-ink-600'}`} />
              {busy ? '发布进行中' : '空闲'}
            </div>
            <div className="mt-1">数据全部保存在本地</div>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-800 bg-ink-900/80 px-8 py-4 backdrop-blur-xl">
          <div>
            <h1 className="text-base font-semibold text-ink-100">
              {NAV.find((n) => n.key === page)?.label}
            </h1>
            <p className="mt-0.5 text-[11px] text-ink-400">
              {DESC[page]}
            </p>
          </div>
        </header>

        <div className="p-8">
          {page === 'dashboard' && <Dashboard onNavigate={goto} />}
          {page === 'accounts' && <Accounts />}
          {page === 'materials' && <Materials onUse={useMaterial} />}
          {page === 'publish' && <Publish preset={preset} />}
          {page === 'tasks' && <Tasks />}
          {page === 'history' && <History />}
          {page === 'analytics' && <Analytics />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  )
}

const DESC: Record<string, string> = {
  dashboard: '全局数据概览与发布趋势',
  accounts: '管理各平台账号及其登录态',
  materials: '本地视频素材统一管理',
  publish: '一次配置，多平台多账号批量分发',
  tasks: '实时查看发布进度与结果',
  history: '历史发布记录与数据统计',
  analytics: '作品播放 / 互动 / 涨粉深度分析',
  settings: '运行参数、远程中转与安全锁'
}
