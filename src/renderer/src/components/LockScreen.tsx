import { useState } from 'react'
import { api } from '../lib/api'
import { ThemeToggle } from './ThemeToggle'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const r = await api().authVerify(code.trim())
      if (r.ok) {
        sessionStorage.setItem('vd-unlocked', '1')
        onUnlock()
      } else {
        setErr('密码不正确，请重试')
        setCode('')
      }
    } catch {
      setErr('校验失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-ink-950">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-aqua-400/15 blur-[120px]" />

      <div className="absolute right-6 top-6">
        <ThemeToggle compact />
      </div>

      <div className="relative w-90 rounded-3xl border border-ink-700 bg-ink-850/80 p-8 shadow-[0_32px_90px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <div className="flex flex-col items-center">
          <div className="bg-brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-[0_8px_24px_-6px_var(--color-glow)]">
            分
          </div>
          <div className="text-gradient mt-4 text-xl font-bold">分发云</div>
          <div className="mt-1 text-xs text-ink-400">输入密码解锁工作台</div>
        </div>

        <div className="mt-7 space-y-3">
          <input
            type="password"
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setErr('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="请输入密码"
            className="h-11 w-full rounded-xl border border-ink-600 bg-ink-900 text-center text-lg tracking-[0.4em] text-ink-100 transition-all placeholder:tracking-normal placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          {err && <div className="text-center text-xs text-red-400">{err}</div>}
          <button
            onClick={() => void submit()}
            disabled={busy || !code.trim()}
            className="bg-brand-gradient h-11 w-full rounded-xl text-sm font-medium text-white shadow-[0_8px_20px_-6px_var(--color-glow)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? '校验中…' : '解锁'}
          </button>
        </div>

        <div className="mt-6 border-t border-ink-700 pt-4 text-center text-[11px] leading-relaxed text-ink-500">
          密码保存在本地数据库。若忘记密码，
          <br />
          可删除数据目录中的 database.db 重置。
        </div>
      </div>
    </div>
  )
}
