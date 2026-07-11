import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider.jsx'
import Reveal from './Reveal.jsx'
import ScorePreview from './ScorePreview.jsx'
import InterviewPreview from './InterviewPreview.jsx'

function Wordmark() {
  return (
    <span className="text-lg font-semibold tracking-tight text-ink">
      Call<span className="text-accent-hover">back</span>
    </span>
  )
}

export default function LandingPage() {
  const year = new Date().getFullYear()
  // Route already-signed-in visitors into the app instead of asking them to log
  // in again — the primary call to action becomes "Go to your board".
  const { session } = useSession()
  const loggedIn = Boolean(session)
  const ctaTo = loggedIn ? '/app/board' : '/signup'
  const ctaLabel = loggedIn ? 'Go to your board' : 'Get started'

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
            {loggedIn ? (
              <Link
                to="/app/board"
                data-testid="nav-app"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
              >
                Go to app →
              </Link>
            ) : (
              <>
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
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        {/* Ambient glow blobs for depth. */}
        <div
          aria-hidden
          className="cb-glow pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]"
        />
        <div
          aria-hidden
          className="cb-glow pointer-events-none absolute top-40 right-0 h-[320px] w-[420px] rounded-full bg-emerald-500/15 blur-[120px]"
          style={{ animationDelay: '2s' }}
        />

        <div className="relative mx-auto max-w-[1200px]">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Tailor the resume. Rehearse the interview.{' '}
          <span className="bg-gradient-to-r from-accent-hover via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Land the callback.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Callback turns one saved job into a vault-grounded resume, a matching
          cover letter, a 0–100 fit score, and a spoken mock interview — every
          answer built from your real career history, so you walk in ready.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to={ctaTo}
            data-testid="hero-cta-signup"
            className="rounded-md bg-gradient-to-br from-accent to-indigo-700 px-7 py-3 text-base font-medium text-white shadow-sm transition hover:opacity-95"
          >
            {loggedIn ? 'Go to your board →' : "Get started — it's free"}
          </Link>
          {!loggedIn && (
            <Link
              to="/login"
              data-testid="hero-login"
              className="text-base font-medium text-muted hover:text-ink"
            >
              Log in →
            </Link>
          )}
        </div>

        {/* Live product preview — the real scoring card, animated. */}
        <div className="cb-float mx-auto mt-16 max-w-xl">
          <ScorePreview />
        </div>
        <p className="mt-5 text-xs text-muted">Live preview — this is the actual fit score in action.</p>
        </div>
      </section>

      {/* See it in action — animated previews of scoring + interview grading */}
      <section className="border-t border-border bg-surface/20">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">See it in action</h2>
            <p className="mt-4 text-muted">
              Score any resume against a job, then rehearse the interview out loud and get graded
              on your STAR structure — scroll to watch both work.
            </p>
          </Reveal>
          <div className="mt-14 grid items-start gap-8 lg:grid-cols-2">
            <Reveal>
              <p className="mb-3 text-sm font-semibold text-accent-hover">◎ Score the fit</p>
              <ScorePreview />
            </Reveal>
            <Reveal delay={120}>
              <p className="mb-3 text-sm font-semibold text-accent-hover">🎙 Grade the interview</p>
              <InterviewPreview />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Feature grid — the full product, not just resumes */}
      <section id="features" className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              One place for the whole application
            </h2>
            <p className="mt-4 text-muted">
              From your career history to the resume, the score, and the
              interview you rehearse out loud.
            </p>
          </Reveal>
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
            ].map((f, i) => (
              <Reveal
                key={f.title}
                delay={(i % 3) * 90}
                className="group rounded-xl border border-border bg-surface/50 p-6 transition duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-xl text-accent-hover transition group-hover:scale-110">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.desc}
                </p>
              </Reveal>
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
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-indigo-700 text-sm font-semibold text-white shadow-lg shadow-accent/20">
                  {s.n}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {s.text}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-20 text-center">
          <Reveal className="mx-auto max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink">
              Free. Every feature.
            </h2>
            <p className="mt-4 text-muted">
              Callback runs on free and local models — no credits, no tiers, no paywalled
              features. Every tool is open to every signed-in user.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Reveal className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface to-bg px-6 py-16 text-center">
            <div
              aria-hidden
              className="cb-glow pointer-events-none absolute -bottom-24 left-1/2 h-72 w-[520px] -translate-x-1/2 rounded-full bg-accent/20 blur-[100px]"
            />
            <h2 className="relative text-4xl font-bold tracking-tight text-ink">
              Ready to ship better applications?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Stop guessing whether your resume fits. Score it, fix it, then apply.
            </p>
            <Link
              to={ctaTo}
              data-testid="footer-cta-signup"
              className="mt-8 inline-block rounded-md bg-accent px-7 py-3 text-base font-medium text-white transition hover:bg-accent-hover"
            >
              {ctaLabel}
            </Link>
          </Reveal>
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
