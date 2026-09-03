import { fork, type ChildProcess } from 'child_process'
import { join } from 'path'
import { getSetting } from './db'
import type { WorkerCommand, WorkerEvent } from '../shared/types'

/**
 * 一个 WorkerHandle 对应一个自动化子进程（浏览器实例）。
 * 独立进程的好处：浏览器崩溃 / 平台页面卡死不会拖垮主界面，且可随时 kill 实现取消。
 */
export class WorkerHandle {
  private child: ChildProcess
  private listeners = new Set<(e: WorkerEvent) => void>()
  private exited = false

  constructor(workerPath: string) {
    const browserPath = getSetting('browserPath', '')
    this.child = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        VDIST_WORKER: '1',
        ...(browserPath ? { VDIST_BROWSER_PATH: browserPath } : {})
      }
    })
    this.child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString().trim()
      if (s) console.log('[worker]', s)
    })
    this.child.stderr?.on('data', (d: Buffer) => {
      const s = d.toString().trim()
      if (s) console.error('[worker:err]', s)
    })
    this.child.on('message', (e: WorkerEvent) => {
      for (const fn of this.listeners) {
        try {
          fn(e)
        } catch {
          /* ignore */
        }
      }
    })
    this.child.on('exit', () => {
      this.exited = true
    })
  }

  on(fn: (e: WorkerEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  send(cmd: WorkerCommand): void {
    if (!this.exited && this.child.connected) this.child.send(cmd)
  }

  kill(): void {
    if (this.exited) return
    try {
      this.send({ type: 'cancel' })
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!this.exited) this.child.kill('SIGKILL')
    }, 2000)
  }
}

export function resolveWorkerPath(): string {
  // 开发：out/worker/index.js（esbuild 产物）；打包：resources/app.asar/out/worker/index.js
  return join(__dirname, '../worker/index.js')
}
