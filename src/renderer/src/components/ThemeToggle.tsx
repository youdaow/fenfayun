import { useEffect, useState } from 'react'
import { cx } from '../lib/api'

type Mode = 'dark' | 'light' | 'system'
const KEY = 'vd-theme'

export function resolveTheme(mode: Mode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(mode: Mode): void {
  document.documentElement.dataset.theme = resolveTheme(mode)
}

export function initTheme(): void {
  const saved = (localStorage.getItem(KEY) as Mode | null) ?? 'dark'
  applyTheme(saved)
}

/** 应用配色方案（'' = 默认蓝绿），配合 index.css 的 data-accent 变量组 */
export function applyAccent(accent: string): void {
  if (accent) {
    document.documentElement.dataset.accent = accent
  } else {
    delete document.documentElement.dataset.accent
  }
}

const OPTIONS: { key: Mode; icon: string; label: string }[] = [
  { key: 'dark', icon: '🌙', label: '深色' },
  { key: 'light', icon: '☀️', label: '浅色' },
  { key: 'system', icon: '🖥️', label: '跟随系统' }
]

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(KEY) as Mode | null) ?? 'dark')

  useEffect(() => {
    applyTheme(mode)
    localStorage.setItem(KEY, mode)
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      const onChange = () => applyTheme('system')
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
  }, [mode])

  if (compact) {
    const next = mode === 'dark' ? 'light' : 'dark'
    return (
      <button
        onClick={() => setMode(next)}
        title={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-ink-700 text-sm transition-colors hover:bg-ink-800"
      >
        {mode === 'dark' ? '🌙' : '☀️'}
      </button>
    )
  }

  return (
    <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => setMode(o.key)}
          title={o.label}
          className={cx(
            'flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] transition-all',
            mode === o.key
              ? 'bg-brand-500/15 text-brand-300'
              : 'text-ink-400 hover:text-ink-200'
          )}
        >
          <span>{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  )
}
