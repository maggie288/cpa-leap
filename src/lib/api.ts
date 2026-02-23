import type { KnowledgeEntry, MaterialAsset, SubscriptionPlan, UserProfile, UserProgress } from '../types'
import * as tus from 'tus-js-client'

const API_BASE = (() => {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) || ''
  if (raw) {
    const base = raw.replace(/\/+$/, '')
    // Backend routes are mounted under `/api` (e.g. `/api/auth/login`).
    return base.endsWith('/api') ? base : `${base}/api`
  }
  return import.meta.env.DEV ? 'http://localhost:8787/api' : '/api'
})()
const TOKEN_KEY = 'cpa_leap_token'

const readToken = () => localStorage.getItem(TOKEN_KEY)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = readToken()
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const text = await response.text()
  let json: (T & { message?: string }) | null = null
  if (text) {
    try {
      json = JSON.parse(text) as T & { message?: string }
    } catch {
      // Non-JSON error bodies (e.g. 502 HTML) should still surface a readable message.
      json = { message: text.slice(0, 300) } as T & { message?: string }
    }
  } else {
    json = {} as T & { message?: string }
  }

  if (!response.ok) {
    const msg = json?.message || `请求失败 (${response.status})`
    throw new Error(msg)
  }
  return json as T
}

export const authApi = {
  async register(input: { name: string; email: string; password: string; targetExamDate: string }) {
    const data = await request<{ token: string; user: UserProfile; progress: UserProgress }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    localStorage.setItem(TOKEN_KEY, data.token)
    return data
  },
  async login(input: { email: string; password: string }) {
    const data = await request<{ token: string; user: UserProfile; progress: UserProgress }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    localStorage.setItem(TOKEN_KEY, data.token)
    return data
  },
  async me() {
    return request<{ user: UserProfile }>('/me')
  },
}

export const progressApi = {
  async get() {
    return request<{ progress: UserProgress }>('/progress')
  },
  async completeLesson(input: { lessonId: string; score: number; weakPoints: string[]; subject?: string; runId?: string }) {
    return request<{ progress: UserProgress }>('/progress/lesson', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}

export const subscriptionApi = {
  async updatePlan(plan: SubscriptionPlan) {
    return request<{ user: UserProfile }>('/subscription', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    })
  },
}

export type CourseOutlineEntry = {
  id: string
  topic: string
  concept: string
  chapter: string
  subject: string
  syllabusCode: string
  keywords: string[]
  source: 'material' | 'policy' | 'knowledge'
}

export type CourseOutlineUnit = {
  subject: string
  subjectName: string
  chapters: Array<{
    chapterId: string
    chapterTitle: string
    entries: CourseOutlineEntry[]
  }>
}

export const courseApi = {
  async outline() {
    return request<{ units: CourseOutlineUnit[]; fromKnowledge: boolean }>('/course/outline')
  },
}

export const knowledgeApi = {
  async stats() {
    return request<{
      total: number
      bySubject: Record<string, number>
      byStatus: Record<string, number>
      qualityBuckets: Record<string, number>
    }>('/knowledge/stats')
  },
  async coverage() {
    return request<{
      totalEntries: number
      bySubject: Record<
        string,
        {
          totalEntries: number
          approvedEntries: number
          uniqueChapters: number
          uniqueSyllabusChapters: number
          syllabusCoverageRate: number
        }
      >
      subjectSyllabusTarget: Record<string, number>
    }>('/knowledge/coverage')
  },
  async list(params: { subject?: string; status?: string; q?: string; minQualityScore?: number }) {
    const search = new URLSearchParams()
    if (params.subject) search.set('subject', params.subject)
    if (params.status) search.set('status', params.status)
    if (params.q) search.set('q', params.q)
    if (Number.isFinite(params.minQualityScore)) search.set('minQualityScore', String(params.minQualityScore))
    const query = search.toString()
    return request<{ total: number; entries: KnowledgeEntry[] }>(`/knowledge${query ? `?${query}` : ''}`)
  },
  async getById(id: string) {
    return request<{ entry: KnowledgeEntry }>(`/knowledge/${id}`)
  },
  async delete(id: string) {
    return request<{ ok: boolean; deletedCount: number; deletedIds: string[] }>(`/knowledge/${id}`, {
      method: 'DELETE',
    })
  },
  async conflicts(limit = 100) {
    return request<{ total: number; entries: KnowledgeEntry[] }>(`/knowledge/conflicts?limit=${Math.max(1, limit)}`)
  },
  async revisionDrafts(input?: { status?: 'pending' | 'applied' | 'rejected'; limit?: number }) {
    const search = new URLSearchParams()
    if (input?.status) search.set('status', input.status)
    if (Number.isFinite(input?.limit)) search.set('limit', String(input?.limit))
    const query = search.toString()
    return request<{
      total: number
      drafts: Array<{
        id: string
        sourceEntryId: string
        sourceTopic: string
        targetEntryId: string
        targetTopic: string
        subject: string
        reasons: string[]
        confidence: number
        status: 'pending' | 'applied' | 'rejected'
        summary: string
        createdAt: string
      }>
    }>(`/knowledge/revision-drafts${query ? `?${query}` : ''}`)
  },
  async applyRevisionDraft(id: string) {
    return request<{ ok: boolean; draft: { id: string; status: string }; entry: KnowledgeEntry }>(`/knowledge/revision-drafts/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  async rejectRevisionDraft(id: string) {
    return request<{ ok: boolean; draft: { id: string; status: string } }>(`/knowledge/revision-drafts/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  async suggestFix(id: string) {
    return request<{
      ok: boolean
      message?: string
      id: string
      before: { score: number; issues: string[]; passForGeneration: boolean }
      after: { score: number; issues: string[]; passForGeneration: boolean }
      suggested: KnowledgeEntry
      changedFields: string[]
    }>('/knowledge/suggest-fix', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  },
  async applyFix(id: string) {
    return request<{ ok: boolean; entry: KnowledgeEntry }>('/knowledge/apply-fix', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  },
  async review(id: string, status: KnowledgeEntry['status']) {
    return request<{ ok: boolean; entry: KnowledgeEntry }>('/knowledge/review', {
      method: 'POST',
      body: JSON.stringify({ id, status }),
    })
  },
}

export const automationApi = {
  async stats() {
    return request<{
      totalRuns: number
      autoApprovedRuns: number
      autoApproveRate: number
      latestRuns: Array<{
        runId: string
        lessonTitle: string
        modelVersion: string
        autoApproved: boolean
        qualityScore: number
      }>
      byModel: Record<
        string,
        {
          runs: number
          autoApprovedRuns: number
          avgQualityScore: number
          avgLearnerScore: number
          feedbackCount: number
          autoApproveRate: number
        }
      >
      byPrompt: Record<
        string,
        {
          runs: number
          avgQualityScore: number
          avgLearnerScore: number
          feedbackCount: number
        }
      >
    }>('/automation/stats')
  },
  async getSettings() {
    return request<{
      settings: {
        autopilotEnabled: boolean
        minQualityScore: number
        maxAutoFixRounds: number
        modelVersion: string
        experimentEnabled: boolean
        modelCandidates: string[]
        trafficSplit: Record<string, number>
        promptVersion: string
        promptExperimentEnabled: boolean
        promptCandidates: string[]
        promptTrafficSplit: Record<string, number>
        promptAutoPromoteEnabled: boolean
        promptMinFeedbackCount: number
        promptMinScoreLift: number
      }
    }>('/automation/settings')
  },
  async updateSettings(input: Record<string, unknown>) {
    return request<{
      settings: {
        autopilotEnabled: boolean
        minQualityScore: number
        maxAutoFixRounds: number
        modelVersion: string
        experimentEnabled: boolean
        modelCandidates: string[]
        trafficSplit: Record<string, number>
        promptVersion: string
        promptExperimentEnabled: boolean
        promptCandidates: string[]
        promptTrafficSplit: Record<string, number>
        promptAutoPromoteEnabled: boolean
        promptMinFeedbackCount: number
        promptMinScoreLift: number
      }
    }>('/automation/settings', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async replayPromptEval(input: { promptVersion: string; limit?: number }) {
    return request<{
      promptVersion: string
      sampleCount: number
      avgScore: number
      passRate: number
      template: { version: string; style: string; instruction: string }
    }>('/automation/prompts/replay-eval', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async autoPromotePrompt() {
    return request<{
      ok: boolean
      promotedTo: string
      previousPromptVersion: string
      lift: number
    }>('/automation/prompts/auto-promote', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
}

export const materialsApi = {
  async list(params?: { subject?: string; status?: string }) {
    const search = new URLSearchParams()
    if (params?.subject) search.set('subject', params.subject)
    if (params?.status) search.set('status', params.status)
    const query = search.toString()
    return request<{ total: number; materials: MaterialAsset[] }>(`/materials${query ? `?${query}` : ''}`)
  },
  async stats() {
    return request<{
      total: number
      bySubject: Record<string, number>
      byStatus: Record<string, number>
    }>('/materials/stats')
  },
  async upload(input: {
    file: File
    subject: string
    chapter: string
    year: string
    sourceType: 'textbook' | 'syllabus' | 'exam' | 'notes'
  }) {
    const file = input.file
    const shouldUseResumable = file.size > 20 * 1024 * 1024

    const initiate = async () => {
      return request<{
        material: MaterialAsset
        upload: { bucket: string; path: string; token: string; signedUrl: string }
      }>('/materials/upload/initiate', {
        method: 'POST',
        body: JSON.stringify({
          subject: input.subject,
          chapter: input.chapter,
          year: input.year,
          sourceType: input.sourceType,
          originalName: file.name,
          mimetype: file.type || 'application/pdf',
          size: file.size,
        }),
      })
    }

    const completeUpload = async (id: string) => {
      return request<{ ok: boolean; material: MaterialAsset; message: string }>(`/materials/${id}/complete-upload`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
    }

    const startAsyncIngest = async (id: string) => {
      return request<{ ok: boolean; message: string; id: string }>(`/materials/${id}/process-async`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
    }

    const uploadViaSinglePut = async (signedUrl: string) => {
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) throw new Error(`Storage 上传失败 (HTTP ${putRes.status})`)
    }

    const uploadViaResumable = async (init: {
      upload: { bucket: string; path: string; token: string; signedUrl: string }
    }) => {
      const projectId = new URL(init.upload.signedUrl).host.split('.')[0]
      const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`

      await new Promise<void>((resolve, reject) => {
        const up = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            // Signed upload token from createSignedUploadUrl()
            'x-signature': init.upload.token,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: init.upload.bucket,
            objectName: init.upload.path,
            contentType: file.type || 'application/pdf',
          },
          // Supabase currently requires 6MB chunks for resumable uploads.
          chunkSize: 6 * 1024 * 1024,
          onError: (error) => reject(error),
          onSuccess: () => resolve(),
        })

        void up.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length) up.resumeFromPreviousUpload(previousUploads[0])
          up.start()
        })
      })
    }

    const directToStorage = async () => {
      const init = await initiate()
      if (shouldUseResumable) {
        await uploadViaResumable(init)
      } else {
        await uploadViaSinglePut(init.upload.signedUrl)
      }

      const completed = await completeUpload(init.material.id)
      await startAsyncIngest(init.material.id)
      return { material: completed.material, message: '上传成功，已提交异步入库处理' }
    }

    if (shouldUseResumable) return directToStorage()

    // For small files: try direct-to-storage first, otherwise fallback to multipart.
    try {
      return await directToStorage()
    } catch {
      const form = new FormData()
      form.append('file', file)
      form.append('subject', input.subject)
      form.append('chapter', input.chapter)
      form.append('year', input.year)
      form.append('sourceType', input.sourceType)
      return request<{ material: MaterialAsset; message: string }>('/materials/upload', { method: 'POST', body: form })
    }
  },
  async process(id: string) {
    return request<{ material: MaterialAsset; message: string }>(`/materials/${id}/process`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  async processAsync(id: string) {
    return request<{ ok: boolean; message: string; id: string }>(`/materials/${id}/process-async`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  async remove(id: string) {
    return request<{ ok: boolean; message: string; warnings?: string[] }>(`/materials/${id}`, {
      method: 'DELETE',
    })
  },
  async processAllAsync() {
    return request<{ ok: boolean; acceptedCount: number; message: string }>('/materials/process-all-async', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
}

export const adminOpsApi = {
  async purgeAiKnowledge() {
    return request<{ ok: boolean; deletedCount: number; deletedIds: string[] }>('/admin/purge-ai-knowledge', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'PURGE_AI_KNOWLEDGE' }),
    })
  },
  async clearGenerationRuns() {
    return request<{ ok: boolean; beforeRuns: number; beforeFeedback: number }>('/admin/clear-generation-runs', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'CLEAR_GENERATION_RUNS' }),
    })
  },
}

export const policyScoutApi = {
  async stats() {
    return request<{
      totalRuns: number
      totalItems: number
      latestRun: {
        runId: string
        startedAt: string
        finishedAt: string
        fetchedCount: number
        newItemCount: number
        importedCount: number
        errors: string[]
      } | null
      bySource: Record<string, number>
      bySubject: Record<string, number>
      alerts: Array<{
        id: string
        at: string
        sourceId: string
        sourceName: string
        runId: string
        severity: 'medium' | 'high'
        status: 'sent' | 'failed'
        message: string
        detail: string
        sentAt: string
      }>
      sourceHealth: Array<{
        sourceId: string
        sourceName: string
        url: string
        successCount: number
        failureCount: number
        consecutiveFailures: number
        lastStatus: string
        lastSuccessAt: string
        lastFailureAt: string
        lastError: string
        avgFetchedPerRun: number
        successRate: number
      }>
    }>('/policy-scout/stats')
  },
  async getSettings() {
    return request<{
      settings: {
        enabled: boolean
        intervalMinutes: number
        maxItemsPerSource: number
        autoImportToKnowledge: boolean
        alertEnabled: boolean
        alertFailureThreshold: number
        alertCooldownMinutes: number
        alertWebhookUrl: string
        sources: Array<{
          id: string
          name: string
          publisher: string
          url: string
          format: 'rss' | 'html'
          subject: string
          topicHint: string
          region: string
          sourceTier: 1 | 2 | 3
        }>
      }
    }>('/policy-scout/settings')
  },
  async updateSettings(input: {
    enabled: boolean
    intervalMinutes: number
    maxItemsPerSource: number
    autoImportToKnowledge: boolean
    alertEnabled: boolean
    alertFailureThreshold: number
    alertCooldownMinutes: number
    alertWebhookUrl: string
    sources: Array<{
      id: string
      name: string
      publisher: string
      url: string
      format: 'rss' | 'html'
      subject: string
      topicHint: string
      region: string
      sourceTier: 1 | 2 | 3
    }>
  }) {
    return request<{
      settings: {
        enabled: boolean
        intervalMinutes: number
        maxItemsPerSource: number
        autoImportToKnowledge: boolean
        alertEnabled: boolean
        alertFailureThreshold: number
        alertCooldownMinutes: number
        alertWebhookUrl: string
        sources: Array<{
          id: string
          name: string
          publisher: string
          url: string
          format: 'rss' | 'html'
          subject: string
          topicHint: string
          region: string
          sourceTier: 1 | 2 | 3
        }>
      }
    }>('/policy-scout/settings', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async runOnce() {
    return request<{
      run: {
        runId: string
        fetchedCount: number
        newItemCount: number
        importedCount: number
        errors: string[]
      }
    }>('/policy-scout/run', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  async runs(limit = 20) {
    return request<{
      runs: Array<{
        runId: string
        actor?: string
        reason?: string
        startedAt: string
        finishedAt: string | null
        sourceCount?: number
        fetchedCount: number
        newItemCount: number
        importedCount: number
        errors: string[]
      }>
    }>(`/policy-scout/runs?limit=${Math.max(1, Math.min(100, limit))}`)
  },
  async items(params?: { limit?: number; subject?: string }) {
    const search = new URLSearchParams()
    if (params?.limit != null) search.set('limit', String(params.limit))
    if (params?.subject) search.set('subject', params.subject)
    const query = search.toString()
    return request<{
      total: number
      items: Array<{
        id: string
        sourceId: string
        sourceName: string
        publisher?: string
        subject: string
        topicHint?: string
        region?: string
        title: string
        url: string
        publishedAt?: string
        summary?: string
        sourceTier?: number
        capturedAt?: string
        runId?: string
      }>
    }>(`/policy-scout/items${query ? `?${query}` : ''}`)
  },
}

export const auditApi = {
  async logs(params?: { limit?: number; action?: string }) {
    const search = new URLSearchParams()
    if (Number.isFinite(params?.limit)) search.set('limit', String(params!.limit))
    if (params?.action) search.set('action', params.action)
    const query = search.toString()
    return request<{
      total: number
      logs: Array<{
        id: string
        at: string
        actorUserId: string
        actorRole: string
        tenantId: string
        action: string
        resourceType: string
        resourceId: string
        result: string
        ip: string
        detail: Record<string, unknown>
      }>
    }>(`/audit/logs${query ? `?${query}` : ''}`)
  },
}

export const securityApi = {
  async alerts(limit = 100) {
    return request<{
      total: number
      alerts: Array<{
        id: string
        at: string
        type?: string
        severity?: string
        message?: string
        actorUserId?: string
        targetUserId?: string
        tenantId?: string
      }>
    }>(`/security/alerts?limit=${Math.max(1, Math.min(500, limit))}`)
  },
}

export const userAdminApi = {
  async listUsers() {
    return request<{
      total: number
      users: Array<{
        id: string
        name: string
        email: string
        role: 'student' | 'teacher' | 'admin'
        targetExamDate: string
        plan: 'free' | 'pro' | 'ultra'
        streakDays: number
        createdAt: string
      }>
    }>('/users')
  },
  async updateRole(userId: string, role: 'student' | 'teacher' | 'admin') {
    return request<{
      user: {
        id: string
        name: string
        email: string
        role: 'student' | 'teacher' | 'admin'
        targetExamDate: string
        plan: 'free' | 'pro' | 'ultra'
        streakDays: number
        createdAt: string
      }
    }>(`/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
  },
}
