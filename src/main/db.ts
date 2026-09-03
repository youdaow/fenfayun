import Database from 'better-sqlite3'
import { getDbPath } from './paths'
import type {
  AccountAnalytics,
  AccountRow,
  MaterialRow,
  PublishLogRow,
  TaskInput,
  TaskRow,
  TaskStatus,
  LogStatus,
  WorkMetricRow,
  WorkStatRow
} from '../shared/types'

let db: Database.Database | null = null

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  remark        TEXT,
  group_name    TEXT,
  profile_dir   TEXT    NOT NULL UNIQUE,
  is_logged_in  INTEGER DEFAULT 0,
  last_check    TEXT,
  avatar        TEXT,
  fans          TEXT,
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);

CREATE TABLE IF NOT EXISTS materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  path        TEXT    NOT NULL UNIQUE,
  size        INTEGER DEFAULT 0,
  duration    REAL,
  cover_path  TEXT,
  remark      TEXT,
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_materials_created ON materials(created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT,
  tags          TEXT,
  video_path    TEXT    NOT NULL,
  cover_path    TEXT,
  material_id   INTEGER,
  publish_mode  TEXT    DEFAULT 'now',
  scheduled_at  TEXT,
  targets       TEXT    NOT NULL DEFAULT '[]',
  status        TEXT    DEFAULT 'pending',
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_at);

CREATE TABLE IF NOT EXISTS publish_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER NOT NULL,
  platform     TEXT    NOT NULL,
  account_id   INTEGER,
  status       TEXT    DEFAULT 'pending',
  message      TEXT,
  result_url   TEXT,
  error        TEXT,
  duration_ms  INTEGER,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_task ON publish_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_id ON publish_logs(id DESC);

CREATE TABLE IF NOT EXISTS work_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id      INTEGER NOT NULL,
  plays       INTEGER DEFAULT 0,
  likes       INTEGER DEFAULT 0,
  comments    INTEGER DEFAULT 0,
  shares      INTEGER DEFAULT 0,
  favorites   INTEGER DEFAULT 0,
  fans_delta  INTEGER DEFAULT 0,
  recorded_at TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_metrics_log ON work_metrics(log_id);
CREATE INDEX IF NOT EXISTS idx_metrics_time ON work_metrics(recorded_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`

export function initDB(): void {
  if (db) return
  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
}

/** 老库补列迁移（幂等） */
function migrate(d: Database.Database): void {
  const cols = (t: string) => d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]
  const has = (t: string, c: string) => cols(t).some((x) => x.name === c)
  if (!has('accounts', 'avatar')) d.exec('ALTER TABLE accounts ADD COLUMN avatar TEXT')
  if (!has('accounts', 'fans')) d.exec('ALTER TABLE accounts ADD COLUMN fans TEXT')
}

function getDB(): Database.Database {
  if (!db) throw new Error('数据库未初始化')
  return db
}

/* ============ 设置 ============ */

export function getSetting(key: string, fallback = ''): string {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string): void {
  getDB()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

export function getSettings(): Record<string, string> {
  const rows = getDB().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/* ============ 账号 ============ */

export function listAccounts(): AccountRow[] {
  return getDB().prepare('SELECT * FROM accounts ORDER BY platform, id').all() as AccountRow[]
}

export function getAccount(id: number): AccountRow | undefined {
  return getDB().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
}

export function createAccount(
  platform: string,
  name: string,
  profileDir: string,
  remark = '',
  group = ''
): AccountRow {
  const res = getDB()
    .prepare(
      'INSERT INTO accounts (platform, name, profile_dir, remark, group_name) VALUES (?, ?, ?, ?, ?)'
    )
    .run(platform, name, profileDir, remark, group)
  return getAccount(res.lastInsertRowid as number)!
}

export function updateAccount(
  id: number,
  patch: { name?: string; remark?: string; group_name?: string }
): AccountRow | undefined {
  const fields: string[] = []
  const values: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    fields.push(`${k} = ?`)
    values.push(v)
  }
  if (!fields.length) return getAccount(id)
  values.push(id)
  getDB()
    .prepare(
      `UPDATE accounts SET ${fields.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
    )
    .run(...values)
  return getAccount(id)
}

export function setAccountProfileDir(id: number, dir: string): void {
  getDB().prepare('UPDATE accounts SET profile_dir = ? WHERE id = ?').run(dir, id)
}

export function setAccountLogin(id: number, loggedIn: boolean): void {
  getDB()
    .prepare(
      `UPDATE accounts SET is_logged_in = ?, last_check = datetime('now','localtime'),
       updated_at = datetime('now','localtime') WHERE id = ?`
    )
    .run(loggedIn ? 1 : 0, id)
}

/** 更新账号的头像与粉丝数（登录检测时顺带抓到） */
export function setAccountProfile(id: number, patch: { avatar?: string; fans?: string }): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.avatar !== undefined) {
    fields.push('avatar = ?')
    values.push(patch.avatar)
  }
  if (patch.fans !== undefined) {
    fields.push('fans = ?')
    values.push(patch.fans)
  }
  if (!fields.length) return
  values.push(id)
  getDB().prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function removeAccount(id: number): void {
  getDB().prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

/* ============ 素材 ============ */

export function listMaterials(keyword = ''): MaterialRow[] {
  if (keyword) {
    return getDB()
      .prepare('SELECT * FROM materials WHERE name LIKE ? ORDER BY id DESC')
      .all(`%${keyword}%`) as MaterialRow[]
  }
  return getDB().prepare('SELECT * FROM materials ORDER BY id DESC').all() as MaterialRow[]
}

export function createMaterial(m: {
  name: string
  path: string
  size: number
  duration?: number | null
  coverPath?: string | null
  remark?: string
}): MaterialRow {
  const res = getDB()
    .prepare(
      'INSERT INTO materials (name, path, size, duration, cover_path, remark) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(m.name, m.path, m.size, m.duration ?? null, m.coverPath ?? null, m.remark ?? '')
  return getDB().prepare('SELECT * FROM materials WHERE id = ?').get(res.lastInsertRowid) as MaterialRow
}

export function updateMaterial(
  id: number,
  patch: { name?: string; remark?: string; cover_path?: string | null }
): void {
  const fields: string[] = []
  const values: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    fields.push(`${k} = ?`)
    values.push(v)
  }
  if (!fields.length) return
  values.push(id)
  getDB().prepare(`UPDATE materials SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function removeMaterial(id: number): void {
  getDB().prepare('DELETE FROM materials WHERE id = ?').run(id)
}

/* ============ 任务 ============ */

export interface TaskQuery {
  status?: TaskStatus | 'all'
  limit?: number
  offset?: number
  keyword?: string
}

export function listTasks(q: TaskQuery = {}): TaskRow[] {
  const { status = 'all', limit = 100, offset = 0, keyword = '' } = q
  const where: string[] = []
  const args: unknown[] = []
  if (status !== 'all') {
    where.push('status = ?')
    args.push(status)
  }
  if (keyword) {
    where.push('(title LIKE ? OR description LIKE ?)')
    args.push(`%${keyword}%`, `%${keyword}%`)
  }
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE WHEN status IN ('pending','running') THEN 0 ELSE 1 END, id DESC LIMIT ? OFFSET ?`
  return getDB().prepare(sql).all(...args, limit, offset) as TaskRow[]
}

export function getTask(id: number): TaskRow | undefined {
  return getDB().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
}

export function createTask(input: TaskInput): TaskRow {
  const res = getDB()
    .prepare(
      `INSERT INTO tasks (title, description, tags, video_path, cover_path, material_id,
        publish_mode, scheduled_at, targets, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title,
      input.description,
      JSON.stringify(input.tags ?? []),
      input.videoPath,
      input.coverPath ?? null,
      input.materialId ?? null,
      input.publishMode,
      input.scheduledAt ?? null,
      JSON.stringify(input.targets ?? []),
      input.publishMode === 'scheduled' ? 'pending' : 'pending'
    )
  return getTask(res.lastInsertRowid as number)!
}

export function updateTaskStatus(id: number, status: TaskStatus): void {
  if (status === 'success' || status === 'failed' || status === 'partial' || status === 'canceled') {
    getDB()
      .prepare(`UPDATE tasks SET status = ?, completed_at = datetime('now','localtime') WHERE id = ?`)
      .run(status, id)
  } else {
    getDB().prepare(`UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?`).run(status, id)
  }
}

export function removeTask(id: number): void {
  getDB().prepare('DELETE FROM publish_logs WHERE task_id = ?').run(id)
  getDB().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

/** 取出所有到点的定时任务 */
export function listDueTasks(now: string): TaskRow[] {
  return getDB()
    .prepare(
      `SELECT * FROM tasks WHERE status = 'pending' AND publish_mode = 'scheduled'
       AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC`
    )
    .all(now) as TaskRow[]
}

/* ============ 发布日志 ============ */

export function createPublishLog(
  taskId: number,
  platform: string,
  accountId: number
): PublishLogRow {
  const res = getDB()
    .prepare('INSERT INTO publish_logs (task_id, platform, account_id) VALUES (?, ?, ?)')
    .run(taskId, platform, accountId)
  return getDB()
    .prepare('SELECT * FROM publish_logs WHERE id = ?')
    .get(res.lastInsertRowid) as PublishLogRow
}

export function updatePublishLog(
  id: number,
  patch: {
    status?: LogStatus
    message?: string | null
    resultUrl?: string | null
    error?: string | null
    durationMs?: number | null
  }
): void {
  const started =
    patch.status && ['running', 'uploading', 'filling', 'publishing'].includes(patch.status)
  const finished =
    patch.status && ['success', 'failed', 'canceled'].includes(patch.status)

  getDB()
    .prepare(
      `UPDATE publish_logs SET
        status     = COALESCE(?, status),
        message    = COALESCE(?, message),
        result_url = COALESCE(?, result_url),
        error      = COALESCE(?, error),
        duration_ms= COALESCE(?, duration_ms),
        started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN datetime('now','localtime') ELSE started_at END,
        finished_at= CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE finished_at END
       WHERE id = ?`
    )
    .run(
      patch.status ?? null,
      patch.message ?? null,
      patch.resultUrl ?? null,
      patch.error ?? null,
      patch.durationMs ?? null,
      started ? 1 : 0,
      finished ? 1 : 0,
      id
    )
}

export function getPublishLog(id: number): PublishLogRow | undefined {
  return getDB().prepare('SELECT * FROM publish_logs WHERE id = ?').get(id) as
    | PublishLogRow
    | undefined
}

export interface LogQuery {
  limit?: number
  offset?: number
  platform?: string
  status?: string
  days?: number
  keyword?: string
}

export function listPublishLogs(q: LogQuery = {}): PublishLogRow[] {
  const { limit = 100, offset = 0, platform = 'all', status = 'all', days = 0, keyword = '' } = q
  const where: string[] = []
  const args: unknown[] = []
  if (platform !== 'all') {
    where.push('pl.platform = ?')
    args.push(platform)
  }
  if (status !== 'all') {
    where.push('pl.status = ?')
    args.push(status)
  }
  if (days > 0) {
    where.push(`pl.id IN (SELECT id FROM publish_logs WHERE started_at >= datetime('now','localtime',?))`)
    args.push(`-${days} days`)
  }
  if (keyword) {
    where.push('(t.title LIKE ? OR a.name LIKE ?)')
    args.push(`%${keyword}%`, `%${keyword}%`)
  }
  const sql = `SELECT pl.*, t.title AS task_title, a.name AS account_name
    FROM publish_logs pl
    LEFT JOIN tasks t ON pl.task_id = t.id
    LEFT JOIN accounts a ON pl.account_id = a.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pl.id DESC LIMIT ? OFFSET ?`
  return getDB().prepare(sql).all(...args, limit, offset) as PublishLogRow[]
}

export function countLogsSince(days: number): number {
  const row = getDB()
    .prepare(
      `SELECT COUNT(*) AS c FROM publish_logs WHERE started_at >= datetime('now','localtime',?)`
    )
    .get(`-${days} days`) as { c: number }
  return row.c
}

/* ============ 统计 ============ */

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

export function getStats(): Stats {
  const d = getDB()
  const accountTotal = (d.prepare('SELECT COUNT(*) c FROM accounts').get() as { c: number }).c
  const accountOnline = (
    d.prepare('SELECT COUNT(*) c FROM accounts WHERE is_logged_in = 1').get() as { c: number }
  ).c
  const materialTotal = (d.prepare('SELECT COUNT(*) c FROM materials').get() as { c: number }).c
  const taskPending = (
    d.prepare(`SELECT COUNT(*) c FROM tasks WHERE status IN ('pending','running')`).get() as {
      c: number
    }
  ).c
  const logToday = (
    d
      .prepare(
        `SELECT COUNT(*) c FROM publish_logs WHERE date(finished_at) = date('now','localtime')`
      )
      .get() as { c: number }
  ).c
  const logSuccess = (
    d.prepare(`SELECT COUNT(*) c FROM publish_logs WHERE status = 'success'`).get() as { c: number }
  ).c
  const logFailed = (
    d.prepare(`SELECT COUNT(*) c FROM publish_logs WHERE status = 'failed'`).get() as { c: number }
  ).c
  const byPlatform = d
    .prepare(
      `SELECT platform,
              COUNT(*) AS total,
              SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM publish_logs GROUP BY platform`
    )
    .all() as Stats['byPlatform']
  const last7Days = d
    .prepare(
      `SELECT date(finished_at) AS date, COUNT(*) AS count
       FROM publish_logs
       WHERE finished_at IS NOT NULL AND finished_at >= datetime('now','localtime','-6 days')
       GROUP BY date(finished_at) ORDER BY date ASC`
    )
    .all() as Stats['last7Days']

  return {
    accountTotal,
    accountOnline,
    materialTotal,
    taskPending,
    logToday,
    logSuccess,
    logFailed,
    byPlatform,
    last7Days
  }
}

/* ============ 作品数据分析 ============ */

export function addWorkMetric(m: {
  logId: number
  plays: number
  likes: number
  comments: number
  shares: number
  favorites: number
  fansDelta: number
}): number {
  const res = getDB()
    .prepare(
      `INSERT INTO work_metrics (log_id, plays, likes, comments, shares, favorites, fans_delta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(m.logId, m.plays, m.likes, m.comments, m.shares, m.favorites, m.fansDelta)
  return res.lastInsertRowid as number
}

/** 某条作品的所有历史快照（按时间升序，供画趋势曲线） */
export function listWorkSnapshots(logId: number): WorkMetricRow[] {
  return getDB()
    .prepare('SELECT * FROM work_metrics WHERE log_id = ? ORDER BY recorded_at ASC, id ASC')
    .all(logId) as WorkMetricRow[]
}

/** 作品维度的最新指标（join 发布记录，取每条的最近一次快照） */
export function listWorkStats(): WorkStatRow[] {
  return getDB()
    .prepare(
      `SELECT pl.id AS log_id, pl.platform, pl.account_id, a.name AS account_name,
              t.title, pl.result_url, pl.finished_at AS published_at,
              COALESCE(wm.plays,0) AS plays, COALESCE(wm.likes,0) AS likes,
              COALESCE(wm.comments,0) AS comments, COALESCE(wm.shares,0) AS shares,
              COALESCE(wm.favorites,0) AS favorites, COALESCE(wm.fans_delta,0) AS fans_delta,
              wm.snapshot_count, wm.last_recorded_at
       FROM publish_logs pl
       LEFT JOIN accounts a ON pl.account_id = a.id
       LEFT JOIN tasks t ON pl.task_id = t.id
       LEFT JOIN (
         SELECT log_id,
                MAX(recorded_at) AS last_recorded_at,
                COUNT(*) AS snapshot_count
         FROM work_metrics GROUP BY log_id
       ) wm ON pl.log_id = wm.log_id
       WHERE pl.status = 'success'
       ORDER BY COALESCE(pl.finished_at, '') DESC`
    )
    .all() as WorkStatRow[]
}

/** 账号维度汇总 */
export function listAccountAnalytics(): AccountAnalytics[] {
  return getDB()
    .prepare(
      `SELECT pl.account_id, a.name AS account_name, pl.platform,
              SUM(wm.plays) AS total_plays, SUM(wm.likes) AS total_likes,
              SUM(wm.comments) AS total_comments, SUM(wm.fans_delta) AS total_fans,
              COUNT(DISTINCT pl.id) AS works,
              CASE WHEN SUM(wm.plays) > 0 THEN ROUND(SUM(wm.likes)*100.0/SUM(wm.plays),2) ELSE 0 END AS avg_like_rate
       FROM work_metrics wm
       JOIN publish_logs pl ON wm.log_id = pl.id
       JOIN accounts a ON pl.account_id = a.id
       GROUP BY pl.account_id, pl.platform
       ORDER BY total_plays DESC`
    )
    .all() as AccountAnalytics[]
}

export function deleteWorkMetric(id: number): void {
  getDB().prepare('DELETE FROM work_metrics WHERE id = ?').run(id)
}

