import { db } from '../db.js'
import { queryMaterialChunksByVector } from './vectorStore.js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

const tokenize = (input) =>
  String(input || '')
    .toLowerCase()
    .split(/[，。、；;,.!！?？\s]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)

const normalizeVector = (vector) => {
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1
  return vector.map((item) => Number((item / norm).toFixed(8)))
}

const pseudoEmbedding = (text) => {
  const vector = Array.from({ length: EMBEDDING_DIM }, () => 0)
  const terms = tokenize(text)
  for (const term of terms) {
    let hash = 0
    for (let i = 0; i < term.length; i += 1) hash = (hash * 31 + term.charCodeAt(i)) >>> 0
    vector[hash % EMBEDDING_DIM] += 1
  }
  return normalizeVector(vector)
}

const fetchEmbedding = async (text) => {
  if (!OPENAI_API_KEY) return pseudoEmbedding(text)
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: text,
        model: OPENAI_EMBED_MODEL,
      }),
    })
    if (!response.ok) return pseudoEmbedding(text)
    const json = await response.json()
    const vector = json?.data?.[0]?.embedding
    if (!Array.isArray(vector)) return pseudoEmbedding(text)
    return vector
  } catch {
    return pseudoEmbedding(text)
  }
}

const scoreChunk = (chunk, terms) => {
  const haystack = String(chunk.content || '').toLowerCase()
  let score = 0
  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }
  if (chunk.sourceType === 'textbook') score += 1
  return score
}

export const retrieveMaterialSnippets = async ({ subject, lessonTitle, objective, examPoints, weakPoints, topK = 3 }) => {
  const terms = tokenize([lessonTitle, objective, ...(examPoints || []), ...(weakPoints || [])].join(' '))
  const queryText = [lessonTitle, objective, ...(examPoints || []), ...(weakPoints || [])].join(' ')
  const queryEmbedding = await fetchEmbedding(queryText)

  const vectorRows = await queryMaterialChunksByVector({
    queryEmbedding,
    subject,
    topK,
  })
  if (vectorRows && vectorRows.length > 0) {
    return vectorRows
  }

  const chunks = (db.data.materialChunks || []).filter((item) => item.subject === subject)
  if (!chunks.length) return []
  return chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.chunk)
}
