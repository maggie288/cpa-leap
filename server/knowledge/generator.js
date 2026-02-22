import { validateAndRepairQuestions } from './quality.js'
import { retrieveKnowledge } from './retrieval.js'

const pick = (arr, fallback = '') => {
  const safe = Array.isArray(arr) ? arr.filter(Boolean) : []
  return safe.length ? safe[0] : fallback
}

const isAiAutoTopic = (topic) => String(topic || '').includes('AI生成知识条目')

const buildQuestionFromDoc = (doc, index) => {
  const correct = pick(doc.rules, doc.concept)
  const wrongA = pick(doc.pitfalls, '忽略关键条件判断')
  const wrongB = (doc.pitfalls || []).find((item) => item && item !== wrongA) || '仅按经验处理不看规则'
  const wrongC = '与知识点无关的处理方式'
  const stemPrefix = index % 2 === 0 ? '案例判断' : '条件辨析'
  const miniCase = String(doc.miniCase || '').trim()
  const stem = miniCase
    ? `【${doc.topic}｜${stemPrefix}】${miniCase} 下列处理最恰当的是：`
    : `【${doc.topic}｜${stemPrefix}】下列说法正确的是：`
  const sourceHint = doc.policyMeta?.sourceUrl ? `（依据：${doc.policyMeta.publisher || '官方来源'}）` : ''
  return {
    id: `kb-${doc.id}-${index + 1}`,
    stem,
    options: [wrongA, wrongB, correct, wrongC],
    answerIndex: 2,
    explanation: `依据知识库规则：${correct}${sourceHint}`,
    difficulty: Math.min(5, 2 + index),
  }
}

const dedupeQuestions = (questions) => {
  const seen = new Set()
  const out = []
  for (const q of questions) {
    const key = `${q.stem}|${q.options.join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
  }
  return out
}

const selectDocsForGeneration = (docs, topK = 4) => {
  const highTrust = docs.filter((doc) => doc.policyMeta?.sourceUrl || Number(doc.sourceTier || 2) <= 2)
  const nonAuto = highTrust.filter((doc) => !isAiAutoTopic(doc.topic))
  const fallbackNonAuto = docs.filter((doc) => !isAiAutoTopic(doc.topic))
  const pool = nonAuto.length ? nonAuto : fallbackNonAuto.length ? fallbackNonAuto : docs
  return pool.slice(0, topK)
}

export const generateFromKnowledge = ({ subject, chapterId, knowledgePointId, lessonTitle, objective, examPoints, weakPoints }) => {
  const retrievedDocs = retrieveKnowledge({
    subject,
    chapterId,
    knowledgePointId,
    lessonTitle,
    objective,
    examPoints,
    weakPoints,
    topK: 6,
  })
  const docs = selectDocsForGeneration(retrievedDocs, 4)

  const hasDocs = docs.length > 0

  const policyRefs = docs.filter((doc) => doc.policyMeta && doc.policyMeta.sourceUrl)

  const lessonScript = [
    `本节主题：${lessonTitle}`,
    ...(chapterId ? [`章节锚点：${chapterId}`] : []),
    ...(knowledgePointId ? [`知识点锚点：${knowledgePointId}`] : []),
    `学习目标：${objective}`,
    `核心考点：${(examPoints || []).join('、') || '基础概念与核心规则'}`,
    '学习顺序：先概念锚定 -> 再规则辨析 -> 最后做题迁移。',
    `优先突破薄弱点：${(weakPoints || []).slice(-2).join('、') || '暂无明显薄弱点，保持节奏。'}`,
    ...(hasDocs
      ? docs.map((doc, idx) => `${idx + 1}.【${doc.topic}】${doc.concept}`)
      : ['当前科目暂无通过质量门禁的知识条目，请先补充并审核知识库后再生成高质量内容。']),
    ...(policyRefs.length
      ? policyRefs
          .slice(0, 2)
          .map(
            (doc) =>
              `政策口径提示：${doc.policyMeta.publisher || '官方来源'}发布于${doc.policyMeta.publishedAt || '未知日期'}，生效${
                doc.policyMeta.effectiveAt || '时间请以原文为准'
              }，适用对象：${doc.policyMeta.applicableScope || '请以原文适用范围为准'}。`,
          )
      : []),
  ]

  const generatedQuestions = validateAndRepairQuestions(dedupeQuestions(docs.map(buildQuestionFromDoc)))

  const revisionTips = [
    ...docs.slice(0, 2).map((doc) => `复习${doc.topic}时，重点避免：${doc.pitfalls[0] || '概念混淆'}`),
    '使用“规则-条件-结论”三步法复述错题。',
    '在24小时内做一次5分钟复盘，强化记忆保持。',
  ]

  const sourceRefs = docs.map((doc) => ({
    id: doc.id,
    topic: doc.topic,
    sourceUrl: doc.policyMeta?.sourceUrl || '',
    publisher: doc.policyMeta?.publisher || '',
    effectiveAt: doc.policyMeta?.effectiveAt || '',
  }))

  const qualityWarnings = hasDocs ? [] : ['无可用知识条目（要求：status=approved 且 qualityScore>=85）']

  return { lessonScript, generatedQuestions, revisionTips, sourceRefs, qualityWarnings }
}
