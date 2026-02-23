import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const VECTOR_TABLE = process.env.SUPABASE_VECTOR_TABLE || 'material_chunks'
const VECTOR_MATCH_RPC = process.env.SUPABASE_VECTOR_MATCH_RPC || 'match_material_chunks'

const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

const vectorToPgString = (vector) => `[${(vector || []).map((n) => Number(n).toFixed(8)).join(',')}]`

export const upsertMaterialChunksToVectorStore = async (chunks) => {
  if (!supabase || !Array.isArray(chunks) || chunks.length === 0) return { enabled: false, count: 0 }

  const rows = chunks.map((item) => ({
    id: item.id,
    material_id: item.materialId,
    subject: item.subject,
    chapter: item.chapter,
    source_type: item.sourceType,
    page: item.page,
    chunk_index: item.chunkIndex,
    content: item.content,
    embedding: vectorToPgString(item.embedding),
    created_at: item.createdAt,
  }))

  const { error } = await supabase.from(VECTOR_TABLE).upsert(rows, { onConflict: 'id' })
  if (error) {
    return { enabled: true, count: 0, error: error.message }
  }
  return { enabled: true, count: rows.length }
}

export const queryMaterialChunksByVector = async ({ queryEmbedding, subject, topK = 3 }) => {
  if (!supabase || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return null
  const { data, error } = await supabase.rpc(VECTOR_MATCH_RPC, {
    query_embedding: vectorToPgString(queryEmbedding),
    match_subject: subject,
    match_count: topK,
  })
  if (error) return null
  return (data || []).map((row) => ({
    id: row.id,
    materialId: row.material_id,
    subject: row.subject,
    chapter: row.chapter,
    sourceType: row.source_type,
    page: row.page,
    chunkIndex: row.chunk_index,
    content: row.content,
    similarity: row.similarity,
  }))
}

export const deleteMaterialChunksFromVectorStore = async ({ materialId }) => {
  if (!supabase) return { enabled: false, deletedCount: 0 }
  const safeId = String(materialId || '').trim()
  if (!safeId) return { enabled: true, deletedCount: 0 }

  const { error, count } = await supabase.from(VECTOR_TABLE).delete({ count: 'exact' }).eq('material_id', safeId)
  if (error) return { enabled: true, deletedCount: 0, error: error.message }
  return { enabled: true, deletedCount: Number(count || 0) }
}
