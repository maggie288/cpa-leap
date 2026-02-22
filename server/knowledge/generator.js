import { validateAndRepairQuestions } from './quality.js'
import { retrieveKnowledge } from './retrieval.js'

const buildQuestionFromDoc = (doc, index) => {
  const correct = doc.rules[0] || doc.concept
  const wrongA = doc.pitfalls[0] || '忽略关键条件判断'
  const wrongB = doc.pitfalls[1] || '仅按经验处理不看规则'
  const wrongC = '与知识点无关的处理方式'

  return {
    id: `kb-${doc.id}-${index + 1}`,
    stem: `【${doc.topic}】下列说法正确的是：`,
    options: [wrongA, wrongB, correct, wrongC],
    answerIndex: 2,
    explanation: `依据知识库规则：${correct}`,
    difficulty: Math.min(5, 2 + index),
  }
}

export const generateFromKnowledge = ({ subject, chapterId, knowledgePointId, lessonTitle, objective, examPoints, weakPoints }) => {
  const docs = retrieveKnowledge({
    subject,
    chapterId,
    knowledgePointId,
    lessonTitle,
    objective,
    examPoints,
    weakPoints,
    topK: 4,
  })

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

  const generatedQuestions = validateAndRepairQuestions(docs.map(buildQuestionFromDoc))

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
