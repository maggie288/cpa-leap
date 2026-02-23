import bcrypt from 'bcryptjs'
import cors from 'cors'
import dayjs from 'dayjs'
import express from 'express'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import multer from 'multer'
import { authRequired, requireRoles, signToken } from './auth.js'
import { db } from './db.js'
import { appendAuditLog, listAuditLogs } from './audit.js'
import { canAttemptLogin, clearLoginFailures, markLoginFailure } from './security/loginRateLimit.js'
import { replayPromptEvaluation, runAutonomousCoursePipeline, runPromptAutoPromote } from './ai/autonomousCourseEngine.js'
import { ingestPdfToChunks } from './ingest/pdfPipeline.js'
import { deleteMaterialChunksFromVectorStore, upsertMaterialChunksToVectorStore } from './ingest/vectorStore.js'
import { createSignedUploadForObject, getStorageBucket, isSupabaseStorageEnabled, removeObject } from './storage/materialStorage.js'
import {
  getPolicyScoutSettings,
  getPolicyScoutStats,
  listPolicyScoutItems,
  listPolicyScoutRuns,
  runPolicyScoutOnce,
  startPolicyScoutScheduler,
  updatePolicyScoutSettings,
} from './policy/policyScout.js'
import {
  applyKnowledgeFix,
  deleteKnowledgeEntriesById,
  getKnowledgeEntryById,
  getKnowledgeCoverage,
  listKnowledgeConflicts,
  getKnowledgeStats,
  listKnowledgeEntries,
  purgeAiGeneratedKnowledge,
  suggestKnowledgeFix,
  updateKnowledgeReview,
  upsertKnowledgeEntries,
} from './knowledge/repository.js'

const app = express()
const PORT = Number(process.env.PORT || 8787)
const VALID_SUBJECTS = ['accounting', 'audit', 'finance', 'tax', 'law', 'strategy']
const SUBJECT_NAMES = {
  accounting: '会计',
  audit: '审计',
  finance: '财管',
  tax: '税法',
  law: '经济法',
  strategy: '战略',
}
const VALID_ROLES = ['student', 'teacher', 'admin']
const DIST_DIR = resolve(process.cwd(), 'dist')
const INDEX_PATH = resolve(DIST_DIR, 'index.html')
const UPLOAD_DIR = resolve(process.cwd(), 'server/data/uploads')
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*'
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default'
const SECURITY_ALERT_WEBHOOK = process.env.SECURITY_ALERT_WEBHOOK || ''

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
    cb(null, `${Date.now()}_${safeBase}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
})

app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())
app.use('/uploads', express.static(UPLOAD_DIR))

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  targetExamDate: user.targetExamDate,
  plan: user.plan,
  streakDays: user.streakDays,
  createdAt: user.createdAt,
  tenantId: String(user.tenantId || DEFAULT_TENANT_ID),
  role: VALID_ROLES.includes(String(user.role)) ? user.role : 'student',
})

const requestIp = (req) => {
  const xff = String(req.headers['x-forwarded-for'] || '')
  if (xff) return xff.split(',')[0].trim()
  return String(req.ip || req.socket?.remoteAddress || 'unknown')
}

const emitSecurityAlert = async (payload) => {
  db.data.securityAlerts ||= []
  db.data.securityAlerts.push({
    id: `sec_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    at: dayjs().toISOString(),
    ...payload,
  })
  db.data.securityAlerts = db.data.securityAlerts.slice(-1000)
  if (!SECURITY_ALERT_WEBHOOK) return
  try {
    await fetch(SECURITY_ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Do not block main transaction on alert webhook failure.
  }
}

const createDefaultProgress = (userId, tenantId = DEFAULT_TENANT_ID) => ({
  userId,
  tenantId,
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

  const hasAdmin = (db.data.users || []).some((item) => item.role === 'admin')
  const user = {
    id: `u_${Date.now()}`,
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(String(password), 10),
    targetExamDate,
    tenantId: DEFAULT_TENANT_ID,
    plan: 'free',
    role: hasAdmin ? 'student' : 'admin',
    streakDays: 1,
    createdAt: dayjs().toISOString(),
  }
  db.data.users.push(user)
  db.data.progresses[user.id] = createDefaultProgress(user.id, user.tenantId)
  await db.write()

  await appendAuditLog({
    actorUserId: user.id,
    actorRole: 'self-register',
    tenantId: user.tenantId,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: user.id,
    ip: requestIp(req),
  })

  const token = signToken(user.id, user.tenantId)
  return res.json({ token, user: sanitizeUser(user), progress: db.data.progresses[user.id] })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ message: '参数不完整' })
  const normalizedEmail = String(email).trim().toLowerCase()
  const ip = requestIp(req)
  const gate = canAttemptLogin({ ip, email: normalizedEmail })
  if (!gate.ok) {
    return res.status(429).json({ message: `登录尝试过于频繁，请 ${gate.retryAfterSeconds} 秒后重试` })
  }
  const user = db.data.users.find((item) => item.email === normalizedEmail)
  if (!user) {
    await markLoginFailure({ ip, email: normalizedEmail })
    return res.status(401).json({ message: '邮箱或密码不正确' })
  }
  const ok = await bcrypt.compare(String(password), user.passwordHash)
  if (!ok) {
    await markLoginFailure({ ip, email: normalizedEmail })
    return res.status(401).json({ message: '邮箱或密码不正确' })
  }
  await clearLoginFailures({ ip, email: normalizedEmail })

  if (!db.data.progresses[user.id]) {
    db.data.progresses[user.id] = createDefaultProgress(user.id, user.tenantId || DEFAULT_TENANT_ID)
    await db.write()
  }

  const token = signToken(user.id, user.tenantId || DEFAULT_TENANT_ID)
  await appendAuditLog({
    actorUserId: user.id,
    actorRole: user.role || 'student',
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: user.id,
    ip,
  })
  return res.json({ token, user: sanitizeUser(user), progress: db.data.progresses[user.id] })
})

app.get('/api/me', authRequired, (req, res) => {
  const user = db.data.users.find((item) => item.id === req.userId)
  if (!user) return res.status(404).json({ message: '用户不存在' })
  return res.json({ user: sanitizeUser(user) })
})

app.get('/api/progress', authRequired, (req, res) => {
  const progress = db.data.progresses[req.userId] ?? createDefaultProgress(req.userId, req.tenantId || DEFAULT_TENANT_ID)
  return res.json({ progress })
})

app.post('/api/progress/lesson', authRequired, async (req, res) => {
  const { lessonId, score, weakPoints, subject, runId } = req.body
  if (!lessonId || typeof score !== 'number') return res.status(400).json({ message: '参数不完整' })
  const base = db.data.progresses[req.userId] ?? createDefaultProgress(req.userId, req.tenantId || DEFAULT_TENANT_ID)
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
      promptVersion: run?.promptVersion || null,
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

/** 学习页课程目录：按已审核知识条目（教材/政策/知识库）生成 subject → chapter → entries */
app.get('/api/course/outline', authRequired, (req, res) => {
  const entries = listKnowledgeEntries({ status: 'approved', includeInactive: false })
  const bySubject = {}
  for (const entry of entries) {
    const subject = String(entry.subject || '').trim()
    if (!subject || !VALID_SUBJECTS.includes(subject)) continue
    let source = 'knowledge'
    if (entry.id.startsWith('mat_')) source = 'material'
    else if (entry.policyMeta?.sourceUrl || (entry.topic || '').includes('政策')) source = 'policy'
    const chapter = String(entry.chapter || '未分类').trim()
    if (!bySubject[subject]) {
      bySubject[subject] = { chapters: {} }
    }
    if (!bySubject[subject].chapters[chapter]) {
      bySubject[subject].chapters[chapter] = []
    }
    bySubject[subject].chapters[chapter].push({
      id: entry.id,
      topic: entry.topic || '',
      concept: (entry.concept || '').slice(0, 500),
      chapter,
      subject,
      syllabusCode: entry.syllabusCode || '',
      keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
      source,
    })
  }
  const subjectOrder = [...VALID_SUBJECTS]
  const units = subjectOrder
    .filter((s) => bySubject[s] && Object.keys(bySubject[s].chapters).length > 0)
    .map((subject) => {
      const chapters = Object.entries(bySubject[subject].chapters)
        .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
        .map(([chapterId, list]) => ({
          chapterId,
          chapterTitle: chapterId,
          entries: list.sort((x, y) => (x.syllabusCode || x.id).localeCompare(y.syllabusCode || y.id, 'zh-CN')),
        }))
      return {
        subject,
        subjectName: SUBJECT_NAMES[subject] || subject,
        chapters,
      }
    })
  return res.json({ units, fromKnowledge: true })
})

app.post('/api/llm/generate-cpa-lesson', authRequired, async (req, res) => {
  const { subject, lessonId, chapterId, knowledgePointId, lessonTitle, objective, examPoints, weakPoints } = req.body
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
    chapterId: chapterId ? String(chapterId) : undefined,
    knowledgePointId: knowledgePointId ? String(knowledgePointId) : undefined,
    lessonTitle: String(lessonTitle),
    objective: String(objective),
    examPoints: safeExamPoints,
    weakPoints: safeWeakPoints,
    userId: req.userId,
    tenantId: req.tenantId,
  })

  return res.json({
    ...generated,
  })
})

app.get('/api/automation/stats', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  const runs = db.data.generationRuns || []
  const feedback = db.data.modelFeedback || []
  const total = runs.length
  const autoApproved = runs.filter((item) => item.autoApproved).length
  const latest = runs.slice(-20)

  const byModel = {}
  const byPrompt = {}
  for (const run of runs) {
    const key = run.modelVersion || 'unknown'
    if (!byModel[key]) {
      byModel[key] = { runs: 0, autoApprovedRuns: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byModel[key].runs += 1
    if (run.autoApproved) byModel[key].autoApprovedRuns += 1
    byModel[key].avgQualityScore += Number(run.qualityScore || 0)

    const promptKey = run.promptVersion || 'prompt-v1'
    if (!byPrompt[promptKey]) {
      byPrompt[promptKey] = { runs: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byPrompt[promptKey].runs += 1
    byPrompt[promptKey].avgQualityScore += Number(run.qualityScore || 0)
  }
  for (const fb of feedback) {
    if (!fb.modelVersion) continue
    if (!byModel[fb.modelVersion]) {
      byModel[fb.modelVersion] = { runs: 0, autoApprovedRuns: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byModel[fb.modelVersion].avgLearnerScore += Number(fb.score || 0)
    byModel[fb.modelVersion].feedbackCount += 1

    const run = fb.runId ? runs.find((item) => item.runId === fb.runId) : null
    const promptKey = run?.promptVersion || 'prompt-v1'
    if (!byPrompt[promptKey]) {
      byPrompt[promptKey] = { runs: 0, avgQualityScore: 0, avgLearnerScore: 0, feedbackCount: 0 }
    }
    byPrompt[promptKey].avgLearnerScore += Number(fb.score || 0)
    byPrompt[promptKey].feedbackCount += 1
  }
  for (const key of Object.keys(byModel)) {
    const row = byModel[key]
    row.autoApproveRate = row.runs ? Number(((row.autoApprovedRuns / row.runs) * 100).toFixed(2)) : 0
    row.avgQualityScore = row.runs ? Number((row.avgQualityScore / row.runs).toFixed(2)) : 0
    row.avgLearnerScore = row.feedbackCount ? Number((row.avgLearnerScore / row.feedbackCount).toFixed(2)) : 0
  }
  for (const key of Object.keys(byPrompt)) {
    const row = byPrompt[key]
    row.avgQualityScore = row.runs ? Number((row.avgQualityScore / row.runs).toFixed(2)) : 0
    row.avgLearnerScore = row.feedbackCount ? Number((row.avgLearnerScore / row.feedbackCount).toFixed(2)) : 0
  }

  return res.json({
    totalRuns: total,
    autoApprovedRuns: autoApproved,
    autoApproveRate: total ? Number(((autoApproved / total) * 100).toFixed(2)) : 0,
    latestRuns: latest,
    byModel,
    byPrompt,
  })
})

app.get('/api/automation/settings', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  return res.json({ settings: db.data.automationSettings || {} })
})

app.post('/api/automation/settings', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const base = db.data.automationSettings || {}
  const next = {
    ...base,
    ...(typeof req.body === 'object' ? req.body : {}),
  }
  db.data.automationSettings = next
  await db.write()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'automation.settings.update',
    resourceType: 'automationSettings',
    resourceId: 'main',
    detail: { keys: Object.keys(req.body || {}) },
    ip: requestIp(req),
  })
  return res.json({ settings: next })
})

app.post('/api/automation/prompts/replay-eval', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const promptVersion = String(req.body?.promptVersion || '')
  const limit = Number(req.body?.limit || 20)
  const result = await replayPromptEvaluation({ promptVersion, limit })
  return res.json(result)
})

app.post('/api/automation/prompts/auto-promote', authRequired, requireRoles('teacher', 'admin'), async (_req, res) => {
  const result = await runPromptAutoPromote()
  if (!result.ok) return res.status(400).json({ message: result.message, ...result })
  return res.json(result)
})

app.get('/api/knowledge/stats', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  return res.json(getKnowledgeStats())
})

app.get('/api/knowledge/coverage', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  return res.json(getKnowledgeCoverage())
})

app.get('/api/knowledge/conflicts', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const limit = Math.max(1, Math.min(300, Number(req.query.limit || 100)))
  const entries = listKnowledgeConflicts(limit)
  return res.json({ total: entries.length, entries })
})

app.get('/api/knowledge/revision-drafts', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const status = String(req.query.status || '').trim()
  const limit = Math.max(1, Math.min(300, Number(req.query.limit || 100)))
  const rows = (db.data.knowledgeRevisionDrafts || [])
    .filter((item) => (!status ? true : item.status === status))
    .slice(-limit)
    .reverse()
  return res.json({ total: rows.length, drafts: rows })
})

app.post('/api/knowledge/revision-drafts/:id/apply', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id || '')
  const idx = (db.data.knowledgeRevisionDrafts || []).findIndex((item) => item.id === id)
  if (idx < 0) return res.status(404).json({ message: '修订草案不存在' })
  const draft = db.data.knowledgeRevisionDrafts[idx]
  if (draft.status !== 'pending') return res.status(400).json({ message: '草案状态不可应用' })
  const result = applyKnowledgeFix({
    id: String(draft.targetEntryId),
    actor: `revision-draft:${req.userId}`,
    patch: draft.proposedPatch && typeof draft.proposedPatch === 'object' ? draft.proposedPatch : undefined,
  })
  if (!result.ok) return res.status(400).json({ message: result.message || '应用草案失败' })
  db.data.knowledgeRevisionDrafts[idx] = {
    ...draft,
    status: 'applied',
    appliedAt: dayjs().toISOString(),
    appliedBy: req.userId,
  }
  await db.write()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.revision_draft.apply',
    resourceType: 'knowledgeRevisionDraft',
    resourceId: id,
    detail: { targetEntryId: draft.targetEntryId },
    ip: requestIp(req),
  })
  return res.json({ ok: true, draft: db.data.knowledgeRevisionDrafts[idx], entry: result.entry })
})

app.post('/api/knowledge/revision-drafts/:id/reject', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id || '')
  const idx = (db.data.knowledgeRevisionDrafts || []).findIndex((item) => item.id === id)
  if (idx < 0) return res.status(404).json({ message: '修订草案不存在' })
  const draft = db.data.knowledgeRevisionDrafts[idx]
  if (draft.status !== 'pending') return res.status(400).json({ message: '草案状态不可驳回' })
  db.data.knowledgeRevisionDrafts[idx] = {
    ...draft,
    status: 'rejected',
    rejectedAt: dayjs().toISOString(),
    rejectedBy: req.userId,
  }
  await db.write()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.revision_draft.reject',
    resourceType: 'knowledgeRevisionDraft',
    resourceId: id,
    ip: requestIp(req),
  })
  return res.json({ ok: true, draft: db.data.knowledgeRevisionDrafts[idx] })
})

app.get('/api/knowledge', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
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
  if (entry.status !== 'approved' && req.userRole !== 'teacher' && req.userRole !== 'admin') {
    return res.status(403).json({ message: '仅可访问已审核条目' })
  }
  return res.json({ entry })
})

app.delete('/api/knowledge/:id', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id).trim()
  if (!id) return res.status(400).json({ message: '缺少条目 id' })
  const entry = getKnowledgeEntryById(id)
  if (!entry) return res.status(404).json({ message: '知识条目不存在' })
  const result = deleteKnowledgeEntriesById({ ids: [id], actor: req.userId })
  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.delete',
    resourceType: 'knowledgeEntry',
    resourceId: id,
    detail: { topic: entry.topic || '', subject: entry.subject || '' },
    ip: requestIp(req),
  })
  return res.json(result)
})

app.post('/api/knowledge/import', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const { entries, actor } = req.body
  const result = upsertKnowledgeEntries({
    entries,
    actor: actor ? String(actor) : req.userId,
  })
  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.import',
    resourceType: 'knowledgeEntry',
    resourceId: '',
    detail: { acceptedCount: result.acceptedCount, rejectedCount: result.rejectedCount },
    ip: requestIp(req),
  })
  return res.json(result)
})

app.post('/api/knowledge/review', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const { id, status, actor } = req.body
  if (!id || !status) return res.status(400).json({ message: '参数不完整' })
  const result = updateKnowledgeReview({
    id: String(id),
    status: String(status),
    actor: actor ? String(actor) : req.userId,
  })
  if (!result.ok) return res.status(400).json({ message: result.message, quality: result.quality })
  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.review',
    resourceType: 'knowledgeEntry',
    resourceId: String(id),
    detail: { status: String(status) },
    ip: requestIp(req),
  })
  return res.json(result)
})

app.post('/api/knowledge/suggest-fix', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const { id } = req.body
  if (!id) return res.status(400).json({ message: '参数不完整' })
  const result = suggestKnowledgeFix({ id: String(id) })
  if (!result.ok) return res.status(404).json({ message: result.message })
  return res.json(result)
})

app.post('/api/knowledge/apply-fix', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
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

app.get('/api/materials', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const { subject, status } = req.query
  const materials = (db.data.materials || []).filter((item) => {
    if (String(item.tenantId || DEFAULT_TENANT_ID) !== String(req.tenantId || DEFAULT_TENANT_ID)) return false
    if (subject && item.subject !== String(subject)) return false
    if (status && item.status !== String(status)) return false
    return true
  })
  return res.json({ total: materials.length, materials })
})

app.get('/api/materials/stats', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  const bySubject = {}
  const byStatus = {}
  const scoped = (db.data.materials || []).filter(
    (item) => String(item.tenantId || DEFAULT_TENANT_ID) === String(_req.tenantId || DEFAULT_TENANT_ID),
  )
  for (const row of scoped) {
    bySubject[row.subject] = (bySubject[row.subject] || 0) + 1
    byStatus[row.status] = (byStatus[row.status] || 0) + 1
  }
  return res.json({ total: scoped.length, bySubject, byStatus })
})

app.post('/api/materials/upload/initiate', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  if (!isSupabaseStorageEnabled()) {
    return res.status(400).json({ message: '直传未启用：请在服务端配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  }

  const { subject, chapter, year, sourceType, originalName, mimetype, size } = req.body || {}
  if (!subject || !VALID_SUBJECTS.includes(String(subject))) return res.status(400).json({ message: '科目非法' })
  if (!originalName) return res.status(400).json({ message: '缺少文件名 originalName' })

  const safeOriginal = String(originalName).replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'material.pdf'
  const pdfName = safeOriginal.toLowerCase().endsWith('.pdf') ? safeOriginal : `${safeOriginal}.pdf`
  const contentType = String(mimetype || 'application/pdf')
  if (!contentType.toLowerCase().includes('pdf') && !pdfName.toLowerCase().endsWith('.pdf')) {
    return res.status(400).json({ message: '仅支持PDF文件' })
  }

  const materialId = `m_${Date.now()}`
  const tenantId = String(req.tenantId || DEFAULT_TENANT_ID)
  const bucket = getStorageBucket()
  const objectPath = `${tenantId}/${String(subject)}/${String(year || dayjs().year())}/${materialId}/${pdfName}`
  const upload = await createSignedUploadForObject({ bucket, objectPath })

  const material = {
    id: materialId,
    filename: pdfName,
    originalName: String(originalName),
    subject: String(subject),
    chapter: String(chapter || '').trim(),
    year: String(year || dayjs().year()),
    sourceType: ['textbook', 'syllabus', 'exam', 'notes'].includes(String(sourceType)) ? String(sourceType) : 'textbook',
    size: Number(size || 0),
    mimetype: contentType,
    status: 'uploading',
    chunkCount: 0,
    ocrUsed: false,
    uploadedAt: dayjs().toISOString(),
    tenantId,
    storage: {
      provider: 'supabase',
      bucket,
      path: objectPath,
    },
  }

  db.data.materials.push(material)
  await db.write()
  return res.json({
    material,
    upload: {
      bucket: upload.bucket,
      path: upload.path,
      token: upload.token,
      signedUrl: upload.signedUrl,
    },
  })
})

app.post('/api/materials/:id/complete-upload', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id)
  const idx = (db.data.materials || []).findIndex(
    (item) => item.id === id && String(item.tenantId || DEFAULT_TENANT_ID) === String(req.tenantId || DEFAULT_TENANT_ID),
  )
  if (idx < 0) return res.status(404).json({ message: '资料不存在' })

  const cur = db.data.materials[idx]
  if (cur.status === 'ready') return res.json({ ok: true, material: cur, message: '已就绪' })
  if (cur.status !== 'uploading' && cur.status !== 'uploaded') {
    // Allow idempotent calls; otherwise guide the operator.
    return res.status(400).json({ message: `当前状态不可完成上传：${cur.status}` })
  }

  db.data.materials[idx].status = 'uploaded'
  await db.write()
  return res.json({ ok: true, material: db.data.materials[idx], message: '上传完成，等待处理' })
})

const processMaterialById = async ({ id, actorUserId, tenantId }) => {
  const idx = (db.data.materials || []).findIndex((item) => item.id === id && String(item.tenantId || '') === String(tenantId))
  if (idx < 0) return { ok: false, status: 404, message: '资料不存在' }

  const cur = db.data.materials[idx]
  if (cur.status === 'uploading') return { ok: false, status: 400, material: cur, message: '上传尚未完成，请稍后再处理入库' }
  if (cur.status === 'processing') return { ok: true, material: cur, message: '已在处理中' }

  db.data.materials[idx].status = 'processing'
  await db.write()

  try {
    const material = db.data.materials[idx]
    const parsed = await ingestPdfToChunks({
      material,
      uploadsDir: UPLOAD_DIR,
    })

    if (!parsed.pageCount || !parsed.chunks.length) {
      throw new Error('未能解析到有效文本。若为扫描版PDF，请配置 OCR_SPACE_API_KEY 后重试。')
    }

    const oldChunks = (db.data.materialChunks || []).filter((item) => item.materialId !== id)
    db.data.materialChunks = [...oldChunks, ...parsed.chunks]
    const vectorSync = await upsertMaterialChunksToVectorStore(parsed.chunks)

    const sample = parsed.chunks.slice(0, 3).map((item) => item.content).join(' ')
    const sourceEntry = {
      id: `mat_${material.id}_core`,
      subject: material.subject,
      chapter: material.chapter || material.originalName,
      syllabusCode: `${material.subject.toUpperCase()}-MAT-${material.id.slice(-6)}`,
      examYear: material.year,
      topic: `${material.chapter || material.originalName}-教材核心要点`,
      keywords: [material.chapter, material.originalName, material.subject].filter(Boolean),
      concept: sample.slice(0, 220) || `${material.originalName}教材核心知识点`,
      rules: ['先基于教材原文识别概念定义，再判断适用边界。', '做题时以教材术语口径为准，避免口语化替代。'],
      pitfalls: ['只记结论不看教材定义', '忽视章节中的适用前提'],
      miniCase: `依据资料《${material.originalName}》提炼题干场景并进行规范作答。`,
      status: 'review',
    }
    upsertKnowledgeEntries({ entries: [sourceEntry], actor: `material-ingest:${actorUserId}` })

    db.data.materials[idx].status = 'ready'
    db.data.materials[idx].chunkCount = parsed.chunks.length
    db.data.materials[idx].ocrUsed = Boolean(parsed.ocrUsed)
    db.data.materials[idx].processedAt = dayjs().toISOString()
    db.data.materials[idx].errorMessage = ''
    await db.write()
    return {
      ok: true,
      material: db.data.materials[idx],
      vectorSync,
      message: `处理完成，已提取 ${parsed.pageCount} 页，${parsed.chunks.length} 个切片并进入知识库流程${parsed.ocrUsed ? '（已启用OCR）' : ''}`,
    }
  } catch (error) {
    db.data.materials[idx].status = 'failed'
    db.data.materials[idx].errorMessage = error instanceof Error ? error.message : '处理失败'
    await db.write()
    return { ok: false, status: 500, material: db.data.materials[idx], message: '处理失败' }
  }
}

app.post('/api/materials/upload', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  return upload.single('file')(req, res, async (err) => {
    if (err) {
      // Multer errors are runtime errors; respond with JSON for frontend.
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'PDF过大，超过 50MB 限制，请压缩后重试' })
        }
        return res.status(400).json({ message: `上传失败：${err.code}` })
      }
      return res.status(500).json({ message: err instanceof Error ? err.message : '上传失败' })
    }

    const file = req.file
    const { subject, chapter, year, sourceType } = req.body
    if (!file) return res.status(400).json({ message: '请上传文件' })
    if (!subject || !VALID_SUBJECTS.includes(String(subject))) return res.status(400).json({ message: '科目非法' })
    if (!(file.mimetype || '').toLowerCase().includes('pdf') && !file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ message: '仅支持PDF文件' })
    }

    const material = {
      id: `m_${Date.now()}`,
      filename: file.filename,
      originalName: file.originalname,
      subject: String(subject),
      chapter: String(chapter || '').trim(),
      year: String(year || dayjs().year()),
      sourceType: ['textbook', 'syllabus', 'exam', 'notes'].includes(String(sourceType)) ? String(sourceType) : 'textbook',
      size: file.size,
      mimetype: file.mimetype,
      status: 'uploaded',
      chunkCount: 0,
      ocrUsed: false,
      uploadedAt: dayjs().toISOString(),
      tenantId: String(req.tenantId || DEFAULT_TENANT_ID),
    }

    db.data.materials.push(material)
    await db.write()
    return res.json({ message: '上传成功，等待处理', material })
  })
})

// 必须放在 /api/materials/:id/* 之前，否则 "process-all-async" 会被当作 :id 匹配
app.post('/api/materials/process-all-async', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const tenantId = String(req.tenantId || DEFAULT_TENANT_ID)
  const candidates = (db.data.materials || []).filter(
    (m) =>
      String(m.tenantId || DEFAULT_TENANT_ID) === tenantId &&
      (m.status === 'uploaded' || m.status === 'failed') &&
      m.id,
  )

  void (async () => {
    for (const mat of candidates) {
      await processMaterialById({ id: String(mat.id), actorUserId: req.userId, tenantId })
    }
  })()

  return res.json({ ok: true, acceptedCount: candidates.length, message: `已提交批量入库任务：${candidates.length} 个资料` })
})

app.post('/api/materials/:id/process', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id)
  const tenantId = String(req.tenantId || DEFAULT_TENANT_ID)
  const result = await processMaterialById({ id, actorUserId: req.userId, tenantId })
  if (!result.ok) return res.status(result.status || 500).json({ message: result.message, material: result.material })
  return res.json({ message: result.message, vectorSync: result.vectorSync, material: result.material })
})

app.post('/api/materials/:id/process-async', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id)
  const tenantId = String(req.tenantId || DEFAULT_TENANT_ID)
  void processMaterialById({ id, actorUserId: req.userId, tenantId })
  return res.json({ ok: true, message: '已提交异步处理任务，请稍后刷新查看状态', id })
})

app.delete('/api/materials/:id', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const id = String(req.params.id)
  const tenantId = String(req.tenantId || DEFAULT_TENANT_ID)
  const idx = (db.data.materials || []).findIndex((item) => item.id === id && String(item.tenantId || '') === tenantId)
  if (idx < 0) return res.status(404).json({ message: '资料不存在' })

  const material = db.data.materials[idx]
  const warnings = []

  // Remove metadata row first to keep UI consistent even if cleanup partially fails.
  db.data.materials.splice(idx, 1)
  db.data.materialChunks = (db.data.materialChunks || []).filter((row) => row.materialId !== id)
  await db.write()

  // Best-effort cleanup: vector store rows + stored file + derived KB entry.
  try {
    const del = await deleteMaterialChunksFromVectorStore({ materialId: id })
    if (del.enabled && del.error) warnings.push(`vector_store:${del.error}`)
  } catch (e) {
    warnings.push(`vector_store:${e instanceof Error ? e.message : 'failed'}`)
  }

  try {
    if (material?.storage?.provider === 'supabase' && material.storage.bucket && material.storage.path) {
      await removeObject({ bucket: material.storage.bucket, objectPath: material.storage.path })
    } else if (material?.filename) {
      const absolutePath = resolve(UPLOAD_DIR, material.filename)
      if (existsSync(absolutePath)) unlinkSync(absolutePath)
    }
  } catch (e) {
    warnings.push(`storage:${e instanceof Error ? e.message : 'failed'}`)
  }

  try {
    deleteKnowledgeEntriesById({ ids: [`mat_${id}_core`] })
  } catch (e) {
    warnings.push(`kb:${e instanceof Error ? e.message : 'failed'}`)
  }

  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'materials.delete',
    resourceType: 'material',
    resourceId: id,
    detail: { originalName: material.originalName || '', warnings },
    ip: requestIp(req),
  })

  return res.json({ ok: true, message: warnings.length ? `已删除（有${warnings.length}条清理告警）` : '已删除', warnings })
})

app.post('/api/admin/purge-ai-knowledge', authRequired, requireRoles('admin'), async (req, res) => {
  const confirm = String(req.body?.confirm || '')
  if (confirm !== 'PURGE_AI_KNOWLEDGE') return res.status(400).json({ message: '危险操作：confirm=PURGE_AI_KNOWLEDGE 才会执行' })
  const result = purgeAiGeneratedKnowledge({ actor: req.userId })
  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'knowledge.purge_ai_generated',
    resourceType: 'knowledgeEntry',
    resourceId: '',
    detail: { deletedCount: result.deletedCount },
    ip: requestIp(req),
  })
  return res.json(result)
})

app.post('/api/admin/clear-generation-runs', authRequired, requireRoles('admin'), async (req, res) => {
  const confirm = String(req.body?.confirm || '')
  if (confirm !== 'CLEAR_GENERATION_RUNS') return res.status(400).json({ message: '危险操作：confirm=CLEAR_GENERATION_RUNS 才会执行' })
  const beforeRuns = (db.data.generationRuns || []).length
  const beforeFeedback = (db.data.modelFeedback || []).length
  db.data.generationRuns = []
  db.data.modelFeedback = []
  await db.write()
  void appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'automation.clear_runs',
    resourceType: 'generationRun',
    resourceId: '',
    detail: { beforeRuns, beforeFeedback },
    ip: requestIp(req),
  })
  return res.json({ ok: true, beforeRuns, beforeFeedback })
})

app.get('/api/policy-scout/stats', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  return res.json(getPolicyScoutStats())
})

app.get('/api/policy-scout/runs', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
  return res.json({ runs: listPolicyScoutRuns(limit) })
})

app.get('/api/policy-scout/items', authRequired, requireRoles('teacher', 'admin'), (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)))
  const subject = req.query.subject ? String(req.query.subject).trim() : undefined
  const items = listPolicyScoutItems({ limit, subject })
  return res.json({ total: items.length, items })
})

app.get('/api/policy-scout/settings', authRequired, requireRoles('teacher', 'admin'), (_req, res) => {
  return res.json({ settings: getPolicyScoutSettings() })
})

app.post('/api/policy-scout/settings', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const settings = await updatePolicyScoutSettings(req.body || {})
  startPolicyScoutScheduler()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'policy_scout.settings.update',
    resourceType: 'policyScoutSettings',
    resourceId: 'main',
    detail: { keys: Object.keys(req.body || {}) },
    ip: requestIp(req),
  })
  return res.json({ settings })
})

app.post('/api/policy-scout/run', authRequired, requireRoles('teacher', 'admin'), async (req, res) => {
  const run = await runPolicyScoutOnce({
    actor: req.userId,
    reason: 'manual-api',
  })
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'policy_scout.run.manual',
    resourceType: 'policyScoutRun',
    resourceId: run.runId || '',
    detail: { skipped: Boolean(run.skipped), fetchedCount: Number(run.fetchedCount || 0) },
    ip: requestIp(req),
  })
  return res.json({ run })
})

app.get('/api/users', authRequired, requireRoles('admin'), (_req, res) => {
  const users = (db.data.users || [])
    .filter((item) => String(item.tenantId || DEFAULT_TENANT_ID) === String(_req.tenantId || DEFAULT_TENANT_ID))
    .map((item) => sanitizeUser(item))
  return res.json({ total: users.length, users })
})

app.get('/api/rbac/policy', authRequired, requireRoles('admin'), (_req, res) => {
  return res.json({ policy: db.data.rbacPolicy || {} })
})

app.post('/api/rbac/policy', authRequired, requireRoles('admin'), async (req, res) => {
  const next = {
    ...(db.data.rbacPolicy || {}),
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
  }
  db.data.rbacPolicy = next
  await db.write()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'rbac.policy.update',
    resourceType: 'rbacPolicy',
    resourceId: 'main',
    detail: { keys: Object.keys(req.body || {}) },
    ip: requestIp(req),
  })
  return res.json({ policy: next })
})

app.post('/api/users/:id/role', authRequired, requireRoles('admin'), async (req, res) => {
  const userId = String(req.params.id || '')
  const nextRole = String(req.body?.role || '')
  if (!VALID_ROLES.includes(nextRole)) return res.status(400).json({ message: '角色非法' })
  const idx = (db.data.users || []).findIndex((item) => item.id === userId && String(item.tenantId || DEFAULT_TENANT_ID) === String(req.tenantId || DEFAULT_TENANT_ID))
  if (idx < 0) return res.status(404).json({ message: '用户不存在' })

  const prevRole = db.data.users[idx].role
  db.data.users[idx].role = nextRole
  await db.write()
  await appendAuditLog({
    actorUserId: req.userId,
    actorRole: req.userRole,
    tenantId: req.tenantId,
    action: 'user.role.update',
    resourceType: 'user',
    resourceId: userId,
    detail: { prevRole, nextRole },
    ip: requestIp(req),
  })
  if (nextRole === 'admin' && prevRole !== 'admin') {
    await emitSecurityAlert({
      type: 'privilege_escalation',
      severity: 'high',
      message: `User ${userId} role escalated to admin`,
      actorUserId: req.userId,
      targetUserId: userId,
      tenantId: req.tenantId,
    })
  }
  return res.json({ user: sanitizeUser(db.data.users[idx]) })
})

app.get('/api/audit/logs', authRequired, requireRoles('admin'), (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)))
  const action = req.query.action ? String(req.query.action) : undefined
  const logs = listAuditLogs({
    tenantId: req.tenantId,
    limit,
    action,
  })
  return res.json({ total: logs.length, logs })
})

app.get('/api/security/alerts', authRequired, requireRoles('admin'), (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)))
  const alerts = (db.data.securityAlerts || []).slice(-limit).reverse()
  return res.json({ total: alerts.length, alerts })
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

startPolicyScoutScheduler()
