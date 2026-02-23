import type { KnowledgeEntry, MaterialAsset, SubscriptionPlan, UserProfile, UserProgress } from '../types'

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
    const shouldDirectUpload = file.size > 45 * 1024 * 1024

    const directUpload = async () => {
      const init = await request<{
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

      const putRes = await fetch(init.upload.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/pdf',
        },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error(`Storage 上传失败 (HTTP ${putRes.status})`)
      }

      const completed = await request<{ ok: boolean; material: MaterialAsset; message: string }>(
        `/materials/${init.material.id}/complete-upload`,
        { method: 'POST', body: JSON.stringify({}) },
      )

      // Async ingest to avoid request timeouts for large PDFs.
      await request<{ ok: boolean; message: string; id: string }>(`/materials/${init.material.id}/process-async`, {
        method: 'POST',
        body: JSON.stringify({}),
      })

      return { material: completed.material, message: '上传成功，已提交异步入库处理' }
    }

    if (shouldDirectUpload) return directUpload()

    // For small files: try direct upload first (if backend supports), otherwise fallback to multipart.
    try {
      return await directUpload()
    } catch {
      const form = new FormData()
      form.append('file', file)
      form.append('subject', input.subject)
      form.append('chapter', input.chapter)
      form.append('year', input.year)
      form.append('sourceType', input.sourceType)
      return request<{ material: MaterialAsset; message: string }>('/materials/upload', {
        method: 'POST',
        body: form,
      })
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
