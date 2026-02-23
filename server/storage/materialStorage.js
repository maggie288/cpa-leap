import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'materials'

let cachedClient = null

const getAdminClient = () => {
  if (cachedClient) return cachedClient
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedClient
}

export const getStorageBucket = () => SUPABASE_STORAGE_BUCKET

export const isSupabaseStorageEnabled = () => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

export const createSignedUploadForObject = async ({ bucket = SUPABASE_STORAGE_BUCKET, objectPath }) => {
  const supabase = getAdminClient()
  if (!supabase) throw new Error('Supabase Storage 未配置（缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）')
  if (!objectPath) throw new Error('objectPath is required')

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath)
  if (error) throw new Error(`createSignedUploadUrl failed: ${error.message}`)
  if (!data?.signedUrl || !data?.path || !data?.token) throw new Error('createSignedUploadUrl returned empty data')
  return { ...data, bucket }
}

export const downloadObjectAsBuffer = async ({ bucket = SUPABASE_STORAGE_BUCKET, objectPath }) => {
  const supabase = getAdminClient()
  if (!supabase) throw new Error('Supabase Storage 未配置（缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）')
  if (!objectPath) throw new Error('objectPath is required')

  const { data, error } = await supabase.storage.from(bucket).download(objectPath)
  if (error) throw new Error(`storage.download failed: ${error.message}`)
  if (!data) throw new Error('storage.download returned empty data')

  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

export const removeObject = async ({ bucket = SUPABASE_STORAGE_BUCKET, objectPath }) => {
  const supabase = getAdminClient()
  if (!supabase) throw new Error('Supabase Storage 未配置（缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）')
  if (!objectPath) throw new Error('objectPath is required')

  const { data, error } = await supabase.storage.from(bucket).remove([objectPath])
  if (error) throw new Error(`storage.remove failed: ${error.message}`)
  return { removed: data || [] }
}

