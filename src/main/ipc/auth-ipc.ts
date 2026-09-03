import { ipcMain } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import * as db from '../db'

const AUTH_KEY = 'authHash'

function hasPassword(): boolean {
  return Boolean(db.getSettings()[AUTH_KEY])
}

function makeHash(passcode: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(passcode, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyHash(passcode: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(passcode, salt, expected.length)
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function registerAuthIPC(): void {
  ipcMain.handle('auth:status', () => ({ hasPassword: hasPassword() }))

  ipcMain.handle('auth:set', (_e, passcode: string) => {
    const code = String(passcode ?? '')
    if (!code || code.length < 4) return { ok: false, error: '密码至少 4 位' }
    db.setSetting(AUTH_KEY, makeHash(code))
    return { ok: true }
  })

  ipcMain.handle('auth:clear', (_e, oldPasscode: string) => {
    const stored = db.getSettings()[AUTH_KEY]
    if (!stored) return { ok: true }
    if (!verifyHash(String(oldPasscode ?? ''), stored)) {
      return { ok: false, error: '原密码不正确' }
    }
    db.setSetting(AUTH_KEY, '')
    return { ok: true }
  })

  ipcMain.handle('auth:verify', (_e, passcode: string) => {
    const stored = db.getSettings()[AUTH_KEY]
    if (!stored) return { ok: true }
    return { ok: verifyHash(String(passcode ?? ''), stored) }
  })
}
