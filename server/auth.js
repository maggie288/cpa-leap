import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'cpa-leap-dev-secret'

export const signToken = (userId) =>
  jwt.sign(
    {
      sub: userId,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )

export const authRequired = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({ message: '登录已过期，请重新登录' })
  }
}
