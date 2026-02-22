import dayjs from 'dayjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { evaluateKnowledgeQuality } from './scoring.js'

const KB_PATH = resolve(process.cwd(), 'server/knowledge/kb.json')
const SEED_PATH = resolve(process.cwd(), 'server/knowledge/kb.seed.json')

const ensureKbFile = () => {
  if (existsSync(KB_PATH)) return
  const dir = dirname(KB_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const seed = existsSync(SEED_PATH) ? readFileSync(SEED_PATH, 'utf-8') : '[]'
  writeFileSync(KB_PATH, seed, 'utf-8')
}

const readKb = () => {
  ensureKbFile()
  try {
    const raw = readFileSync(KB_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeKb = (entries) => {
  writeFileSync(KB_PATH, JSON.stringify(entries, null, 2), 'utf-8')
}

const parseTime = (value) => {
  if (!value) return null
  const ts = dayjs(String(value))
  return ts.isValid() ? ts.valueOf() : null
}

const normalizeSourceTier = (sourceTier, policyMeta) => {
  const explicit = Number(sourceTier || 0)
  if ([1, 2, 3].includes(explicit)) return explicit
  const publisher = String(policyMeta?.publisher || policyMeta?.sourceName || '').toLowerCase()
  if (!publisher) return 2
  if (publisher.includes('财政部') || publisher.includes('税务') || publisher.includes('ifrs') || publisher.includes('hmrc')) return 1
  return 2
}

const computeLifecycle = ({ effectiveAt, expiresAt }) => {
  const now = Date.now()
  const effectiveTs = parseTime(effectiveAt)
  const expireTs = parseTime(expiresAt)
  if (expireTs && expireTs <= now) return 'expired'
  if (effectiveTs && effectiveTs > now) return 'scheduled'
  return 'active'
}

const SUBJECT_CODE = {
  accounting: 'ACC',
  audit: 'AUD',
  finance: 'FIN',
  tax: 'TAX',
  law: 'LAW',
  strategy: 'STR',
}

const pickKeywords = (entry) => {
  if (Array.isArray(entry.keywords) && entry.keywords.filter(Boolean).length >= 4) return entry.keywords
  const seed = [entry.topic, entry.chapter, ...(entry.rules || [])]
    .join(' ')
    .split(/[，。、；;,.!！?？\s]+/g)
    .map((item) => String(item).trim())
    .filter((item) => item.length >= 2)
  return Array.from(new Set(seed)).slice(0, 6)
}

const buildAutoFixCandidate = (entry) => {
  const nowYear = String(dayjs().year())
  const topic = entry.topic || '未命名知识点'
  const chapter = entry.chapter || `${topic.slice(0, 8)}章节`
  const subjectCode = SUBJECT_CODE[entry.subject] || 'GEN'
  const syllabusCode = entry.syllabusCode || `${subjectCode}-AUTO-${Date.now().toString().slice(-6)}`
  const concept =
    entry.concept && String(entry.concept).trim().length >= 20
      ? entry.concept
      : `${topic}是CPA考试高频知识点，需结合业务场景判断适用条件、边界和会计/税法处理口径。`
  const rules = Array.isArray(entry.rules) ? entry.rules.filter(Boolean) : []
  const safeRules =
    rules.length >= 2
      ? rules
      : [
          ...rules,
          `处理${topic}时应先识别适用前提与业务事实，再匹配规则结论。`,
          `${topic}的判断需结合题干条件，避免仅凭单一关键词作答。`,
        ].slice(0, 3)
  const pitfalls = Array.isArray(entry.pitfalls) ? entry.pitfalls.filter(Boolean) : []
  const safePitfalls =
    pitfalls.length >= 2
      ? pitfalls
      : [...pitfalls, `忽略${topic}的适用条件`, `只记结论不分析题干事实`].slice(0, 3)

  const miniCase =
    entry.miniCase && String(entry.miniCase).trim().length >= 16
      ? entry.miniCase
      : `案例：企业发生与${topic}相关业务时，应先识别交易实质，再根据规则完成会计或税务处理。`

  return {
    id: entry.id,
    subject: entry.subject,
    topic,
    chapter,
    syllabusCode,
    examYear: entry.examYear || nowYear,
    concept,
    rules: safeRules,
    pitfalls: safePitfalls,
    keywords: pickKeywords({ ...entry, chapter, rules: safeRules }),
    miniCase,
    status: 'review',
    sourceTier: normalizeSourceTier(entry.sourceTier, entry.policyMeta),
    effectiveAt: entry.effectiveAt || '',
    expiresAt: entry.expiresAt || '',
    reviewedBy: entry.reviewedBy,
    reviewedAt: entry.reviewedAt,
    policyMeta: entry.policyMeta,
    conflictRefs: Array.isArray(entry.conflictRefs) ? entry.conflictRefs : [],
    createdAt: entry.createdAt,
  }
}

export const listKnowledgeEntries = ({ subject, status, q, minQualityScore, includeInactive = true } = {}) => {
  return readKb().filter((entry) => {
    if (subject && entry.subject !== subject) return false
    if (status && entry.status !== status) return false
    if (Number.isFinite(minQualityScore) && Number(entry.qualityScore || 0) < Number(minQualityScore)) return false
    if (!includeInactive) {
      const lifecycle = computeLifecycle({ effectiveAt: entry.effectiveAt || entry.policyMeta?.effectiveAt, expiresAt: entry.expiresAt })
      if (lifecycle !== 'active') return false
    }
    if (q) {
      const haystack = `${entry.topic} ${(entry.keywords || []).join(' ')} ${entry.concept}`.toLowerCase()
      if (!haystack.includes(String(q).toLowerCase())) return false
    }
    return true
  })
}

export const getKnowledgeEntryById = (id) => {
  const entry = readKb().find((item) => item.id === id)
  return entry || null
}

export const getKnowledgeStats = () => {
  const entries = readKb()
  const bySubject = {}
  const byStatus = {}
  const qualityBuckets = { low: 0, medium: 0, high: 0 }
  for (const entry of entries) {
    bySubject[entry.subject] = (bySubject[entry.subject] || 0) + 1
    byStatus[entry.status || 'draft'] = (byStatus[entry.status || 'draft'] || 0) + 1
    const score = Number(entry.qualityScore || 0)
    if (score >= 85) qualityBuckets.high += 1
    else if (score >= 70) qualityBuckets.medium += 1
    else qualityBuckets.low += 1
  }
  return { total: entries.length, bySubject, byStatus, qualityBuckets }
}

const SUBJECT_SYLLABUS_TARGET = {
  accounting: 24,
  audit: 20,
  finance: 18,
  tax: 14,
  law: 12,
  strategy: 8,
}

const syllabusChapterKey = (code) => {
  const tokens = String(code || '')
    .trim()
    .toUpperCase()
    .split('-')
    .filter(Boolean)
  if (tokens.length < 2) return ''
  return `${tokens[0]}-${tokens[1]}`
}

export const getKnowledgeCoverage = () => {
  const entries = readKb()
  const bySubject = {}

  for (const entry of entries) {
    const subject = String(entry.subject || '')
    if (!subject) continue
    if (!bySubject[subject]) {
      bySubject[subject] = {
        totalEntries: 0,
        approvedEntries: 0,
        uniqueChapters: 0,
        uniqueSyllabusChapters: 0,
        syllabusCoverageRate: 0,
      }
      bySubject[subject]._chapterSet = new Set()
      bySubject[subject]._syllabusSet = new Set()
    }

    bySubject[subject].totalEntries += 1
    if (entry.status === 'approved') bySubject[subject].approvedEntries += 1
    if (entry.chapter) bySubject[subject]._chapterSet.add(String(entry.chapter).trim())
    const codeKey = syllabusChapterKey(entry.syllabusCode)
    if (codeKey) bySubject[subject]._syllabusSet.add(codeKey)
  }

  for (const subject of Object.keys(bySubject)) {
    const row = bySubject[subject]
    row.uniqueChapters = row._chapterSet.size
    row.uniqueSyllabusChapters = row._syllabusSet.size
    const target = Number(SUBJECT_SYLLABUS_TARGET[subject] || 0)
    row.syllabusCoverageRate = target ? Number(((row.uniqueSyllabusChapters / target) * 100).toFixed(2)) : 0
    delete row._chapterSet
    delete row._syllabusSet
  }

  return {
    totalEntries: entries.length,
    bySubject,
    subjectSyllabusTarget: SUBJECT_SYLLABUS_TARGET,
  }
}

const normalizeEntry = (entry, actor) => {
  const now = dayjs().toISOString()
  const policyEffectiveAt =
    entry.policyMeta?.effectiveAt && dayjs(String(entry.policyMeta.effectiveAt)).isValid()
      ? dayjs(String(entry.policyMeta.effectiveAt)).toISOString()
      : ''
  const effectiveAt =
    entry.effectiveAt && dayjs(String(entry.effectiveAt)).isValid()
      ? dayjs(String(entry.effectiveAt)).toISOString()
      : policyEffectiveAt
  const expiresAt =
    entry.expiresAt && dayjs(String(entry.expiresAt)).isValid()
      ? dayjs(String(entry.expiresAt)).toISOString()
      : ''
  const sourceTier = normalizeSourceTier(entry.sourceTier, entry.policyMeta)
  const lifecycle = computeLifecycle({ effectiveAt, expiresAt })
  const quality = evaluateKnowledgeQuality({
    ...entry,
    effectiveAt,
    expiresAt,
    sourceTier,
  })

  const requestedStatus = ['draft', 'review', 'approved', 'deprecated'].includes(entry.status) ? entry.status : 'draft'
  const safeStatus = requestedStatus === 'approved' && (!quality.passForGeneration || lifecycle !== 'active') ? 'review' : requestedStatus

  return {
    id: String(entry.id || `kb-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    subject: String(entry.subject || '').trim(),
    chapter: String(entry.chapter || '').trim(),
    syllabusCode: String(entry.syllabusCode || '').trim(),
    examYear: String(entry.examYear || dayjs().year()),
    topic: String(entry.topic || '').trim(),
    keywords: Array.isArray(entry.keywords) ? entry.keywords.map((item) => String(item).trim()).filter(Boolean) : [],
    concept: String(entry.concept || '').trim(),
    rules: Array.isArray(entry.rules) ? entry.rules.map((item) => String(item).trim()).filter(Boolean) : [],
    pitfalls: Array.isArray(entry.pitfalls) ? entry.pitfalls.map((item) => String(item).trim()).filter(Boolean) : [],
    miniCase: String(entry.miniCase || '').trim(),
    status: safeStatus,
    version: Number.isInteger(entry.version) ? entry.version : 1,
    qualityScore: quality.score,
    qualityIssues: quality.issues,
    reviewedBy: entry.reviewedBy ? String(entry.reviewedBy) : actor,
    reviewedAt: entry.reviewedAt ? String(entry.reviewedAt) : now,
    sourceTier,
    effectiveAt,
    expiresAt,
    lifecycle,
    conflictRefs: Array.isArray(entry.conflictRefs) ? entry.conflictRefs : [],
    policyMeta:
      entry.policyMeta && typeof entry.policyMeta === 'object'
        ? {
            sourceName: String(entry.policyMeta.sourceName || '').trim(),
            publisher: String(entry.policyMeta.publisher || '').trim(),
            sourceUrl: String(entry.policyMeta.sourceUrl || '').trim(),
            publishedAt: String(entry.policyMeta.publishedAt || '').trim(),
            effectiveAt: String(entry.policyMeta.effectiveAt || '').trim(),
            applicableScope: String(entry.policyMeta.applicableScope || '').trim(),
            region: String(entry.policyMeta.region || '').trim(),
          }
        : undefined,
    createdAt: entry.createdAt ? String(entry.createdAt) : now,
    updatedAt: now,
  }
}

const normalizeTopicTokens = (text) =>
  new Set(
    String(text || '')
      .toLowerCase()
      .split(/[，。、；;,.!！?？:\s()（）\[\]【】]+/g)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2),
  )

const jaccard = (aSet, bSet) => {
  const a = Array.from(aSet || [])
  const b = Array.from(bSet || [])
  if (!a.length && !b.length) return 0
  const bLookup = new Set(b)
  const inter = a.filter((x) => bLookup.has(x)).length
  const union = new Set([...a, ...b]).size
  return union ? inter / union : 0
}

const detectConflicts = (entry, kbEntries) => {
  const candidates = kbEntries.filter((row) => row.id !== entry.id && row.subject === entry.subject)
  const topicA = normalizeTopicTokens(entry.topic)
  const refs = []
  for (const row of candidates) {
    const reasons = []
    if (entry.syllabusCode && row.syllabusCode && String(entry.syllabusCode) === String(row.syllabusCode)) {
      reasons.push('syllabusCode重复')
    }
    const sim = jaccard(topicA, normalizeTopicTokens(row.topic))
    if (sim >= 0.5) reasons.push(`topic相似度${Number((sim * 100).toFixed(1))}%`)
    if (reasons.length) {
      refs.push({
        withId: row.id,
        withTopic: row.topic,
        reasons,
      })
    }
  }
  return refs.slice(0, 5)
}

const uniqueTextList = (items, limit = 6) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)

const buildRevisionDraft = ({ sourceEntry, targetEntry, reasons }) => {
  const nextConcept = sourceEntry.concept && sourceEntry.concept !== targetEntry.concept ? sourceEntry.concept : targetEntry.concept
  const nextRules = uniqueTextList([...(targetEntry.rules || []), ...(sourceEntry.rules || [])], 6)
  const nextPitfalls = uniqueTextList([...(targetEntry.pitfalls || []), ...(sourceEntry.pitfalls || [])], 6)
  const nextKeywords = uniqueTextList([...(targetEntry.keywords || []), ...(sourceEntry.keywords || [])], 8)
  const proposedPatch = {
    concept: nextConcept,
    rules: nextRules,
    pitfalls: nextPitfalls,
    keywords: nextKeywords,
    sourceTier: Math.min(Number(targetEntry.sourceTier || 2), Number(sourceEntry.sourceTier || 2)),
    effectiveAt: sourceEntry.effectiveAt || targetEntry.effectiveAt || '',
    expiresAt: sourceEntry.expiresAt || targetEntry.expiresAt || '',
    policyMeta:
      sourceEntry.policyMeta && typeof sourceEntry.policyMeta === 'object'
        ? {
            ...(targetEntry.policyMeta || {}),
            ...sourceEntry.policyMeta,
          }
        : targetEntry.policyMeta,
  }
  const confidence =
    reasons.includes('syllabusCode重复')
      ? 0.95
      : Math.min(0.9, 0.5 + reasons.filter((item) => item.includes('topic相似度')).length * 0.2)
  return {
    id: `rev_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    sourceEntryId: sourceEntry.id,
    sourceTopic: sourceEntry.topic,
    targetEntryId: targetEntry.id,
    targetTopic: targetEntry.topic,
    subject: targetEntry.subject,
    reasons,
    confidence: Number(confidence.toFixed(2)),
    status: 'pending',
    proposedPatch,
    summary: `建议将「${sourceEntry.topic}」中的最新口径合并到「${targetEntry.topic}」`,
    createdAt: dayjs().toISOString(),
    appliedAt: '',
    rejectedAt: '',
  }
}

export const createRevisionDraftsFromEntryId = ({ entryId, limit = 3 }) => {
  const kb = readKb()
  const sourceEntry = kb.find((row) => row.id === entryId)
  if (!sourceEntry) return []
  const refs = Array.isArray(sourceEntry.conflictRefs) ? sourceEntry.conflictRefs.slice(0, Math.max(1, limit)) : []
  const drafts = []
  for (const ref of refs) {
    const targetEntry = kb.find((row) => row.id === ref.withId)
    if (!targetEntry) continue
    drafts.push(buildRevisionDraft({ sourceEntry, targetEntry, reasons: ref.reasons || [] }))
  }
  return drafts
}

export const listKnowledgeConflicts = (limit = 100) =>
  readKb()
    .filter((item) => Array.isArray(item.conflictRefs) && item.conflictRefs.length > 0)
    .slice(-Math.max(1, limit))
    .reverse()

export const upsertKnowledgeEntries = ({ entries, actor = 'system' }) => {
  const safeEntries = Array.isArray(entries) ? entries : []
  const base = readKb()
  const map = new Map(base.map((item) => [item.id, item]))

  const accepted = []
  const rejected = []
  const conflicts = []

  for (const candidate of safeEntries) {
    const normalized = normalizeEntry(candidate, actor)
    if (!normalized.subject || !normalized.topic || !normalized.concept || normalized.rules.length === 0) {
      rejected.push({ id: normalized.id, reason: '缺少必要字段(subject/topic/concept/rules)' })
      continue
    }
    const prev = map.get(normalized.id)
    const next = prev
      ? {
          ...prev,
          ...normalized,
          version: Number(prev.version || 1) + 1,
          createdAt: prev.createdAt || normalized.createdAt,
        }
      : normalized
    next.conflictRefs = detectConflicts(next, Array.from(map.values()))
    if (next.conflictRefs.length) {
      conflicts.push({ id: next.id, topic: next.topic, conflictCount: next.conflictRefs.length, refs: next.conflictRefs })
    }
    map.set(next.id, next)
    accepted.push(next.id)
  }

  const merged = Array.from(map.values())
  writeKb(merged)

  return {
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    acceptedIds: accepted,
    rejected,
    conflicts,
    total: merged.length,
  }
}

export const updateKnowledgeReview = ({ id, status, actor = 'reviewer' }) => {
  if (!['draft', 'review', 'approved', 'deprecated'].includes(status)) {
    return { ok: false, message: '状态非法' }
  }
  const base = readKb()
  const idx = base.findIndex((item) => item.id === id)
  if (idx < 0) return { ok: false, message: '知识条目不存在' }

  const item = base[idx]
  const quality = evaluateKnowledgeQuality(item)
  if (status === 'approved' && !quality.passForGeneration) {
    return {
      ok: false,
      message: `质量分${quality.score}未达到85，不能通过审核`,
      quality,
    }
  }

  const now = dayjs().toISOString()
  base[idx] = {
    ...item,
    status,
    qualityScore: quality.score,
    qualityIssues: quality.issues,
    reviewedBy: actor,
    reviewedAt: now,
    updatedAt: now,
    version: Number(item.version || 1) + 1,
  }
  writeKb(base)
  return { ok: true, entry: base[idx] }
}

export const suggestKnowledgeFix = ({ id }) => {
  const entry = getKnowledgeEntryById(id)
  if (!entry) return { ok: false, message: '知识条目不存在' }

  const before = evaluateKnowledgeQuality(entry)
  const candidate = buildAutoFixCandidate(entry)
  const after = evaluateKnowledgeQuality(candidate)

  const changes = []
  const compareFields = ['chapter', 'syllabusCode', 'examYear', 'concept', 'rules', 'pitfalls', 'keywords', 'miniCase']
  for (const key of compareFields) {
    const oldVal = JSON.stringify(entry[key] ?? '')
    const newVal = JSON.stringify(candidate[key] ?? '')
    if (oldVal !== newVal) changes.push(key)
  }

  return {
    ok: true,
    id,
    before,
    after,
    suggested: candidate,
    changedFields: changes,
  }
}

export const applyKnowledgeFix = ({ id, actor = 'fixer', patch }) => {
  const entry = getKnowledgeEntryById(id)
  if (!entry) return { ok: false, message: '知识条目不存在' }

  const baseCandidate = buildAutoFixCandidate(entry)
  const mergedCandidate = {
    ...baseCandidate,
    ...(patch && typeof patch === 'object' ? patch : {}),
    id: entry.id,
  }

  const result = upsertKnowledgeEntries({
    entries: [
      {
        ...mergedCandidate,
        status: 'review',
      },
    ],
    actor,
  })

  const latest = getKnowledgeEntryById(id)
  return {
    ok: true,
    importResult: result,
    entry: latest,
  }
}
