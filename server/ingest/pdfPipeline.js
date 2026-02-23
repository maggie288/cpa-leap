import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dayjs from 'dayjs'
import { PDFParse } from 'pdf-parse'
import { canUseOcr, runPdfOcr } from './ocrProvider.js'
import { downloadObjectAsBuffer } from '../storage/materialStorage.js'

const EMBEDDING_DIM = 1536
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'

const normalizeVector = (vector) => {
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1
  return vector.map((item) => Number((item / norm).toFixed(8)))
}

const pseudoEmbedding = (text) => {
  const vector = Array.from({ length: EMBEDDING_DIM }, () => 0)
  const terms = String(text || '')
    .toLowerCase()
    .split(/[，。、；;,.!！?？\s]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)

  for (const term of terms) {
    let hash = 0
    for (let i = 0; i < term.length; i += 1) {
      hash = (hash * 31 + term.charCodeAt(i)) >>> 0
    }
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
    const vec = json?.data?.[0]?.embedding
    if (!Array.isArray(vec)) return pseudoEmbedding(text)
    return vec
  } catch {
    return pseudoEmbedding(text)
  }
}

const splitIntoChunks = (text, maxLen = 800, overlap = 120) => {
  const safe = String(text || '').replace(/\s+/g, ' ').trim()
  if (!safe) return []

  const chunks = []
  let cursor = 0
  while (cursor < safe.length) {
    const end = Math.min(cursor + maxLen, safe.length)
    const chunk = safe.slice(cursor, end).trim()
    if (chunk.length >= 40) chunks.push(chunk)
    if (end === safe.length) break
    cursor = Math.max(0, end - overlap)
  }
  return chunks
}

const textDensity = (pages) => {
  const safePages = Array.isArray(pages) ? pages : []
  if (!safePages.length) return 0
  const totalChars = safePages.reduce((sum, page) => sum + String(page || '').replace(/\s+/g, '').length, 0)
  return totalChars / safePages.length
}

export const ingestPdfToChunks = async ({ material, uploadsDir }) => {
  let absolutePath = resolve(uploadsDir, material.filename)
  let cleanupTempFile = null
  let fileBuffer = null

  // When using direct-to-storage uploads, the PDF isn't on local disk.
  if (material?.storage?.provider === 'supabase' && material.storage.bucket && material.storage.path) {
    const tmpName = `sup_${material.id}_${Date.now()}.pdf`
    absolutePath = resolve(uploadsDir, tmpName)
    fileBuffer = await downloadObjectAsBuffer({ bucket: material.storage.bucket, objectPath: material.storage.path })
    // Keep a temp file for OCR fallback which requires a path.
    writeFileSync(absolutePath, fileBuffer)
    cleanupTempFile = () => {
      try {
        unlinkSync(absolutePath)
      } catch {
        // ignore
      }
    }
  }

  if (!fileBuffer) {
    try {
      fileBuffer = readFileSync(absolutePath)
    } catch (error) {
      if (cleanupTempFile) cleanupTempFile()
      throw error
    }
  }
  let pages = []
  let ocrUsed = false
  try {
    const parser = new PDFParse({ data: fileBuffer })
    const textResult = await parser.getText()
    await parser.destroy()
    pages = (textResult.pages || []).map((page) => String(page.text || '').trim()).filter(Boolean)

    // Scanned PDFs often have almost no extractable text. In that case, run OCR fallback.
    if (pages.length === 0 || textDensity(pages) < 30) {
      if (canUseOcr()) {
        const ocr = await runPdfOcr({ absolutePath })
        if (ocr.pages.length > 0) {
          pages = ocr.pages
          ocrUsed = true
        }
      }
    }
  } finally {
    if (cleanupTempFile) cleanupTempFile()
  }

  const chunks = []
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const pageText = pages[pageIdx]
    const subChunks = splitIntoChunks(pageText)
    for (let chunkIdx = 0; chunkIdx < subChunks.length; chunkIdx += 1) {
      const content = subChunks[chunkIdx]
      const embedding = await fetchEmbedding(content)
      chunks.push({
        id: `${material.id}_p${pageIdx + 1}_c${chunkIdx + 1}`,
        materialId: material.id,
        subject: material.subject,
        chapter: material.chapter,
        sourceType: material.sourceType,
        page: pageIdx + 1,
        chunkIndex: chunkIdx + 1,
        content,
        embedding,
        createdAt: dayjs().toISOString(),
      })
    }
  }

  return {
    pageCount: pages.length,
    chunks,
    ocrUsed,
  }
}
