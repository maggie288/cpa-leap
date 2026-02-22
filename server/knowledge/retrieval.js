import { listKnowledgeEntries } from './repository.js'
import { resolveChapterSignals } from './chapterSignals.js'

const clean = (text) => String(text || '').toLowerCase().trim()

const splitTerms = (items) =>
  Array.from(
    new Set(
      items
        .flatMap((item) => clean(item).split(/[，。、；;,.!！?？\s]+/g))
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  )

const scoreDoc = (doc, terms, weakTerms, chapterId, knowledgePointId, chapterSignals) => {
  const policyFields = doc.policyMeta
    ? [doc.policyMeta.publisher, doc.policyMeta.applicableScope, doc.policyMeta.region, doc.policyMeta.effectiveAt]
    : []
  const haystack = clean([doc.topic, ...(doc.keywords || []), doc.concept, ...(doc.rules || []), ...(doc.pitfalls || []), ...policyFields].join(' '))
  const chapterText = clean([doc.chapter, doc.syllabusCode].join(' '))
  const pointText = clean([doc.id, doc.topic, doc.syllabusCode].join(' '))
  let score = 0
  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }
  for (const term of weakTerms) {
    if (haystack.includes(term)) score += 3
  }
  if (chapterId && chapterText.includes(clean(chapterId))) score += 6
  if (knowledgePointId && pointText.includes(clean(knowledgePointId))) score += 8
  for (const prefix of chapterSignals.syllabusPrefixes || []) {
    if (String(doc.syllabusCode || '').toUpperCase().startsWith(String(prefix).toUpperCase())) score += 12
  }
  for (const keyword of chapterSignals.chapterKeywords || []) {
    if (chapterText.includes(clean(keyword)) || haystack.includes(clean(keyword))) score += 4
  }
  if (String(doc.topic || '').includes('AI生成知识条目')) score -= 6
  if (doc.policyMeta?.sourceUrl) score += 4
  if (Number(doc.sourceTier || 2) === 1) score += 3
  return score
}

export const retrieveKnowledge = ({ subject, chapterId, knowledgePointId, lessonTitle, objective, examPoints, weakPoints, topK = 4 }) => {
  const terms = splitTerms([lessonTitle, objective, ...(examPoints || [])])
  const weakTerms = splitTerms(weakPoints || [])
  const chapterSignals = resolveChapterSignals({ subject, chapterId })

  const scoped = listKnowledgeEntries({ subject, status: 'approved', minQualityScore: 85, includeInactive: false })
  const ranked = scoped
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, weakTerms, chapterId, knowledgePointId, chapterSignals) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked.filter((item) => item.score > 0).slice(0, topK).map((item) => item.doc)
  if (best.length) return best
  return scoped.slice(0, Math.min(topK, scoped.length))
}
