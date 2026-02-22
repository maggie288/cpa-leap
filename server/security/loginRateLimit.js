import dayjs from 'dayjs'
import { db } from '../db.js'

const WINDOW_MINUTES = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES || 15)
const ACCOUNT_IP_MAX = Number(process.env.LOGIN_RATE_LIMIT_ACCOUNT_IP_MAX || 8)
const IP_MAX = Number(process.env.LOGIN_RATE_LIMIT_IP_MAX || 30)
const LOCK_MINUTES = Number(process.env.LOGIN_RATE_LIMIT_LOCK_MINUTES || 15)

const nowMs = () => dayjs().valueOf()

const isBlocked = (bucket) => {
  const until = Number(bucket?.blockedUntil || 0)
  return Number.isFinite(until) && until > nowMs()
}

const pruneAndRead = (map, key) => {
  const row = map[key] || { count: 0, firstAt: 0, blockedUntil: 0, lastAt: 0 }
  if (!row.firstAt || nowMs() - Number(row.firstAt) > WINDOW_MINUTES * 60 * 1000) {
    row.count = 0
    row.firstAt = nowMs()
  }
  map[key] = row
  return row
}

export const canAttemptLogin = ({ ip, email }) => {
  db.data.loginRateLimit ||= { accountIpFailures: {}, ipFailures: {} }
  const accountIpKey = `${String(email || '').toLowerCase()}|${String(ip || '')}`
  const ipKey = String(ip || '')
  const accountIpRow = pruneAndRead(db.data.loginRateLimit.accountIpFailures, accountIpKey)
  const ipRow = pruneAndRead(db.data.loginRateLimit.ipFailures, ipKey)
  if (isBlocked(accountIpRow) || isBlocked(ipRow)) {
    const retryAfterMs = Math.max(Number(accountIpRow.blockedUntil || 0), Number(ipRow.blockedUntil || 0)) - nowMs()
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }
  return { ok: true, retryAfterSeconds: 0 }
}

export const markLoginFailure = async ({ ip, email }) => {
  db.data.loginRateLimit ||= { accountIpFailures: {}, ipFailures: {} }
  const accountIpKey = `${String(email || '').toLowerCase()}|${String(ip || '')}`
  const ipKey = String(ip || '')
  const accountIpRow = pruneAndRead(db.data.loginRateLimit.accountIpFailures, accountIpKey)
  const ipRow = pruneAndRead(db.data.loginRateLimit.ipFailures, ipKey)
  accountIpRow.count += 1
  ipRow.count += 1
  accountIpRow.lastAt = nowMs()
  ipRow.lastAt = nowMs()
  if (accountIpRow.count >= ACCOUNT_IP_MAX) {
    accountIpRow.blockedUntil = nowMs() + LOCK_MINUTES * 60 * 1000
  }
  if (ipRow.count >= IP_MAX) {
    ipRow.blockedUntil = nowMs() + LOCK_MINUTES * 60 * 1000
  }
  await db.write()
}

export const clearLoginFailures = async ({ ip, email }) => {
  db.data.loginRateLimit ||= { accountIpFailures: {}, ipFailures: {} }
  const accountIpKey = `${String(email || '').toLowerCase()}|${String(ip || '')}`
  delete db.data.loginRateLimit.accountIpFailures[accountIpKey]
  await db.write()
}
