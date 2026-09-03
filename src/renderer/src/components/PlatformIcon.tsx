import { PLATFORM_MAP } from '../../../shared/platforms'
import { PlatformLogo } from './platform-logos'

export function PlatformAvatar({
  platform,
  size = 36,
  radius = 10
}: {
  platform: string
  size?: number
  radius?: number
}) {
  const meta = PLATFORM_MAP[platform]
  const color = meta?.color ?? '#0ea5a0'
  const logo = PlatformLogo({ platform, size: Math.round(size * 0.72) })
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        background: logo ? '#fff' : color,
        borderRadius: radius,
        boxShadow: logo ? 'inset 0 0 0 1px rgba(0,0,0,0.06)' : undefined
      }}
    >
      {logo ?? (
        <span className="font-semibold text-white" style={{ fontSize: size * 0.42 }}>
          {meta?.short ?? '?'}
        </span>
      )}
    </div>
  )
}

export function PlatformTag({ platform }: { platform: string }) {
  const meta = PLATFORM_MAP[platform]
  const color = meta?.color ?? '#0ea5a0'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      <span className="flex items-center">
        <PlatformLogo platform={platform} size={12} />
      </span>
      {meta?.name ?? platform}
    </span>
  )
}
