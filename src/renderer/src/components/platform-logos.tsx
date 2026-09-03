import type { JSX } from 'react'

/**
 * 平台品牌图标库（内联 SVG，viewBox 0 0 24 24）。
 * 每个图标都是简化的品牌识别图形，避免依赖外部图片资源。
 * 未收录的平台回退到首字母色块。
 */

type IconProps = { size?: number; className?: string }

function svg(paths: JSX.Element, size = 24) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {paths}
    </svg>
  )
}

/* ---------- 国内短视频 ---------- */

const Douyin = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M9.5 3h4v1.5c0 3 2.5 5.3 5.5 5.5V14c-1.9 0-3.6-.5-5.5-1.6v6.1c0 3-2.4 5.5-5.5 5.5S2.5 21.5 2.5 18.5 4.9 13 8 13v3c-1.2 0-2.5 1.2-2.5 2.5S6.8 21 8 21s2.5-1.1 2.5-2.5V3H9.5z" fill="#000"/>
    </>,
    size
  )

const Kuaishou = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="5" width="8" height="14" rx="2" fill="#FF4906"/>
      <rect x="13" y="5" width="8" height="14" rx="2" fill="#FF4906" opacity="0.6"/>
    </>,
    size
  )

const Shipinhao = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="#07C160"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
    </>,
    size
  )

const Xiaohongshu = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z" fill="#FF2442"/>
      <path d="M7 12c1.5-1.5 3-2 4.5-1.5s2.5 2 3 4c.5-1.5 0-3-1-4.5s-2.5-2-4.5-1.5S7 10.5 7 12z" fill="#fff"/>
    </>,
    size
  )

const Weishi = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" fill="#00C8FF"/>
      <path d="M10.5 9l4 2.5-4 2.5V9z" fill="#fff"/>
    </>,
    size
  )

const Haokan = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="4" fill="#2E6BE6"/>
      <path d="M9 8.5v7l6-3.5-6-3.5z" fill="#fff"/>
    </>,
    size
  )

/* ---------- 国内中长视频 ---------- */

const Bilibili = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="4" fill="#FB7299"/>
      <path d="M8 9h1.5v2H8zM14.5 9H16v2h-1.5z" fill="#fff"/>
      <path d="M9.5 13c1 1 2.5 1 3.5 0" stroke="#fff" strokeWidth="1.2" fill="none"/>
    </>,
    size
  )

const Xigua = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="#F85959"/>
      <path d="M8 9c2-2 6-2 8 0s2 6 0 8-6 2-8 0z" fill="#fff" opacity="0.9"/>
    </>,
    size
  )

const Toutiao = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#F04142"/>
      <path d="M7 10h10M7 13h7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

const Baijiahao = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="#2932E1"/>
      <path d="M8 8h5a3 3 0 010 6H8zM8 12h5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </>,
    size
  )

const Qiehao = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#12B7F5"/>
      <path d="M7 9h10M7 12h10M7 15h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

const Dayu = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="#FF6A00"/>
      <path d="M8 12c0-2 1.8-3 4-3s4 1 4 3-1.8 3-4 3-4-1-4-3z" fill="#fff"/>
    </>,
    size
  )

const Iqiyi = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#00BE06"/>
      <path d="M9 8.5v7l6-3.5-6-3.5z" fill="#fff"/>
    </>,
    size
  )

const Youku = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#0B9BFF"/>
      <path d="M9 8.5v7l6-3.5-6-3.5z" fill="#fff"/>
    </>,
    size
  )

const Sohu = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#FF8200"/>
      <path d="M8 9h8M8 12h8M8 15h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

const Wangyi = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#DF3031"/>
      <path d="M8 9h8M8 12h8M8 15h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

const Acfun = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#FD4C5B"/>
      <path d="M8 9l4 3 4-3v6l-4-3-4 3z" fill="#fff"/>
    </>,
    size
  )

/* ---------- 国内社区 ---------- */

const Weibo = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" fill="#E6162D"/>
      <path d="M8 12c1 1 2 1 3 1M11 14.5c1.5 1.5 3 1 4.5 0" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      <circle cx="13.5" cy="11.5" r="1.5" fill="#fff"/>
    </>,
    size
  )

const Zhihu = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#0084FF"/>
      <path d="M8 9h8M8 12h8M8 15h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

/* ---------- 海外 ---------- */

const Youtube = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="4" fill="#FF0000"/>
      <path d="M10 9l5 3-5 3V9z" fill="#fff"/>
    </>,
    size
  )

const Tiktok = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M14 4c.4 2 1.6 3.4 3.5 3.8v2.6c-1.3 0-2.4-.4-3.5-1v6.1c0 3.2-2.6 5.5-5.7 5.5S2.6 18.7 2.6 15.5 5.2 10 8.3 10c.2 0 .4 0 .7.1v2.8c-.2-.1-.4-.1-.7-.1-1.6 0-2.8 1.2-2.8 2.7s1.2 2.7 2.8 2.7 2.8-1.2 2.8-2.7V4H14z" fill="#000"/>
    </>,
    size
  )

const Instagram = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#ig)" />
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#E1306C"/>
      <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.6" fill="none"/>
      <circle cx="16.5" cy="7.5" r="1.2" fill="#fff"/>
    </>,
    size
  )

const Facebook = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M20 12a8 8 0 10-9.3 7.9v-5.6H9.3V12h1.4v-1.8c0-1.4.8-2.2 2.1-2.2.6 0 1.2.1 1.2.1v1.4h-.7c-.7 0-.9.4-.9.9v1.1h1.5l-.2 1.6h-1.3v5.6A8 8 0 0020 12z" fill="#1877F2"/>
    </>,
    size
  )

const Twitter = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M4 4l7 9.3L4.4 20h2.2l5.4-5.3L16.4 20H20l-7.2-9.6L19.3 4h-2.2l-4.9 4.8L8 4H4z" fill="#000"/>
    </>,
    size
  )

const Vimeo = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#1AB7EA"/>
      <path d="M8 15l3-6 3 3-2.5 3.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </>,
    size
  )

const Dailymotion = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#0066DC"/>
      <path d="M9 8.5v7l6-3.5-6-3.5z" fill="#fff"/>
    </>,
    size
  )

const Rumble = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#85C742"/>
      <path d="M8 9h8M8 12h8M8 15h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
    </>,
    size
  )

const Linkedin = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#0A66C2"/>
      <path d="M7.5 10v6M7.5 7.5v.5M11 16v-3.5c0-1.4.9-2.5 2.2-2.5s2.3 1.1 2.3 2.5V16" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </>,
    size
  )

const Pinterest = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="#E60023"/>
      <path d="M12 7c-2 0-3.5 1.4-3.5 3.3 0 1.2.6 2.2 1.5 2.6l.3-1.2c-.2-.5-.4-1.4-.4-2 0-1.6 1.2-2.7 2.7-2.7 1.5 0 2.5 1 2.5 2.3 0 1.7-1 3.1-2.3 3.1-.6 0-1.1-.5-1-1.1l.4-1.7c.1-.5-.2-1-.7-1-.8 0-1.4.8-1.4 1.9 0 1.2.7 2 1.5 2.6l-.8 2.9c-.2.8-.1 1.7.1 2.5.4-.1.6-.3.9-.6.3-.4.6-.9.9-1.5.6.2 1.3.3 1.9.3 3.2 0 5.5-2.5 5.5-5.9S15 7 12 7z" fill="#fff"/>
    </>,
    size
  )

/* ---------- 图标表 ---------- */

export const PLATFORM_ICONS: Record<string, (p: IconProps) => JSX.Element> = {
  douyin: Douyin,
  kuaishou: Kuaishou,
  shipinhao: Shipinhao,
  xiaohongshu: Xiaohongshu,
  weishi: Weishi,
  haokan: Haokan,
  bilibili: Bilibili,
  xigua: Xigua,
  toutiao: Toutiao,
  baijiahao: Baijiahao,
  qiehao: Qiehao,
  dayu: Dayu,
  iqiyi: Iqiyi,
  youku: Youku,
  sohu: Sohu,
  wangyi: Wangyi,
  acfun: Acfun,
  weibo: Weibo,
  zhihu: Zhihu,
  youtube: Youtube,
  tiktok: Tiktok,
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
  vimeo: Vimeo,
  dailymotion: Dailymotion,
  rumble: Rumble,
  linkedin: Linkedin,
  pinterest: Pinterest
}

export function PlatformLogo({ platform, size = 24 }: { platform: string; size?: number }) {
  const C = PLATFORM_ICONS[platform]
  if (C) return <C size={size} />
  return null
}
