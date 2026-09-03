import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cx } from '../lib/api'

/* ---------- Button ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'soft', size = 'md', className, ...rest }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-[0.98]'
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9.5 px-4 text-sm' }
  const variants = {
    primary:
      'bg-brand-gradient text-white shadow-[0_4px_14px_-4px_var(--color-glow)] hover:brightness-110',
    soft: 'bg-ink-800 hover:bg-ink-700 text-ink-100 border border-ink-700',
    ghost: 'hover:bg-ink-800 text-ink-300 hover:text-ink-100',
    danger: 'bg-red-600/90 hover:bg-red-600 text-white shadow-[0_4px_14px_-6px_rgba(220,38,38,0.6)]'
  }
  return <button className={cx(base, sizes[size], variants[variant], className)} {...rest} />
}

/* ---------- Card ---------- */
export function Card({
  title,
  extra,
  children,
  className
}: {
  title?: ReactNode
  extra?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className="card-hairline rounded-2xl border border-ink-700 bg-ink-850/80 backdrop-blur-sm">
      {(title || extra) && (
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
          <div className="text-sm font-semibold text-ink-100">{title}</div>
          {extra}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ---------- Input ---------- */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-9.5 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-sm text-ink-100',
        'transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25',
        className
      )}
      {...rest}
    />
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100',
        'transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25',
        'resize-none leading-relaxed',
        className
      )}
      {...rest}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-medium text-ink-300">
        {label}
        {hint && <span className="text-[11px] font-normal text-ink-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/* ---------- Badge ---------- */
const tones: Record<string, string> = {
  default: 'bg-ink-700 text-ink-300',
  blue: 'bg-brand-500/12 text-brand-300 border border-brand-500/30',
  green: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  red: 'bg-red-500/15 text-red-300 border border-red-500/25',
  amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
}

export function Badge({
  children,
  tone = 'default',
  className
}: {
  children: ReactNode
  tone?: keyof typeof tones
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        tones[tone] ?? tones.default,
        className
      )}
    >
      {children}
    </span>
  )
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg'
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div
        className={cx(
          'w-full rounded-2xl border border-ink-600 bg-ink-850 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]',
          width
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
          <div className="text-sm font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  )
}

/* ---------- Empty ---------- */
export function Empty({ text, icon = '📭' }: { text: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-ink-400">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 text-2xl">
        {icon}
      </div>
      <div>{text}</div>
    </div>
  )
}

/* ---------- Progress ---------- */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        className="bg-brand-gradient h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
