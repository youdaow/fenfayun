/**
 * 平台注册表。
 *
 * 设计原则：覆盖广度优先。视频分发的核心价值之一就是"占位"——
 * 同一个内容铺到越多平台，被搬运号抢先发布的概率越低。
 *
 * level 说明：
 *  - full    : 有专用适配器，选择器针对该平台调过
 *  - generic : 走通用适配器（配置驱动的选择器），多数能跑通全流程
 *  - assist  : 通用适配器兜底，自动填表后停下等人工点发布（页面过于复杂时用）
 */
export type PlatformId =
  // 国内
  | 'douyin'
  | 'kuaishou'
  | 'bilibili'
  | 'xiaohongshu'
  | 'shipinhao'
  | 'xigua'
  | 'toutiao'
  | 'baijiahao'
  | 'qiehao'
  | 'dayu'
  | 'iqiyi'
  | 'youku'
  | 'sohu'
  | 'wangyi'
  | 'weibo'
  | 'zhihu'
  | 'haokan'
  | 'acfun'
  | 'weishi'
  // 海外
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'vimeo'
  | 'dailymotion'
  | 'rumble'
  | 'linkedin'
  | 'pinterest'

export type PlatformRegion = 'cn' | 'intl'
export type AdapterLevel = 'full' | 'generic' | 'assist'

export interface PlatformMeta {
  id: PlatformId
  name: string
  short: string
  color: string
  region: PlatformRegion
  /** 分组标签，界面按此归类 */
  group: string
  loginUrl: string
  uploadUrl: string
  /** 创作者数据中心页，用于采集播放/点赞等数据 */
  statsUrl?: string
  titleMax: number
  descMax: number
  tagMax: number
  supportSchedule: boolean
  supportCover: boolean
  level: AdapterLevel
}

export const PLATFORMS: PlatformMeta[] = [
  /* ============ 国内 · 短视频 ============ */
  {
    id: 'douyin',
    name: '抖音',
    short: '抖',
    color: '#111111',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://creator.douyin.com/',
    uploadUrl: 'https://creator.douyin.com/creator-micro/content/upload',
    statsUrl: 'https://creator.douyin.com/creator-micro/data-center',
    titleMax: 30,
    descMax: 1000,
    tagMax: 5,
    supportSchedule: true,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'kuaishou',
    name: '快手',
    short: '快',
    color: '#FF4906',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://cp.kuaishou.com/',
    uploadUrl: 'https://cp.kuaishou.com/article/publish/video',
    statsUrl: 'https://cp.kuaishou.com/article/data/video',
    titleMax: 100,
    descMax: 1000,
    tagMax: 10,
    supportSchedule: true,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'shipinhao',
    name: '视频号',
    short: '号',
    color: '#07C160',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://channels.weixin.qq.com/platform/live/create',
    uploadUrl: 'https://channels.weixin.qq.com/platform/post/create',
    statsUrl: 'https://channels.weixin.qq.com/platform/creator/data',
    titleMax: 30,
    descMax: 1000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    short: '红',
    color: '#FF2442',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://creator.xiaohongshu.com/',
    uploadUrl: 'https://creator.xiaohongshu.com/publish/publish?target=video',
    statsUrl: 'https://creator.xiaohongshu.com/statistics',
    titleMax: 20,
    descMax: 1000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'weishi',
    name: '微视',
    short: '视',
    color: '#00C8FF',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://weishi.qq.com/',
    uploadUrl: 'https://weishi.qq.com/creator',
    statsUrl: 'https://weishi.qq.com/creator/data',
    titleMax: 50,
    descMax: 1000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'haokan',
    name: '好看视频',
    short: '好',
    color: '#2E6BE6',
    region: 'cn',
    group: '国内短视频',
    loginUrl: 'https://haokan.baidu.com/author',
    uploadUrl: 'https://haokan.baidu.com/author?_f=video-create',
    statsUrl: 'https://haokan.baidu.com/author?_f=data',
    titleMax: 50,
    descMax: 1000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },

  /* ============ 国内 · 中长视频 / 资讯 ============ */
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    short: 'B',
    color: '#FB7299',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://passport.bilibili.com/login',
    uploadUrl: 'https://member.bilibili.com/platform/upload/video/frame',
    statsUrl: 'https://member.bilibili.com/platform/data-center',
    titleMax: 80,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: true,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'xigua',
    name: '西瓜视频',
    short: '西',
    color: '#F85959',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://studio.ixigua.com/',
    uploadUrl: 'https://studio.ixigua.com/video/upload',
    statsUrl: 'https://studio.ixigua.com/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: true,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'toutiao',
    name: '今日头条',
    short: '头',
    color: '#F04142',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.toutiao.com/',
    uploadUrl: 'https://mp.toutiao.com/profile_v4/weitoutiao/publish',
    statsUrl: 'https://mp.toutiao.com/profile_v4/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: true,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'baijiahao',
    name: '百家号',
    short: '百',
    color: '#2932E1',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://baijiahao.baidu.com/',
    uploadUrl: 'https://baijiahao.baidu.com/builder/rc/edit?type=video',
    statsUrl: 'https://baijiahao.baidu.com/builder/data/overview',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'qiehao',
    name: '企鹅号',
    short: '企',
    color: '#12B7F5',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://om.qq.com/',
    uploadUrl: 'https://om.qq.com/article/articlePublish/video',
    statsUrl: 'https://om.qq.com/data/overview',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'dayu',
    name: '大鱼号',
    short: '鱼',
    color: '#FF6A00',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.dayu.com/',
    uploadUrl: 'https://mp.dayu.com/dashboard/video/create',
    statsUrl: 'https://mp.dayu.com/dashboard/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'iqiyi',
    name: '爱奇艺号',
    short: '爱',
    color: '#00BE06',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.iqiyi.com/',
    uploadUrl: 'https://mp.iqiyi.com/w/main/video-upload',
    statsUrl: 'https://mp.iqiyi.com/w/main/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'youku',
    name: '优酷号',
    short: '优',
    color: '#0B9BFF',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.youku.com/',
    uploadUrl: 'https://mp.youku.com/v2/video/create',
    statsUrl: 'https://mp.youku.com/v2/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'sohu',
    name: '搜狐号',
    short: '搜',
    color: '#FF8200',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.sohu.com/',
    uploadUrl: 'https://mp.sohu.com/profile/videos/create',
    statsUrl: 'https://mp.sohu.com/profile/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'wangyi',
    name: '网易号',
    short: '易',
    color: '#DF3031',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://mp.163.com/',
    uploadUrl: 'https://mp.163.com/#/video/create',
    statsUrl: 'https://mp.163.com/#/data',
    titleMax: 60,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'acfun',
    name: 'AcFun',
    short: 'A',
    color: '#FD4C5B',
    region: 'cn',
    group: '国内中长视频',
    loginUrl: 'https://www.acfun.cn/',
    uploadUrl: 'https://www.acfun.cn/member/uploadVideo.aspx',
    statsUrl: 'https://www.acfun.cn/member/videoData.aspx',
    titleMax: 80,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },

  /* ============ 国内 · 社区 ============ */
  {
    id: 'weibo',
    name: '微博视频',
    short: '博',
    color: '#E6162D',
    region: 'cn',
    group: '国内社区',
    loginUrl: 'https://weibo.com/',
    uploadUrl: 'https://video.weibo.com/upload',
    statsUrl: 'https://data.weibo.com/',
    titleMax: 40,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'zhihu',
    name: '知乎视频',
    short: '知',
    color: '#0084FF',
    region: 'cn',
    group: '国内社区',
    loginUrl: 'https://www.zhihu.com/',
    uploadUrl: 'https://www.zhihu.com/creator/video/upload',
    statsUrl: 'https://www.zhihu.com/creator/data',
    titleMax: 50,
    descMax: 2000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },

  /* ============ 海外 ============ */
  {
    id: 'youtube',
    name: 'YouTube',
    short: 'Y',
    color: '#FF0000',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://studio.youtube.com/',
    uploadUrl: 'https://studio.youtube.com/videos/upload',
    statsUrl: 'https://studio.youtube.com/analytics',
    titleMax: 100,
    descMax: 5000,
    tagMax: 15,
    supportSchedule: true,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    short: 'T',
    color: '#00F2EA',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://www.tiktok.com/creator-center',
    uploadUrl: 'https://www.tiktok.com/creator-center/upload',
    statsUrl: 'https://www.tiktok.com/creator-center/analytics',
    titleMax: 150,
    descMax: 2200,
    tagMax: 10,
    supportSchedule: true,
    supportCover: true,
    level: 'full'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    short: 'I',
    color: '#E1306C',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://business.facebook.com/creatorstudio/home',
    uploadUrl: 'https://business.facebook.com/creatorstudio/home',
    statsUrl: 'https://business.facebook.com/creatorstudio/insights',
    titleMax: 100,
    descMax: 2200,
    tagMax: 30,
    supportSchedule: false,
    supportCover: true,
    level: 'assist'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    short: 'F',
    color: '#1877F2',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://business.facebook.com/creatorstudio/home',
    uploadUrl: 'https://business.facebook.com/creatorstudio/home',
    statsUrl: 'https://business.facebook.com/creatorstudio/insights',
    titleMax: 100,
    descMax: 5000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'assist'
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    short: 'X',
    color: '#000000',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://studio.twitter.com/',
    uploadUrl: 'https://studio.twitter.com/library',
    statsUrl: 'https://studio.twitter.com/analytics',
    titleMax: 100,
    descMax: 280,
    tagMax: 5,
    supportSchedule: false,
    supportCover: true,
    level: 'assist'
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    short: 'V',
    color: '#1AB7EA',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://vimeo.com/log_in',
    uploadUrl: 'https://vimeo.com/upload',
    statsUrl: 'https://vimeo.com/manage/videos',
    titleMax: 100,
    descMax: 5000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    short: 'D',
    color: '#0066DC',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://dashboard.dailymotion.com/',
    uploadUrl: 'https://dashboard.dailymotion.com/upload',
    statsUrl: 'https://dashboard.dailymotion.com/analytics',
    titleMax: 120,
    descMax: 3000,
    tagMax: 15,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'rumble',
    name: 'Rumble',
    short: 'R',
    color: '#85C742',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://rumble.com/login',
    uploadUrl: 'https://rumble.com/upload.php',
    statsUrl: 'https://rumble.com/account/content',
    titleMax: 100,
    descMax: 5000,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'generic'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    short: 'in',
    color: '#0A66C2',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://www.linkedin.com/feed/',
    uploadUrl: 'https://www.linkedin.com/feed/',
    statsUrl: 'https://www.linkedin.com/analytics/creator/content',
    titleMax: 100,
    descMax: 3000,
    tagMax: 5,
    supportSchedule: false,
    supportCover: true,
    level: 'assist'
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    short: 'P',
    color: '#E60023',
    region: 'intl',
    group: '海外平台',
    loginUrl: 'https://www.pinterest.com/',
    uploadUrl: 'https://www.pinterest.com/pin-builder/',
    statsUrl: 'https://analytics.pinterest.com/',
    titleMax: 100,
    descMax: 800,
    tagMax: 10,
    supportSchedule: false,
    supportCover: true,
    level: 'assist'
  }
]

export const PLATFORM_MAP: Record<string, PlatformMeta> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p])
)

export const GROUPS = ['国内短视频', '国内中长视频', '国内社区', '海外平台']

export function platformName(id: string): string {
  return PLATFORM_MAP[id]?.name ?? id
}

export function platformsOfRegion(region: PlatformRegion | 'all'): PlatformMeta[] {
  return region === 'all' ? PLATFORMS : PLATFORMS.filter((p) => p.region === region)
}
