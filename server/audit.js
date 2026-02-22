import dayjs from 'dayjs'
import { db } from './db.js'

export const appendAuditLog = async ({
  actorUserId = 'system',
  actorRole = 'system',
  tenantId = 'default',
  action,
  resourceType,
  resourceId = '',
  result = 'success',
  detail = {},
  ip = '',
}) => {
  db.data.auditLogs ||= []
  const row = {
    id: `audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    at: dayjs().toISOString(),
    actorUserId: String(actorUserId || 'system'),
    actorRole: String(actorRole || 'system'),
    tenantId: String(tenantId || 'default'),
    action: String(action || ''),
    resourceType: String(resourceType || ''),
    resourceId: String(resourceId || ''),
    result: result === 'failed' ? 'failed' : 'success',
    ip: String(ip || ''),
    detail: detail && typeof detail === 'object' ? detail : {},
  }
  db.data.auditLogs.push(row)
  db.data.auditLogs = db.data.auditLogs.slice(-5000)
  await db.write()
  return row
}

export const listAuditLogs = ({ tenantId, limit = 200, action } = {}) => {
  const rows = (db.data.auditLogs || []).filter((row) => {
    if (tenantId && row.tenantId !== tenantId) return false
    if (action && row.action !== action) return false
    return true
  })
  return rows.slice(-Math.max(1, limit)).reverse()
}
