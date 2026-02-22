import dayjs from 'dayjs'
import { db } from '../db.js'

const VALID_ROLES = new Set(['student', 'teacher', 'admin'])
const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID || 'default'

const readArg = (name, fallback = '') => {
  const raw = process.argv.find((item) => item.startsWith(`--${name}=`))
  if (!raw) return fallback
  return raw.slice(name.length + 3).trim()
}

const printUsage = () => {
  console.log(`Usage:
  npm run user:set-role -- --email=teacher@example.com --role=teacher [--tenant=default]

Examples:
  npm run user:set-role -- --email=ops@example.com --role=admin
  npm run user:set-role -- --email=coach@example.com --role=teacher --tenant=school-a
`)
}

const main = async () => {
  const email = readArg('email').toLowerCase()
  const role = readArg('role')
  const tenantId = readArg('tenant', DEFAULT_TENANT)

  if (!email || !role) {
    printUsage()
    throw new Error('missing required args: --email and --role')
  }
  if (!VALID_ROLES.has(role)) {
    throw new Error(`invalid role "${role}", expected one of: student|teacher|admin`)
  }

  db.data.users ||= []
  const idx = db.data.users.findIndex(
    (item) => String(item.email || '').toLowerCase() === email && String(item.tenantId || DEFAULT_TENANT) === tenantId,
  )
  if (idx < 0) {
    throw new Error(`user not found for email=${email}, tenant=${tenantId}`)
  }

  const prevRole = db.data.users[idx].role || 'student'
  db.data.users[idx].role = role
  db.data.users[idx].tenantId = String(db.data.users[idx].tenantId || tenantId)

  db.data.auditLogs ||= []
  db.data.auditLogs.push({
    id: `audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    at: dayjs().toISOString(),
    actorUserId: 'script:setUserRole',
    actorRole: 'system',
    tenantId,
    action: 'user.role.update.script',
    resourceType: 'user',
    resourceId: db.data.users[idx].id,
    result: 'success',
    ip: 'local-script',
    detail: { email, prevRole, nextRole: role },
  })
  db.data.auditLogs = db.data.auditLogs.slice(-5000)

  await db.write()
  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        tenantId,
        userId: db.data.users[idx].id,
        prevRole,
        nextRole: role,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'set role failed',
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
