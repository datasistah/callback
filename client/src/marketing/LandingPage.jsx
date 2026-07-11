import { Link } from 'react-router-dom'

function Wordmark() {
  return (
    <span className="text-lg font-semibold tracking-tight text-ink">
      Call<span className="text-accent-hover">back</span>
    </span>
  )
}

export default function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top nav */}
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <Wordmark />
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="hidden text-sm text-muted hover:text-ink sm:inline"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="hidden text-sm text-muted hover:text-ink sm:inline"
            >
              Pricing
            </a>
            <Link
              to="/login"
              data-testid="nav-login"
              className="text-sm font-medium text-muted hover:text-ink"
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
          Tailor the resume. Rehearse the interview. Land the callback.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Callback turns one saved job into a vault-grounded resume, a matching
          cover letter, a 0–100 fit score, and a spoken mock interview — every
          answer built from your real career history, so you walk in ready.
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
            className="text-base font-medium text-muted hover:text-ink"
          >
            Log in →
          </Link>
        </div>

        {/* Stylised product mockup — a pipeline board, no images. */}
        <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Bookmarked', count: 4, tone: 'bg-slate-500/30 text-slate-200' },
              { label: 'Applied', count: 3, tone: 'bg-accent/30 text-accent-hover' },
              { label: 'Interviewing', count: 2, tone: 'bg-amber-500/25 text-amber-200' },
              { label: 'Offer', count: 1, tone: 'bg-emerald-500/25 text-emerald-200' },
            ].map((col) => (
              <div key={col.label} className="rounded-lg bg-bg p-3 text-left">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">
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
                        className="rounded-md border border-border bg-surface-hover p-2"
                      >
                        <div className="h-2 w-3/4 rounded bg-border" />
                        <div className="mt-1.5 h-2 w-1/2 rounded bg-border/60" />
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid — the full product, not just resumes */}
      <section id="features" className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              One place for the whole application
            </h2>
            <p className="mt-4 text-muted">
              From your career history to the resume, the score, and the
              interview you rehearse out loud.
            </p>
          </div>
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: '❑',
                title: 'Career Vault',
                desc: 'Keep your real accomplishments in one longitudinal record. Every tailored bullet and interview question is grounded in — and cites — an item here.',
              },
              {
                icon: '✎',
                title: 'Tailor in minutes',
                desc: 'Generate a resume and cover letter shaped to one specific job, drawn from your vault with provenance you can trust.',
              },
              {
                icon: '◎',
                title: 'Score the fit',
                desc: 'A 0–100 match score with matched and missing keywords tells you what to fix before you apply.',
              },
              {
                icon: '🎙',
                title: 'Practice the interview',
                desc: 'Behavioral STAR questions generated from the job and grounded in your vault — read aloud, with your spoken answers recorded and transcribed.',
              },
              {
                icon: '▥',
                title: 'Track the pipeline',
                desc: 'Move every job from Bookmarked to Applied to Interviewing to Offer on one board.',
              },
              {
                icon: '⚡',
                title: 'Free to run',
                desc: 'Runs on free and local models — no credits, no tiers, every feature open to every signed-in user.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-surface/50 p-6 transition hover:border-accent/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-xl text-accent-hover">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <div className="mx-auto mt-12 grid max-w-5xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '1',
                text: 'Add a job — paste a description or a URL with the title and company.',
              },
              {
                n: '2',
                text: 'Tailor a resume and cover letter to that job, grounded in your Career Vault.',
              },
              {
                n: '3',
                text: 'Get a match score and breakdown, then edit and re-score until it fits.',
              },
              {
                n: '4',
                text: 'Rehearse the interview out loud — job-specific STAR questions, read aloud and transcribed.',
              },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                  {s.n}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section id="pricing" className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Trusted by teams at
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-lg font-semibold text-muted">
            <span>Northwind</span>
            <span>Acme</span>
            <span>Globex</span>
            <span>Initech</span>
            <span>Hooli</span>
          </div>
          <p className="mt-8 text-sm text-muted">
            Every feature is free for every signed-in user. No credits, no tiers.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-bg px-6 py-16 text-center">
            <h2 className="text-4xl font-bold tracking-tight text-ink">
              Ready to ship better applications?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Stop guessing whether your resume fits. Score it, fix it, then apply.
            </p>
            <Link
              to="/signup"
              data-testid="footer-cta-signup"
              className="mt-8 inline-block rounded-md bg-accent px-7 py-3 text-base font-medium text-white transition hover:bg-accent-hover"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-4">
            <div>
              <Wordmark />
              <p className="mt-3 text-sm text-muted">
                Tailor every application.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Product</h4>
              <ul className="mt-3 space-y-2 text-sm text-muted">
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
              <ul className="mt-3 space-y-2 text-sm text-muted">
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
              <ul className="mt-3 space-y-2 text-sm text-muted">
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
          <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
            © {year} Callback. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
