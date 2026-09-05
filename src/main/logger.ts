import { appendFileSync, statSync, renameSync, existsSync } from 'fs'
import { getLogPath } from './paths'

/**
 * 极简主进程日志落盘：console.log/error 之外再写一份 data/main.log，
 * 超过 5MB 滚动为 main.log.1，便于「设置 → 打开数据目录」后取日志排障。
 */

const MAX_BYTES = 5 * 1024 * 1024

function stamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function rotateIfNeeded(): void {
  try {
    const p = getLogPath()
    if (existsSync(p) && statSync(p).size > MAX_BYTES) {
      renameSync(p, p + '.1')
    }
  } catch {
    /* ignore */
  }
}

function writeLine(level: string, args: unknown[]): void {
  try {
    const text = args
      .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()))
      .join(' ')
    appendFileSync(getLogPath(), `[${stamp()}] [${level}] ${text}\n`, 'utf8')
  } catch {
    /* 日志失败绝不影响主流程 */
  }
}

export function initLogger(): void {
  rotateIfNeeded()
  const origLog = console.log.bind(console)
  const origErr = console.error.bind(console)
  const origWarn = console.warn.bind(console)
  console.log = (...args: unknown[]) => {
    origLog(...args)
    writeLine('INFO', args)
  }
  console.error = (...args: unknown[]) => {
    origErr(...args)
    writeLine('ERROR', args)
  }
  console.warn = (...args: unknown[]) => {
    origWarn(...args)
    writeLine('WARN', args)
  }
  process.on('uncaughtException', (err) => {
    writeLine('FATAL', [err.stack || String(err)])
  })
  process.on('unhandledRejection', (r) => {
    writeLine('FATAL', ['unhandledRejection', String(r)])
  })
  writeLine('INFO', ['---- 分发云启动 ----'])
}
