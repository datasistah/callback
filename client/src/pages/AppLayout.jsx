import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider.jsx'

export default function AppLayout() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition ${
      isActive ? 'text-accent' : 'text-gray-600 hover:text-ink'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link
              to="/app/board"
              className="text-lg font-semibold tracking-tight text-ink"
            >
              Job<span className="text-accent">Tailor</span>
            </Link>
            <nav className="flex items-center gap-6">
              <NavLink to="/app/board" className={linkClass}>
                Board
              </NavLink>
              <NavLink to="/app/profile" className={linkClass}>
                Base profile
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-gray-500 sm:inline">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              data-testid="logout-button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
