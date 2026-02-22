import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppStore } from '../lib/useAppStore'
import type { UserRole } from '../types'

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: UserRole[] }) {
  const { currentUser } = useAppStore()
  if (!currentUser) return <Navigate to="/login" replace />
  if (roles && roles.length && !roles.includes(currentUser.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
