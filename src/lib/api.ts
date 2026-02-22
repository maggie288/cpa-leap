import type { KnowledgeEntry, SubscriptionPlan, UserProfile, UserProgress } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8787/api' : '/api')
const TOKEN_KEY = 'cpa_leap_token'

const readToken = () => localStorage.getItem(TOKEN_KEY)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = readToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const json = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw new Error(json.message || '请求失败')
  }
  return json
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
      }
    }>('/automation/settings', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}
