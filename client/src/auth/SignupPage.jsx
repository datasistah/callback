import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from './SessionProvider.jsx'
import AuthShell from './AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const { signUp } = useSession()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const emailValid = EMAIL_RE.test(email)
  const passwordValid = password.length >= 8
  const formValid = emailValid && passwordValid

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setServerError('')
    setNotice('')
    if (!formValid) return

    setSubmitting(true)
    const { data, error } = await signUp(email, password)
    setSubmitting(false)

    if (error) {
      setServerError(error.message || 'Could not create your account.')
      return
    }

    // Email/password signups normally return a session immediately. If email
    // confirmation is enabled, there's no session yet — guide the user instead
    // of silently doing nothing.
    if (data?.session) {
      navigate('/app/board', { replace: true })
    } else {
      setNotice(
        'Account created. Check your email to confirm, then log in.'
      )
    }
  }

  return (
    <AuthShell
      title="Create your Callback account"
      subtitle="Tailor every application and score the fit before you apply."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <ErrorBanner message={serverError} />
        <ErrorBanner message={notice} tone="info" />

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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="you@example.com"
          />
          {touched.email && !emailValid && (
            <p className="mt-1 text-xs text-red-600">
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
            autoComplete="new-password"
            data-testid="password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="At least 8 characters"
          />
          {touched.password && !passwordValid && (
            <p className="mt-1 text-xs text-red-600">
              Password must be at least 8 characters.
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid="signup-button"
          disabled={!formValid || submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link
          to="/login"
          data-testid="go-to-login"
          className="font-medium text-accent hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  )
}
