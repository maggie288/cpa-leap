import { JSONFilePreset } from 'lowdb/node'
import { createClient } from '@supabase/supabase-js'

const defaultData = {
  users: [],
  progresses: {},
  generationRuns: [],
  modelFeedback: [],
  automationSettings: {
    autopilotEnabled: true,
    minQualityScore: 85,
    maxAutoFixRounds: 2,
    modelVersion: 'autopilot-v1',
    experimentEnabled: true,
    modelCandidates: ['autopilot-v1', 'autopilot-v1.1'],
    trafficSplit: { 'autopilot-v1': 50, 'autopilot-v1.1': 50 },
  },
}

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || 'app_state'
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || 'main'

const cloneDefaultData = () => JSON.parse(JSON.stringify(defaultData))

const ensureDefaults = (data) => {
  data.users ||= []
  data.progresses ||= {}
  data.generationRuns ||= []
  data.modelFeedback ||= []
  data.automationSettings ||= cloneDefaultData().automationSettings
  data.automationSettings.modelCandidates ||= ['autopilot-v1', 'autopilot-v1.1']
  data.automationSettings.trafficSplit ||= { 'autopilot-v1': 50, 'autopilot-v1.1': 50 }
  data.automationSettings.experimentEnabled ??= true
  return data
}

const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

const createSupabaseStateStore = async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: row, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select('payload')
    .eq('id', SUPABASE_STATE_ROW_ID)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Supabase state load failed: ${error.message}`)
  }

  const initialPayload = ensureDefaults(row?.payload || cloneDefaultData())

  const store = {
    data: initialPayload,
    write: async () => {
      const payload = ensureDefaults(store.data)
      const { error: upsertError } = await supabase.from(SUPABASE_STATE_TABLE).upsert(
        {
          id: SUPABASE_STATE_ROW_ID,
          payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (upsertError) {
        throw new Error(`Supabase state write failed: ${upsertError.message}`)
      }
    },
  }

  await store.write()
  return store
}

export const db = useSupabase ? await createSupabaseStateStore() : await JSONFilePreset('./server/data/db.json', defaultData)

// Lightweight migration for existing local db files.
ensureDefaults(db.data)
await db.write()
