import { JSONFilePreset } from 'lowdb/node'
import { createClient } from '@supabase/supabase-js'

const POLICY_SCOUT_ENABLED = process.env.POLICY_SCOUT_ENABLED !== 'false'
const POLICY_SCOUT_INTERVAL_MINUTES = Number(process.env.POLICY_SCOUT_INTERVAL_MINUTES || 360)
const POLICY_SCOUT_MAX_ITEMS_PER_SOURCE = Number(process.env.POLICY_SCOUT_MAX_ITEMS_PER_SOURCE || 8)
const POLICY_SCOUT_ALERT_WEBHOOK = process.env.POLICY_SCOUT_ALERT_WEBHOOK || ''

const defaultData = {
  users: [],
  progresses: {},
  auditLogs: [],
  securityAlerts: [],
  loginRateLimit: {
    accountIpFailures: {},
    ipFailures: {},
  },
  generationRuns: [],
  modelFeedback: [],
  materials: [],
  materialChunks: [],
  automationSettings: {
    autopilotEnabled: true,
    minQualityScore: 85,
    maxAutoFixRounds: 2,
    modelVersion: 'autopilot-v1',
    experimentEnabled: true,
    modelCandidates: ['autopilot-v1', 'autopilot-v1.1'],
    trafficSplit: { 'autopilot-v1': 50, 'autopilot-v1.1': 50 },
    promptVersion: 'prompt-v1',
    promptExperimentEnabled: true,
    promptCandidates: ['prompt-v1', 'prompt-v1.1'],
    promptTrafficSplit: { 'prompt-v1': 50, 'prompt-v1.1': 50 },
    promptAutoPromoteEnabled: false,
    promptMinFeedbackCount: 20,
    promptMinScoreLift: 2,
  },
  promptTemplates: [
    {
      version: 'prompt-v1',
      style: 'balanced',
      instruction: '输出标准化CPA知识条目，强调概念、规则和错因。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      version: 'prompt-v1.1',
      style: 'exam-focused',
      instruction: '输出以考试为导向的CPA知识条目，强调题干条件与边界判断，并给出高频错因。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  policyScoutSettings: {
    enabled: POLICY_SCOUT_ENABLED,
    intervalMinutes: POLICY_SCOUT_INTERVAL_MINUTES,
    maxItemsPerSource: POLICY_SCOUT_MAX_ITEMS_PER_SOURCE,
    autoImportToKnowledge: true,
    alertEnabled: false,
    alertFailureThreshold: 3,
    alertCooldownMinutes: 180,
    alertWebhookUrl: POLICY_SCOUT_ALERT_WEBHOOK,
    sources: [],
  },
  policyScoutRuns: [],
  policyScoutItems: [],
  policyScoutAlerts: [],
  policySourceSnapshots: [],
  policyScoutDeadLetters: [],
  schedulerLocks: {},
  rbacPolicy: {
    teacherOrAdmin: ['teacher', 'admin'],
    adminOnly: ['admin'],
  },
  knowledgeRevisionDrafts: [],
}

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || 'app_state'
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || 'main'

const cloneDefaultData = () => JSON.parse(JSON.stringify(defaultData))

const ensureDefaults = (data) => {
  data.users ||= []
  data.users = data.users.map((user) => ({
    ...user,
    role: ['student', 'teacher', 'admin'].includes(String(user.role)) ? user.role : 'student',
    tenantId: String(user.tenantId || 'default').trim() || 'default',
  }))
  data.progresses ||= {}
  data.auditLogs ||= []
  data.securityAlerts ||= []
  data.loginRateLimit ||= { accountIpFailures: {}, ipFailures: {} }
  data.generationRuns ||= []
  data.modelFeedback ||= []
  data.materials ||= []
  data.materials = (data.materials || []).map((mat) => ({
    ...mat,
    tenantId: String(mat.tenantId || 'default').trim() || 'default',
  }))
  data.materialChunks ||= []
  data.automationSettings ||= cloneDefaultData().automationSettings
  data.promptTemplates ||= cloneDefaultData().promptTemplates
  data.policyScoutSettings ||= cloneDefaultData().policyScoutSettings
  data.policyScoutRuns ||= []
  data.policyScoutItems ||= []
  data.policyScoutAlerts ||= []
  data.policySourceSnapshots ||= []
  data.policyScoutDeadLetters ||= []
  data.schedulerLocks ||= {}
  data.rbacPolicy ||= cloneDefaultData().rbacPolicy
  data.knowledgeRevisionDrafts ||= []
  data.policyScoutSettings.enabled = data.policyScoutSettings.enabled !== false
  data.policyScoutSettings.intervalMinutes = Math.max(15, Number(data.policyScoutSettings.intervalMinutes || 360))
  data.policyScoutSettings.maxItemsPerSource = Math.max(1, Number(data.policyScoutSettings.maxItemsPerSource || 8))
  data.policyScoutSettings.autoImportToKnowledge = data.policyScoutSettings.autoImportToKnowledge !== false
  data.policyScoutSettings.alertEnabled = data.policyScoutSettings.alertEnabled === true
  data.policyScoutSettings.alertFailureThreshold = Math.max(1, Number(data.policyScoutSettings.alertFailureThreshold || 3))
  data.policyScoutSettings.alertCooldownMinutes = Math.max(5, Number(data.policyScoutSettings.alertCooldownMinutes || 180))
  data.policyScoutSettings.alertWebhookUrl = String(data.policyScoutSettings.alertWebhookUrl || '').trim()
  data.policyScoutSettings.sources ||= []
  data.automationSettings.modelCandidates ||= ['autopilot-v1', 'autopilot-v1.1']
  data.automationSettings.trafficSplit ||= { 'autopilot-v1': 50, 'autopilot-v1.1': 50 }
  data.automationSettings.experimentEnabled ??= true
  data.automationSettings.promptVersion ||= 'prompt-v1'
  data.automationSettings.promptExperimentEnabled ??= true
  data.automationSettings.promptCandidates ||= ['prompt-v1', 'prompt-v1.1']
  data.automationSettings.promptTrafficSplit ||= { 'prompt-v1': 50, 'prompt-v1.1': 50 }
  data.automationSettings.promptAutoPromoteEnabled ??= false
  data.automationSettings.promptMinFeedbackCount = Math.max(1, Number(data.automationSettings.promptMinFeedbackCount || 20))
  data.automationSettings.promptMinScoreLift = Number(data.automationSettings.promptMinScoreLift || 2)
  data.promptTemplates = (data.promptTemplates || []).map((tpl) => ({
    version: String(tpl.version || '').trim(),
    style: String(tpl.style || 'balanced').trim(),
    instruction: String(tpl.instruction || '').trim(),
    createdAt: String(tpl.createdAt || new Date().toISOString()),
    updatedAt: String(tpl.updatedAt || new Date().toISOString()),
  }))
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
