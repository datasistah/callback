import { Link } from 'react-router-dom'

function Wordmark() {
  return (
    <span className="text-lg font-semibold tracking-tight text-ink">
      Job<span className="text-accent">Tailor</span>
    </span>
  )
}

export default function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Top nav */}
      <header className="border-b border-gray-100">
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <Wordmark />
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="hidden text-sm text-gray-600 hover:text-ink sm:inline"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="hidden text-sm text-gray-600 hover:text-ink sm:inline"
            >
              Pricing
            </a>
            <Link
              to="/login"
              data-testid="nav-login"
              className="text-sm font-medium text-gray-700 hover:text-ink"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              data-testid="nav-signup"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Tailor every application. Score every fit before you apply.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-600">
          JobTailor turns one saved job into a tailored resume, a matching cover
          letter, and a 0–100 match score that tells you what is still missing.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/signup"
            data-testid="hero-cta-signup"
            className="rounded-md bg-gradient-to-br from-accent to-indigo-700 px-7 py-3 text-base font-medium text-white shadow-sm transition hover:opacity-95"
          >
            Get started — it's free
          </Link>
          <Link
            to="/login"
            data-testid="hero-login"
            className="text-base font-medium text-gray-700 hover:text-ink"
          >
            Log in →
          </Link>
        </div>

        {/* Stylised product mockup — a pipeline board, no images. */}
        <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Bookmarked', count: 4, tone: 'bg-gray-200' },
              { label: 'Applied', count: 3, tone: 'bg-indigo-200' },
              { label: 'Interviewing', count: 2, tone: 'bg-amber-200' },
              { label: 'Offer', count: 1, tone: 'bg-emerald-200' },
            ].map((col) => (
              <div key={col.label} className="rounded-lg bg-white p-3 text-left">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    {col.label}
                  </span>
                  <span className={`rounded-full px-2 text-xs ${col.tone}`}>
                    {col.count}
                  </span>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: col.count > 2 ? 2 : col.count }).map(
                    (_, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-gray-100 bg-gray-50 p-2"
                      >
                        <div className="h-2 w-3/4 rounded bg-gray-300" />
                        <div className="mt-1.5 h-2 w-1/2 rounded bg-gray-200" />
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three-up feature row */}
      <section id="features" className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="grid gap-10 sm:grid-cols-3">
            {[
              {
                icon: '✎',
                title: 'Tailor in minutes',
                desc: 'Generate a resume and cover letter shaped to one specific job, drawn from your base profile.',
              },
              {
                icon: '◎',
                title: 'Score the fit',
                desc: 'A 0–100 match score with matched and missing keywords tells you what to fix before you apply.',
              },
              {
                icon: '▥',
                title: 'Track the pipeline',
                desc: 'Move every job from Bookmarked to Applied to Interviewing to Offer on one board.',
              },
            ].map((f) => (
              <div key={f.title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-xl text-accent">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3">
            {[
              {
                n: '1',
                text: 'Add a job — paste a description or a URL with the title and company.',
              },
              {
                n: '2',
                text: 'Tailor a resume and cover letter to that job from your base profile.',
              },
              {
                n: '3',
                text: 'Get a match score and breakdown, then edit and re-score until it fits.',
              },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                  {s.n}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-gray-600">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section id="pricing" className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Trusted by teams at
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-lg font-semibold text-gray-400">
            <span>Northwind</span>
            <span>Acme</span>
            <span>Globex</span>
            <span>Initech</span>
            <span>Hooli</span>
          </div>
          <p className="mt-8 text-sm text-gray-500">
            Every feature is free for every signed-in user. No credits, no tiers.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-gray-100 bg-ink">
        <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-white">
            Ready to ship better applications?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-gray-300">
            Stop guessing whether your resume fits. Score it, fix it, then apply.
          </p>
          <Link
            to="/signup"
            data-testid="footer-cta-signup"
            className="mt-8 inline-block rounded-md bg-white px-7 py-3 text-base font-medium text-ink transition hover:bg-gray-100"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-4">
            <div>
              <Wordmark />
              <p className="mt-3 text-sm text-gray-500">
                Tailor every application.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Product</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#features" className="hover:text-ink">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-ink">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-ink">
                    Changelog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Company</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-ink">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-ink">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-ink">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Resources</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-ink">
                    Guide
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-ink">
                    Support
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-ink">
                    Privacy
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-12 border-t border-gray-100 pt-6 text-sm text-gray-400">
            © {year} JobTailor. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
