import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppStoreProvider } from './lib/store'
import { useAppStore } from './lib/useAppStore'
import { DashboardPage } from './pages/DashboardPage'
import { LessonPage } from './pages/LessonPage'
import { LoginPage } from './pages/LoginPage'
import { KnowledgeOpsPage } from './pages/KnowledgeOpsPage'
import { ProfilePage } from './pages/ProfilePage'
import { SubscriptionPage } from './pages/SubscriptionPage'

function ShellLayout() {
  const { currentUser } = useAppStore()

  return (
    <>
      {currentUser && (
        <nav className="main-nav">
          <Link to="/">学习</Link>
          <Link to="/knowledge">教研</Link>
          <Link to="/subscription">订阅</Link>
          <Link to="/profile">我的</Link>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson/:lessonId"
          element={
            <ProtectedRoute>
              <LessonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/knowledge"
          element={
            <ProtectedRoute>
              <KnowledgeOpsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscription"
          element={
            <ProtectedRoute>
              <SubscriptionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={currentUser ? '/' : '/login'} replace />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <AppStoreProvider>
      <ShellLayout />
    </AppStoreProvider>
  )
}

export default App
