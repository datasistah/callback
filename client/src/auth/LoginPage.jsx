import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from './SessionProvider.jsx'
import AuthShell from './AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const emailValid = EMAIL_RE.test(email)
  const passwordValid = password.length > 0
  const formValid = emailValid && passwordValid

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setServerError('')
    if (!formValid) return

    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)

    if (error) {
      setServerError(error.message || 'Invalid email or password.')
      return
    }
    navigate('/app/board', { replace: true })
  }

  return (
    <AuthShell
      title="Log in to Callback"
      subtitle="Welcome back. Pick up where you left off."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <ErrorBanner message={serverError} />

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-ink"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            data-testid="email-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="you@example.com"
          />
          {touched.email && !emailValid && (
            <p className="mt-1 text-xs text-red-400">
              Enter a valid email address.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-ink"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            data-testid="password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Your password"
          />
          {touched.password && !passwordValid && (
            <p className="mt-1 text-xs text-red-400">Password is required.</p>
          )}
        </div>

        <button
          type="submit"
          data-testid="login-button"
          disabled={!formValid || submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link
          to="/signup"
          data-testid="go-to-signup"
          className="font-medium text-accent-hover hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
