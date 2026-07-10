import { Link } from 'react-router-dom'

// Shared visual shell for the login and signup pages.
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-6">
        <Link to="/" className="text-lg font-semibold tracking-tight text-ink">
          Call<span className="text-accent-hover">back</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/60 p-8 shadow-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
