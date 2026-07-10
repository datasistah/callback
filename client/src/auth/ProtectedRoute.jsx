import { Navigate } from 'react-router-dom'
import { useSession } from './SessionProvider.jsx'
import Spinner from '../components/Spinner.jsx'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner label="Loading your account…" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
