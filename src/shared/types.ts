import type { PlatformId } from './platforms'

/* ---------------- 数据行类型 ---------------- */

export interface AccountRow {
  id: number
  platform: PlatformId
  name: string
  remark: string | null
  group_name: string | null
  profile_dir: string
  is_logged_in: number
  last_check: string | null
  avatar: string | null
  fans: string | null
  /** 该账号专属代理（空则用全局代理设置） */
  proxy: string | null
  created_at: string
  updated_at: string
}

export interface MaterialRow {
  id: number
  name: string
  path: string
  size: number
  duration: number | null
  cover_path: string | null
  remark: string | null
  created_at: string
}

export type TaskStatus = 'draft' | 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'canceled'

export interface TaskTarget {
  platform: PlatformId
  accountId: number
}

export interface TaskRow {
  id: number
  title: string
  description: string | null
  tags: string | null
  video_path: string
  cover_path: string | null
  material_id: number | null
  publish_mode: 'now' | 'scheduled'
  scheduled_at: string | null
  targets: string
  status: TaskStatus
  /** 1 = 尽量交给平台侧定时发布（App 关着也能发） */
  platform_schedule: number
  /** 按平台覆盖文案 JSON：{ [platformId]: { title?, description?, tags? } } */
  overrides: string | null
  created_at: string
  completed_at: string | null
}

/** 每平台的文案覆盖 */
export interface PlatformOverrides {
  [platformId: string]: { title?: string; description?: string; tags?: string[] }
}

export type LogStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled'

export interface PublishLogRow {
  id: number
  task_id: number
  platform: PlatformId
  account_id: number
  status: LogStatus
  message: string | null
  result_url: string | null
  error: string | null
  duration_ms: number | null
  /** 失败现场截图的本地路径 */
  screenshot: string | null
  /** 第几次尝试（自动重试计数） */
  attempt: number
  started_at: string | null
  finished_at: string | null
  task_title?: string
  account_name?: string
}

/* ---------------- 传输类型 ---------------- */

export interface TaskInput {
  title: string
  description: string
  tags: string[]
  videoPath: string
  coverPath?: string
  materialId?: number | null
  publishMode: 'now' | 'scheduled'
  scheduledAt?: string | null
  targets: TaskTarget[]
  /** 尽量使用平台侧定时发布 */
  platformSchedule?: boolean
  /** 按平台覆盖文案 */
  overrides?: PlatformOverrides
  /** 保存为草稿（不立即入队） */
  asDraft?: boolean
}

export interface ProgressPayload {
  taskId: number
  logId?: number
  platform: PlatformId
  accountId: number
  status:
    | 'waiting'
    | 'launching'
    | 'uploading'
    | 'filling'
    | 'publishing'
    | 'waiting-captcha'
    | 'waiting-manual'
    | 'success'
    | 'failed'
  message?: string
  percent?: number
  resultUrl?: string
  error?: string
}

/* ---------------- Worker 协议 ---------------- */

export type WorkerCommand =
  | {
      type: 'publish'
      taskId: number
      logId: number
      platform: PlatformId
      profileDir: string
      options: PublishOptions
      /** 失败现场截图写到这里（绝对路径，空则不截图） */
      errShotPath?: string
      /** 代理服务器（http://host:port / socks5://host:port，空则不用） */
      proxy?: string
    }
  | {
      type: 'login'
      platform: PlatformId
      profileDir: string
      loginUrl: string
    }
  | {
      type: 'checkLogin'
      platform: PlatformId
      profileDir: string
    }
  | { type: 'cancel' }

export type WorkerEvent =
  | {
      type: 'progress'
      taskId: number
      logId: number
      platform: PlatformId
      accountId: number
      status: string
      message?: string
      percent?: number
    }
  | {
      type: 'result'
      taskId: number
      logId: number
      platform: PlatformId
      accountId: number
      success: boolean
      url?: string
      error?: string
      duration?: number
      screenshot?: string
    }
  | {
      type: 'loginStatus'
      platform: PlatformId
      profileDir: string
      loggedIn: boolean
      nickname?: string
      avatar?: string
      fans?: string
    }
  | {
      type: 'loginClosed'
      platform: PlatformId
      profileDir: string
    }

export interface PublishOptions {
  title: string
  description: string
  tags: string[]
  videoPath: string
  coverPath?: string
  /** ISO 时间字符串，为空表示立即发布 */
  scheduledAt?: string | null
}

export interface Stats {
  accountTotal: number
  accountOnline: number
  materialTotal: number
  taskPending: number
  logToday: number
  logSuccess: number
  logFailed: number
  byPlatform: { platform: string; total: number; success: number; failed: number }[]
  last7Days: { date: string; count: number }[]
}

/* ============ 作品数据分析 ============ */

/** 单条发布作品的数据快照（可多次录入，形成时间序列） */
export interface WorkMetricRow {
  id: number
  log_id: number
  plays: number
  likes: number
  comments: number
  shares: number
  favorites: number
  fans_delta: number
  recorded_at: string
}

export interface WorkMetricInput {
  logId: number
  plays: number
  likes: number
  comments: number
  shares: number
  favorites: number
  fansDelta: number
}

/** 作品维度的最新指标（join 发布记录） */
export interface WorkStatRow {
  log_id: number
  platform: PlatformId
  account_id: number
  account_name: string | null
  title: string | null
  result_url: string | null
  published_at: string | null
  plays: number
  likes: number
  comments: number
  shares: number
  favorites: number
  fans_delta: number
  snapshot_count: number
  last_recorded_at: string | null
}

/** 账号维度的汇总分析 */
export interface AccountAnalytics {
  account_id: number
  account_name: string
  platform: PlatformId
  total_plays: number
  total_likes: number
  total_comments: number
  total_fans: number
  works: number
  avg_like_rate: number
}

export interface AnalyticsSummary {
  totalWorks: number
  totalPlays: number
  totalLikes: number
  totalComments: number
  totalFans: number
  avgEngagementRate: number
  topWorks: WorkStatRow[]
  byPlatform: { platform: PlatformId; plays: number; likes: number; works: number }[]
  byAccount: AccountAnalytics[]
  playsByHour: { hour: number; count: number }[]
  worksByDay: { date: string; count: number }[]
}
