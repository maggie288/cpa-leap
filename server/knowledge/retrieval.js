import { listKnowledgeEntries } from './repository.js'

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

const scoreDoc = (doc, terms, weakTerms) => {
  const haystack = clean([doc.topic, ...(doc.keywords || []), doc.concept, ...(doc.rules || []), ...(doc.pitfalls || [])].join(' '))
  let score = 0
  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }
  for (const term of weakTerms) {
    if (haystack.includes(term)) score += 3
  }
  return score
}

export const retrieveKnowledge = ({ subject, lessonTitle, objective, examPoints, weakPoints, topK = 4 }) => {
  const terms = splitTerms([lessonTitle, objective, ...(examPoints || [])])
  const weakTerms = splitTerms(weakPoints || [])

  const scoped = listKnowledgeEntries({ subject, status: 'approved', minQualityScore: 85 })
  const ranked = scoped
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, weakTerms) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked.filter((item) => item.score > 0).slice(0, topK).map((item) => item.doc)
  if (best.length) return best
  return scoped.slice(0, Math.min(topK, scoped.length))
}
