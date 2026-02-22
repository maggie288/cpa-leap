import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppStore } from '../lib/useAppStore'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useAppStore()
  if (!currentUser) return <Navigate to="/login" replace />
  return <>{children}</>
}
