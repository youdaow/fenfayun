import type { PlatformAdapter } from './types'
import { douyin } from './douyin'
import { kuaishou } from './kuaishou'
import { bilibili } from './bilibili'
import { xiaohongshu } from './xiaohongshu'
import { shipinhao } from './shipinhao'
import { youtube } from './youtube'
import { tiktok } from './tiktok'
import { createGenericAdapter, createAssistAdapter } from './generic'
import { PLATFORM_MAP, PLATFORMS, type PlatformId } from '../../shared/platforms'

/** 有专用适配器的平台（level=full） */
const dedicated: Partial<Record<PlatformId, PlatformAdapter>> = {
  douyin,
  kuaishou,
  bilibili,
  xiaohongshu,
  shipinhao,
  youtube,
  tiktok
}

export const adapters: Record<string, PlatformAdapter> = {}

for (const meta of PLATFORMS) {
  const d = dedicated[meta.id]
  if (d) {
    adapters[meta.id] = d
  } else if (meta.level === 'assist') {
    adapters[meta.id] = createAssistAdapter(meta)
  } else {
    adapters[meta.id] = createGenericAdapter(meta)
  }
}

export function getAdapter(platform: string): PlatformAdapter | undefined {
  if (adapters[platform]) return adapters[platform]
  // 兜底：元信息里没有但被传进来的平台，用通用适配器
  const meta = PLATFORM_MAP[platform]
  if (meta) {
    adapters[platform] = meta.level === 'assist' ? createAssistAdapter(meta) : createGenericAdapter(meta)
    return adapters[platform]
  }
  return undefined
}

export type { PlatformAdapter }
