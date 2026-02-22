import { useContext } from 'react'
import { AppStoreContext } from './appStoreContext'

export const useAppStore = () => {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used inside AppStoreProvider')
  return ctx
}
