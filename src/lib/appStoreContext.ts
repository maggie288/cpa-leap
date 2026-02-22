import { createContext } from 'react'
import type { SubscriptionPlan, UserProfile, UserProgress } from '../types'

export interface AppStoreValue {
  currentUser: UserProfile | null
  progress: UserProgress | null
  login: (email: string, password: string) => Promise<{ ok: boolean; message: string }>
  register: (name: string, email: string, password: string, targetExamDate: string) => Promise<{ ok: boolean; message: string }>
  logout: () => void
  completeLesson: (lessonId: string, score: number, weakPoints: string[], subject?: string, runId?: string) => Promise<void>
  updatePlan: (plan: SubscriptionPlan) => Promise<void>
}

export const AppStoreContext = createContext<AppStoreValue | null>(null)
