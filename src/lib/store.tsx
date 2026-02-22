import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SubscriptionPlan, UserProfile, UserProgress } from '../types'
import { AppStoreContext } from './appStoreContext'
import { authApi, clearToken, progressApi, subscriptionApi } from './api'

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [progress, setProgress] = useState<UserProgress | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('cpa_leap_token')) return
    void authApi
      .me()
      .then(async ({ user }) => {
        setCurrentUser(user)
        const data = await progressApi.get()
        setProgress(data.progress)
      })
      .catch(() => clearToken())
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const data = await authApi.login({ email, password })
      setCurrentUser(data.user)
      setProgress(data.progress)
      return { ok: true, message: '登录成功' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '登录失败' }
    }
  }

  const register = async (name: string, email: string, password: string, targetExamDate: string) => {
    try {
      const data = await authApi.register({ name, email, password, targetExamDate })
      setCurrentUser(data.user)
      setProgress(data.progress)
      return { ok: true, message: '注册成功，欢迎开始学习' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '注册失败' }
    }
  }

  const logout = () => {
    clearToken()
    setCurrentUser(null)
    setProgress(null)
  }

  const completeLesson = async (lessonId: string, score: number, weakPoints: string[], subject?: string, runId?: string) => {
    if (!currentUser) return
    try {
      const data = await progressApi.completeLesson({ lessonId, score, weakPoints, subject, runId })
      setProgress(data.progress)
    } catch {
      // Keep UI available even if network is unstable.
    }
  }

  const updatePlan = async (plan: SubscriptionPlan) => {
    if (!currentUser) return
    try {
      const data = await subscriptionApi.updatePlan(plan)
      setCurrentUser(data.user)
    } catch {
      // No-op in UI layer, error can be surfaced later.
    }
  }

  const value = { currentUser, progress, login, register, logout, completeLesson, updatePlan }
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}
