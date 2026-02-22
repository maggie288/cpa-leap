import jwt from 'jsonwebtoken'
import { db } from './db.js'

const DEV_FALLBACK_SECRET = 'cpa-leap-dev-secret'
const IS_PROD = process.env.NODE_ENV === 'production'
const JWT_SECRETS = String(process.env.JWT_SECRETS || process.env.JWT_SECRET || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const ACTIVE_JWT_SECRET = JWT_SECRETS[0] || DEV_FALLBACK_SECRET
const VALID_ROLES = ['student', 'teacher', 'admin']

if (IS_PROD && (!JWT_SECRETS.length || JWT_SECRETS.includes(DEV_FALLBACK_SECRET))) {
  throw new Error('JWT_SECRETS is required in production and must not use development default secret')
}

export const signToken = (userId, tenantId = 'default') =>
  jwt.sign(
    {
      sub: userId,
      tenantId: String(tenantId || 'default'),
    },
    ACTIVE_JWT_SECRET,
    { expiresIn: '7d' },
  )

export const authRequired = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    let payload = null
    let verified = false
    for (const secret of JWT_SECRETS.length ? JWT_SECRETS : [ACTIVE_JWT_SECRET]) {
      try {
        payload = jwt.verify(token, secret)
        verified = true
        break
      } catch {
        // Try next secret for rotation compatibility.
      }
    }
    if (!verified || !payload) throw new Error('invalid token')
    req.userId = payload.sub
    const user = (db.data.users || []).find((item) => item.id === req.userId)
    if (!user) return res.status(401).json({ message: '用户不存在，请重新登录' })
    req.userRole = VALID_ROLES.includes(String(user.role)) ? user.role : 'student'
    req.tenantId = String(user.tenantId || payload.tenantId || 'default')
    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: '登录已过期，请重新登录' })
  }
}

export const requireRoles = (...roles) => {
  const allowed = roles.filter((role) => VALID_ROLES.includes(role))
  return (req, res, next) => {
    if (!req.userId) return res.status(401).json({ message: '未登录' })
    const role = VALID_ROLES.includes(String(req.userRole)) ? req.userRole : 'student'
    if (!allowed.includes(role)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: '无权限访问该资源',
        hint: '请联系管理员开通相应角色权限',
      })
    }
    next()
  }
}
