import { launchContext, closeContext } from './browser'
import { getAdapter } from './platforms'
import type { WorkerCommand, WorkerEvent } from '../shared/types'

function send(event: WorkerEvent): void {
  process.send?.(event)
}

async function handlePublish(msg: Extract<WorkerCommand, { type: 'publish' }>): Promise<void> {
  const adapter = getAdapter(msg.platform)
  if (!adapter) {
    send({
      type: 'result',
      taskId: msg.taskId,
      logId: msg.logId,
      platform: msg.platform,
      accountId: 0,
      success: false,
      error: `暂不支持的平台：${msg.platform}`
    })
    return
  }

  let ctx
  try {
    send({
      type: 'progress',
      taskId: msg.taskId,
      logId: msg.logId,
      platform: msg.platform,
      accountId: 0,
      status: 'launching',
      message: '正在启动浏览器…',
      percent: 3
    })

    ctx = await launchContext({ profileDir: msg.profileDir })
    const page = ctx.pages()[0] ?? (await ctx.newPage())

    const state = await adapter.checkLogin(page)
    if (!state.loggedIn) {
      send({
        type: 'result',
        taskId: msg.taskId,
        logId: msg.logId,
        platform: msg.platform,
        accountId: 0,
        success: false,
        error: '账号未登录，请先在「账号管理」里登录'
      })
      return
    }

    const result = await adapter.publish(page, msg.options, (status, message, percent) => {
      send({
        type: 'progress',
        taskId: msg.taskId,
        logId: msg.logId,
        platform: msg.platform,
        accountId: 0,
        status,
        message,
        percent
      })
    })

    send({
      type: 'result',
      taskId: msg.taskId,
      logId: msg.logId,
      platform: msg.platform,
      accountId: 0,
      success: result.success,
      url: result.url,
      error: result.error,
      duration: result.duration
    })
  } catch (err) {
    send({
      type: 'result',
      taskId: msg.taskId,
      logId: msg.logId,
      platform: msg.platform,
      accountId: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    })
  } finally {
    await closeContext(ctx)
    // 任务完成后主动退出，避免残留浏览器进程
    setTimeout(() => process.exit(0), 500)
  }
}

async function handleLogin(msg: Extract<WorkerCommand, { type: 'login' }>): Promise<void> {
  const ctx = await launchContext({ profileDir: msg.profileDir })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(msg.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})

  let reported = false
  ctx.on('close', () => {
    if (reported) return
    reported = true
    send({ type: 'loginClosed', platform: msg.platform, profileDir: msg.profileDir })
    setTimeout(() => process.exit(0), 300)
  })
}

async function handleCheckLogin(
  msg: Extract<WorkerCommand, { type: 'checkLogin' }>
): Promise<void> {
  const adapter = getAdapter(msg.platform)
  if (!adapter) {
    send({ type: 'loginStatus', platform: msg.platform, profileDir: msg.profileDir, loggedIn: false })
    setTimeout(() => process.exit(0), 300)
    return
  }

  let ctx
  try {
    ctx = await launchContext({ profileDir: msg.profileDir, headless: true })
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    const state = await adapter.checkLogin(page)
    send({
      type: 'loginStatus',
      platform: msg.platform,
      profileDir: msg.profileDir,
      loggedIn: state.loggedIn,
      nickname: state.nickname,
      avatar: state.avatar,
      fans: state.fans
    })
  } catch {
    send({ type: 'loginStatus', platform: msg.platform, profileDir: msg.profileDir, loggedIn: false })
  } finally {
    await closeContext(ctx)
    setTimeout(() => process.exit(0), 300)
  }
}

process.on('message', async (msg: WorkerCommand) => {
  try {
    switch (msg.type) {
      case 'publish':
        await handlePublish(msg)
        break
      case 'login':
        await handleLogin(msg)
        break
      case 'checkLogin':
        await handleCheckLogin(msg)
        break
      case 'cancel':
        process.exit(0)
        break
    }
  } catch (err) {
    console.error('[worker] 未处理异常：', err)
  }
})

// 父进程断开时自杀，防止孤儿进程
process.on('disconnect', () => process.exit(0))

console.log('[worker] 自动化子进程已启动')
