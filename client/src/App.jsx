import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import LandingPage from './marketing/LandingPage.jsx'
import LoginPage from './auth/LoginPage.jsx'
import SignupPage from './auth/SignupPage.jsx'
import AppLayout from './pages/AppLayout.jsx'
import BoardPage from './pages/BoardPage.jsx'
import JobDetailPage from './pages/JobDetailPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import VaultPage from './pages/VaultPage.jsx'

// Wrap each page in its own error boundary so one broken screen never blanks
// the whole app (Prod requirement).
function page(node) {
  return <ErrorBoundary>{node}</ErrorBoundary>
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={page(<LandingPage />)} />
      <Route path="/login" element={page(<LoginPage />)} />
      <Route path="/signup" element={page(<SignupPage />)} />

      {/* Protected product area */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/board" replace />} />
        <Route path="board" element={page(<BoardPage />)} />
        <Route path="vault" element={page(<VaultPage />)} />
        <Route path="jobs/:id" element={page(<JobDetailPage />)} />
        <Route path="profile" element={page(<ProfilePage />)} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
