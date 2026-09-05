import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AccountRow,
  AnalyticsSummary,
  MaterialRow,
  ProgressPayload,
  PublishLogRow,
  TaskInput,
  TaskRow,
  WorkMetricInput,
  WorkMetricRow,
  WorkStatRow
} from '../shared/types'

const api = {
  /* 账号 */
  getAccounts: () => ipcRenderer.invoke('account:list') as Promise<AccountRow[]>,
  addAccount: (platform: string, name: string, remark?: string, group?: string, proxy?: string) =>
    ipcRenderer.invoke('account:add', platform, name, remark, group, proxy) as Promise<AccountRow>,
  updateAccount: (id: number, patch: Partial<AccountRow>) =>
    ipcRenderer.invoke('account:update', id, patch) as Promise<AccountRow>,
  removeAccount: (id: number) => ipcRenderer.invoke('account:remove', id) as Promise<boolean>,
  loginAccount: (id: number) => ipcRenderer.invoke('account:login', id) as Promise<{ ok: boolean }>,
  checkAccount: (id: number) => ipcRenderer.invoke('account:checkLogin', id) as Promise<boolean>,
  checkAllAccounts: () => ipcRenderer.invoke('account:checkAll') as Promise<AccountRow[]>,
  setFans: (id: number, fans: string) => ipcRenderer.invoke('account:setFans', id, fans) as Promise<boolean>,

  /* 素材 */
  getMaterials: (keyword?: string) =>
    ipcRenderer.invoke('material:list', keyword ?? '') as Promise<MaterialRow[]>,
  pickMaterial: (copyToApp?: boolean) =>
    ipcRenderer.invoke('material:pick', copyToApp ?? false) as Promise<MaterialRow[]>,
  addMaterialPaths: (paths: string[], copyToApp?: boolean) =>
    ipcRenderer.invoke('material:addPaths', paths, copyToApp ?? false) as Promise<MaterialRow[]>,
  removeMaterials: (ids: number[]) =>
    ipcRenderer.invoke('material:removeMany', ids) as Promise<boolean>,
  updateMaterial: (id: number, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('material:update', id, patch) as Promise<boolean>,
  removeMaterial: (id: number) => ipcRenderer.invoke('material:remove', id) as Promise<boolean>,
  materialMediaUrl: (path: string) => ipcRenderer.invoke('material:mediaUrl', path) as Promise<string | null>,

  /* 任务 */
  getTasks: (q?: Record<string, unknown>) =>
    ipcRenderer.invoke('task:list', q ?? {}) as Promise<TaskRow[]>,
  createTask: (input: TaskInput) => ipcRenderer.invoke('task:create', input) as Promise<TaskRow>,
  updateTask: (id: number, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('task:update', id, patch) as Promise<TaskRow>,
  startDraft: (id: number) => ipcRenderer.invoke('task:startDraft', id) as Promise<boolean>,
  runTaskNow: (id: number) => ipcRenderer.invoke('task:runNow', id) as Promise<boolean>,
  removeTask: (id: number) => ipcRenderer.invoke('task:remove', id) as Promise<boolean>,
  cancelTask: (id: number) => ipcRenderer.invoke('task:cancelOne', id) as Promise<boolean>,
  cancelTasks: () => ipcRenderer.invoke('task:cancel') as Promise<boolean>,
  isBusy: () => ipcRenderer.invoke('task:busy') as Promise<boolean>,

  /* 记录 / 统计 */
  getLogs: (q?: Record<string, unknown>) =>
    ipcRenderer.invoke('log:list', q ?? {}) as Promise<PublishLogRow[]>,
  retryLog: (id: number) => ipcRenderer.invoke('log:retry', id) as Promise<boolean>,
  exportLogs: (q?: Record<string, unknown>) =>
    ipcRenderer.invoke('log:export', q ?? {}) as Promise<string | null>,
  getStats: () => ipcRenderer.invoke('stats:get') as Promise<import('../shared/types').Stats>,

  /* 文件 */
  selectVideo: () => ipcRenderer.invoke('file:selectVideo') as Promise<string | null>,
  selectImage: () => ipcRenderer.invoke('file:selectImage') as Promise<string | null>,
  selectExe: () => ipcRenderer.invoke('file:selectExe') as Promise<string | null>,
  openFile: (p: string) => ipcRenderer.invoke('file:openFile', p) as Promise<boolean>,
  statFile: (p: string) =>
    ipcRenderer.invoke('file:stat', p) as Promise<{
      path: string
      name: string
      size: number
      duration: number | null
    } | null>,
  fileExists: (p: string) => ipcRenderer.invoke('file:exists', p) as Promise<boolean>,
  openInFolder: (p: string) => ipcRenderer.invoke('file:openInFolder', p) as Promise<boolean>,
  openExternal: (url: string) => ipcRenderer.invoke('file:openExternal', url) as Promise<boolean>,

  /* 设置 */
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, string>>,
  setSetting: (k: string, v: string) => ipcRenderer.invoke('settings:set', k, v) as Promise<boolean>,
  getAppInfo: () =>
    ipcRenderer.invoke('app:info') as Promise<{
      version: string
      dataRoot: string
      profilesRoot: string
      dbPath: string
      portable: boolean
      compatMode: boolean
      arch: string
      electron: string
      chrome: string
    }>,
  openDataDir: () => ipcRenderer.invoke('app:openDataDir') as Promise<boolean>,
  setLaunchAtLogin: (enabled: boolean) =>
    ipcRenderer.invoke('app:setLaunchAtLogin', enabled) as Promise<boolean>,
  getLaunchAtLogin: () => ipcRenderer.invoke('app:getLaunchAtLogin') as Promise<boolean>,
  backupDb: () => ipcRenderer.invoke('app:backupDb') as Promise<string | null>,
  restoreDb: () => ipcRenderer.invoke('app:restoreDb') as Promise<string | null>,

  /* 数据分析 */
  recordMetric: (input: WorkMetricInput) =>
    ipcRenderer.invoke('analytics:record', input) as Promise<boolean>,
  getSnapshots: (logId: number) =>
    ipcRenderer.invoke('analytics:snapshots', logId) as Promise<WorkMetricRow[]>,
  getWorks: () => ipcRenderer.invoke('analytics:works') as Promise<WorkStatRow[]>,
  getAnalytics: () => ipcRenderer.invoke('analytics:summary') as Promise<AnalyticsSummary>,

  /* iPad 局域网收件箱 */
  inboxStart: () => ipcRenderer.invoke('inbox:start') as Promise<{
    running: boolean
    port: number
    url: string
    ip: string
  }>,
  inboxStop: () => ipcRenderer.invoke('inbox:stop') as Promise<boolean>,
  inboxStatus: () => ipcRenderer.invoke('inbox:status') as Promise<{
    running: boolean
    port: number
    url: string
    ip: string
  }>,

  /* 远程中转 */
  relayGet: () => ipcRenderer.invoke('relay:get') as Promise<{
    enabled: boolean
    baseUrl: string
    token: string
    intervalSec: number
  }>,
  relaySave: (cfg: Record<string, unknown>) =>
    ipcRenderer.invoke('relay:save', cfg) as Promise<{
      enabled: boolean
      baseUrl: string
      token: string
      intervalSec: number
    }>,
  relayTest: (cfg: Record<string, unknown>) =>
    ipcRenderer.invoke('relay:test', cfg) as Promise<{ ok: boolean; status?: number; error?: string }>,

  /* 登录校验 */
  authStatus: () => ipcRenderer.invoke('auth:status') as Promise<{ hasPassword: boolean }>,
  authSet: (passcode: string) =>
    ipcRenderer.invoke('auth:set', passcode) as Promise<{ ok: boolean; error?: string }>,
  authClear: (oldPasscode: string) =>
    ipcRenderer.invoke('auth:clear', oldPasscode) as Promise<{ ok: boolean; error?: string }>,
  authVerify: (passcode: string) =>
    ipcRenderer.invoke('auth:verify', passcode) as Promise<{ ok: boolean }>,

  /* 事件 */
  onProgress: (cb: (p: ProgressPayload) => void) => {
    const h = (_e: unknown, p: ProgressPayload) => cb(p)
    ipcRenderer.on('publish:progress', h)
    return () => {
      ipcRenderer.removeListener('publish:progress', h)
    }
  },
  onRefresh: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('data:refresh', h)
    return () => {
      ipcRenderer.removeListener('data:refresh', h)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

/** Electron 32+ 移除了 File.path，拖拽取绝对路径要用 webUtils */
contextBridge.exposeInMainWorld('getPathForFile', (file: File) => {
  try {
    return webUtils.getPathForFile(file)
  } catch {
    return ''
  }
})

export type API = typeof api
