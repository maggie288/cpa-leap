import bcrypt from 'bcryptjs'
import cors from 'cors'
import dayjs from 'dayjs'
import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { authRequired, signToken } from './auth.js'
import { db } from './db.js'
import { runAutonomousCoursePipeline } from './ai/autonomousCourseEngine.js'
import {
  applyKnowledgeFix,
  getKnowledgeEntryById,
  getKnowledgeStats,
  listKnowledgeEntries,
  suggestKnowledgeFix,
  updateKnowledgeReview,
  upsertKnowledgeEntries,
} from './knowledge/repository.js'

const app = express()
const PORT = Number(process.env.PORT || 8787)
const VALID_SUBJECTS = ['accounting', 'audit', 'finance', 'tax', 'law', 'strategy']
const DIST_DIR = resolve(process.cwd(), 'dist')
const INDEX_PATH = resolve(DIST_DIR, 'index.html')
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*'

app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  targetExamDate: user.targetExamDate,
  plan: user.plan,
  streakDays: user.streakDays,
  createdAt: user.createdAt,
})

const createDefaultProgress = (userId) => ({
  userId,
  xp: 0,
  completedLessons: [],
  lessonProgressMap: {},
  weakPoints: [],
  lastStudyAt: null,
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cpa-leap-api' })
})

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, targetExamDate } = req.body
  if (!name || !email || !password || !targetExamDate) {
    return res.status(400).json({ message: '参数不完整' })
  }
  const normalizedEmail = String(email).trim().toLowerCase()
  const existing = db.data.users.find((item) => item.email === normalizedEmail)
  if (existing) return res.status(409).json({ message: '该邮箱已注册，请直接登录' })

  const user = {
    id: `u_${Date.now()}`,
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(String(password), 10),
    targetExamDate,
    plan: 'free',
    streakDays: 1,
    createdAt: dayjs().toISOString(),
  }
  db.data.users.push(user)
  db.data.progresses[user.id] = createDefaultProgress(user.id)
  await db.write()

  const token = signToken(user.id)
  return res.json({ token, user: sanitizeUser(user), progress: db.data.progresses[user.id] })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ message: '参数不完整' })
  const normalizedEmail = String(email).trim().toLowerCase()
  const user = db.data.users.find((item) => item.email === normalizedEmail)
  if (!user) return res.status(401).json({ message: '邮箱或密码不正确' })
  const ok = await bcrypt.compare(String(password), user.passwordHash)
  if (!ok) return res.status(401).json({ message: '邮箱或密码不正确' })

  if (!db.data.progresses[user.id]) {
    db.data.progresses[user.id] = createDefaultProgress(user.id)
    await db.write()
  }

  const token = signToken(user.id)
  return res.json({ token, user: sanitizeUser(user), progress: db.data.progresses[user.id] })
})

app.get('/api/me', authRequired, (req, res) => {
  const user = db.data.users.find((item) => item.id === req.userId)
  if (!user) return res.status(404).json({ message: '用户不存在' })
  return res.json({ user: sanitizeUser(user) })
})

app.get('/api/progress', authRequired, (req, res) => {
  const progress = db.data.progresses[req.userId] ?? createDefaultProgress(req.userId)
  return res.json({ progress })
})

app.post('/api/progress/lesson', authRequired, async (req, res) => {
  const { lessonId, score, weakPoints, subject, runId } = req.body
  if (!lessonId || typeof score !== 'number') return res.status(400).json({ message: '参数不完整' })
  const base = db.data.progresses[req.userId] ?? createDefaultProgress(req.userId)
  const next = {
    ...base,
    xp: base.xp + Math.max(10, score),
    completedLessons: Array.from(new Set([...base.completedLessons, lessonId])),
    lessonProgressMap: {
      ...base.lessonProgressMap,
      [lessonId]: {
        lessonId,
        completed: true,
        score,
        completedAt: dayjs().toISOString(),
      },
    },
    weakPoints: Array.from(new Set([...(base.weakPoints || []), ...((weakPoints || []).slice(-5) || [])])).slice(-20),
    lastStudyAt: dayjs().toISOString(),
  }
  db.data.progresses[req.userId] = next

  if (subject && VALID_SUBJECTS.includes(String(subject))) {
    const run = runId ? (db.data.generationRuns || []).find((item) => item.runId === String(runId)) : null
    db.data.modelFeedback.push({
      at: dayjs().toISOString(),
      userId: req.userId,
      lessonId: String(lessonId),
      subject: String(subject),
      score,
      weakPoints: Array.isArray(weakPoints) ? weakPoints.slice(0, 5) : [],
      runId: run?.runId || null,
      modelVersion: run?.modelVersion || null,
    })
  }
  await db.write()
  return res.json({ progress: next })
})

app.post('/api/subscription', authRequired, async (req, res) => {
  const { plan } = req.body
  if (!['free', 'pro', 'ultra'].includes(plan)) return res.status(400).json({ message: '套餐非法' })
  const idx = db.data.users.findIndex((item) => item.id === req.userId)
  if (idx < 0) return res.status(404).json({ message: '用户不存在' })
  db.data.users[idx].plan = plan
  await db.write()
  return res.json({ user: sanitizeUser(db.data.users[idx]) })
})

app.post('/api/llm/generate-cpa-lesson', authRequired, async (req, res) => {
  const { subject, lessonId, lessonTitle, objective, examPoints, weakPoints } = req.body
  const safeExamPoints = Array.isArray(examPoints) ? examPoints : []
  const safeWeakPoints = Array.isArray(weakPoints) ? weakPoints : []
  const safeSubject = String(subject || '').trim()

  if (!safeSubject || !lessonTitle || !objective) {
    return res.status(400).json({ message: '参数不完整' })
  }
  if (!VALID_SUBJECTS.includes(safeSubject)) {
    return res.status(400).json({ message: '科目非法' })
  }

  const generated = await runAutonomousCoursePipeline({
    subject: safeSubject,
    lessonId: lessonId ? String(lessonId) : undefined,
    lessonTitle: String(lessonTitle),
    objective: String(objective),
    examPoints: safeExamPoints,
    weakPoints: safeWeakPoints,
    userId: req.userId,
  })

  return res.json({
    ...generated,
  })
})

app.get('/api/automation/stats', authRequired, (_req, res) => {
  const runs = db.data.generationRuns || []
  const feedback = db.data.modelFeedback || []
  const total = runs.length
  const autoApproved = runs.filter((item) => item.autoApproved).length
  const latest = runs.slice(-20)

  const byModel = {}
  for (const run of runs) {
    const key = run.modelVersion || 'unknown'
    if (!byModel[key]) {
      byModel[key] = { runs: 0, autoApprovedRuns: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byModel[key].runs += 1
    if (run.autoApproved) byModel[key].autoApprovedRuns += 1
    byModel[key].avgQualityScore += Number(run.qualityScore || 0)
  }
  for (const fb of feedback) {
    if (!fb.modelVersion) continue
    if (!byModel[fb.modelVersion]) {
      byModel[fb.modelVersion] = { runs: 0, autoApprovedRuns: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byModel[fb.modelVersion].avgLearnerScore += Number(fb.score || 0)
    byModel[fb.modelVersion].feedbackCount += 1
  }
  for (const key of Object.keys(byModel)) {
    const row = byModel[key]
    row.autoApproveRate = row.runs ? Number(((row.autoApprovedRuns / row.runs) * 100).toFixed(2)) : 0
    row.avgQualityScore = row.runs ? Number((row.avgQualityScore / row.runs).toFixed(2)) : 0
    row.avgLearnerScore = row.feedbackCount ? Number((row.avgLearnerScore / row.feedbackCount).toFixed(2)) : 0
  }

  return res.json({
    totalRuns: total,
    autoApprovedRuns: autoApproved,
    autoApproveRate: total ? Number(((autoApproved / total) * 100).toFixed(2)) : 0,
    latestRuns: latest,
    byModel,
  })
})

app.get('/api/automation/settings', authRequired, (_req, res) => {
  return res.json({ settings: db.data.automationSettings || {} })
})

app.post('/api/automation/settings', authRequired, async (req, res) => {
  const base = db.data.automationSettings || {}
  const next = {
    ...base,
    ...(typeof req.body === 'object' ? req.body : {}),
  }
  db.data.automationSettings = next
  await db.write()
  return res.json({ settings: next })
})

app.get('/api/knowledge/stats', authRequired, (_req, res) => {
  return res.json(getKnowledgeStats())
})

app.get('/api/knowledge', authRequired, (req, res) => {
  const { subject, status, q, minQualityScore } = req.query
  const entries = listKnowledgeEntries({
    subject: subject ? String(subject) : undefined,
    status: status ? String(status) : undefined,
    q: q ? String(q) : undefined,
    minQualityScore: minQualityScore ? Number(minQualityScore) : undefined,
  })
  return res.json({ total: entries.length, entries })
})

app.get('/api/knowledge/:id', authRequired, (req, res) => {
  const entry = getKnowledgeEntryById(String(req.params.id))
  if (!entry) return res.status(404).json({ message: '知识条目不存在' })
  return res.json({ entry })
})

app.post('/api/knowledge/import', authRequired, (req, res) => {
  const { entries, actor } = req.body
  const result = upsertKnowledgeEntries({
    entries,
    actor: actor ? String(actor) : req.userId,
  })
  return res.json(result)
})

app.post('/api/knowledge/review', authRequired, (req, res) => {
  const { id, status, actor } = req.body
  if (!id || !status) return res.status(400).json({ message: '参数不完整' })
  const result = updateKnowledgeReview({
    id: String(id),
    status: String(status),
    actor: actor ? String(actor) : req.userId,
  })
  if (!result.ok) return res.status(400).json({ message: result.message, quality: result.quality })
  return res.json(result)
})

app.post('/api/knowledge/suggest-fix', authRequired, (req, res) => {
  const { id } = req.body
  if (!id) return res.status(400).json({ message: '参数不完整' })
  const result = suggestKnowledgeFix({ id: String(id) })
  if (!result.ok) return res.status(404).json({ message: result.message })
  return res.json(result)
})

app.post('/api/knowledge/apply-fix', authRequired, (req, res) => {
  const { id, actor, patch } = req.body
  if (!id) return res.status(400).json({ message: '参数不完整' })
  const result = applyKnowledgeFix({
    id: String(id),
    actor: actor ? String(actor) : req.userId,
    patch: patch && typeof patch === 'object' ? patch : undefined,
  })
  if (!result.ok) return res.status(404).json({ message: result.message })
  return res.json(result)
})

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(INDEX_PATH)
  })
}

app.listen(PORT, () => {
  console.log(`CPA Leap API running on http://localhost:${PORT}`)
})
