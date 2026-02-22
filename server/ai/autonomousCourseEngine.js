import dayjs from 'dayjs'
import { db } from '../db.js'
import { generateFromKnowledge } from '../knowledge/generator.js'
import {
  applyKnowledgeFix,
  getKnowledgeEntryById,
  suggestKnowledgeFix,
  updateKnowledgeReview,
  upsertKnowledgeEntries,
} from '../knowledge/repository.js'

const LLM_API_BASE = process.env.LLM_API_BASE || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''

const hashText = (text) => {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

const chooseModelVersion = ({ settings, userId, lessonTitle }) => {
  const fixed = settings.modelVersion || 'autopilot-v1'
  if (!settings.experimentEnabled) return fixed
  const candidates = Array.isArray(settings.modelCandidates) ? settings.modelCandidates.filter(Boolean) : []
  if (!candidates.length) return fixed

  const split = settings.trafficSplit && typeof settings.trafficSplit === 'object' ? settings.trafficSplit : {}
  const bucket = hashText(`${userId}|${lessonTitle}`) % 100
  let cursor = 0
  for (const model of candidates) {
    const weight = Number(split[model] || 0)
    if (weight > 0) {
      cursor += weight
      if (bucket < cursor) return model
    }
  }

  return candidates[hashText(`${lessonTitle}|${userId}`) % candidates.length]
}

const extractTopWeakPoints = (subject) => {
  const subjectLogs = (db.data.modelFeedback || []).filter((item) => item.subject === subject)
  const hit = {}
  for (const row of subjectLogs) {
    for (const weak of row.weakPoints || []) {
      hit[weak] = (hit[weak] || 0) + 1
    }
  }
  return Object.entries(hit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)
}

const fallbackDraftEntry = ({ subject, lessonTitle, objective, examPoints, weakPoints, runId }) => {
  const trendWeak = extractTopWeakPoints(subject)
  const focus = [...(weakPoints || []), ...trendWeak].slice(0, 3)
  const topic = `${lessonTitle}-AI生成知识条目`
  const pointA = examPoints[0] || lessonTitle
  const pointB = examPoints[1] || '边界条件'

  return {
    id: `${subject}-auto-${runId}`,
    subject,
    chapter: pointA,
    syllabusCode: `${subject.toUpperCase()}-AUTO-${runId.slice(-6)}`,
    examYear: String(dayjs().year()),
    topic,
    keywords: Array.from(new Set([lessonTitle, ...examPoints, ...focus])).slice(0, 6),
    concept: `${lessonTitle}是CPA核心考点，需先识别${pointA}与${pointB}的适用边界，再结合业务事实判断最终处理。`,
    rules: [
      `处理${lessonTitle}时，先验证前提条件，再应用规则结论。`,
      `出现多个看似正确选项时，以题干事实与考纲关键词优先匹配。`,
      focus.length ? `针对高频薄弱点（${focus.join('、')}）优先进行反例辨析。` : '通过对比题巩固概念边界，避免机械记忆。',
    ],
    pitfalls: [
      `忽略${pointA}的适用条件导致误判`,
      '把结论当模板直接套用，未核对题干事实',
      '审题只看关键词，未识别限制条件',
    ],
    miniCase: `案例：企业发生与${lessonTitle}相关业务，需识别交易实质、匹配考点规则，并给出会计/税务处理结论。`,
    status: 'review',
  }
}

const modelDraftEntry = async (payload) => {
  if (!LLM_API_BASE || !LLM_API_KEY) return fallbackDraftEntry(payload)
  try {
    const response = await fetch(`${LLM_API_BASE}/generate-cpa-knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) return fallbackDraftEntry(payload)
    const json = await response.json()
    if (!json || typeof json !== 'object') return fallbackDraftEntry(payload)
    return { ...fallbackDraftEntry(payload), ...json }
  } catch {
    return fallbackDraftEntry(payload)
  }
}

export const runAutonomousCoursePipeline = async ({ subject, lessonTitle, objective, examPoints, weakPoints, userId, lessonId }) => {
  const settings = db.data.automationSettings || {}
  if (settings.autopilotEnabled === false) {
    const generated = generateFromKnowledge({
      subject,
      lessonTitle,
      objective,
      examPoints,
      weakPoints,
    })
    return {
      ...generated,
      automationReport: {
        runId: `manual-${Date.now()}`,
        modelVersion: settings.modelVersion || 'autopilot-v1',
        actions: ['autopilot_disabled', 'fallback_generate_from_knowledge'],
        autoApproved: false,
        qualityScore: 0,
      },
    }
  }

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const actions = []
  const maxAutoFixRounds = Number(settings.maxAutoFixRounds || 2)
  const modelVersion = chooseModelVersion({ settings, userId, lessonTitle })
  actions.push(`model_assigned:${modelVersion}`)

  const draft = await modelDraftEntry({
    subject,
    lessonTitle,
    objective,
    examPoints,
    weakPoints,
    runId,
    modelVersion,
  })
  actions.push('ai_generate_draft')

  upsertKnowledgeEntries({ entries: [draft], actor: `ai-model:${modelVersion}` })
  actions.push('kb_upsert')

  let current = getKnowledgeEntryById(draft.id)
  for (let i = 0; i < maxAutoFixRounds; i += 1) {
    if (!current) break
    if (current.qualityScore >= Number(settings.minQualityScore || 85)) break
    const suggested = suggestKnowledgeFix({ id: current.id })
    if (!suggested.ok) break
    applyKnowledgeFix({ id: current.id, actor: `ai-autofix:${modelVersion}`, patch: suggested.suggested })
    actions.push(`auto_fix_round_${i + 1}`)
    current = getKnowledgeEntryById(current.id)
  }

  current = current ? getKnowledgeEntryById(current.id) : null
  let autoApproved = false
  if (current && current.qualityScore >= Number(settings.minQualityScore || 85)) {
    const review = updateKnowledgeReview({
      id: current.id,
      status: 'approved',
      actor: `ai-reviewer:${modelVersion}`,
    })
    autoApproved = Boolean(review.ok)
    if (autoApproved) actions.push('auto_approved')
  } else {
    actions.push('auto_review_failed')
  }

  const generated = generateFromKnowledge({
    subject,
    lessonTitle,
    objective,
    examPoints,
    weakPoints,
  })

  const runLog = {
    runId,
    at: dayjs().toISOString(),
    userId,
    subject,
    lessonId,
    lessonTitle,
    modelVersion,
    actions,
    autoApproved,
    qualityScore: current?.qualityScore || 0,
    knowledgeId: current?.id || null,
  }
  db.data.generationRuns.push(runLog)
  await db.write()

  return {
    ...generated,
    automationReport: {
      runId,
      modelVersion,
      actions,
      autoApproved,
      qualityScore: current?.qualityScore || 0,
    },
  }
}
