import { createClient } from '@supabase/supabase-js'

// Config resolution order:
//   1. window.__CALLBACK_CONFIG__ — injected by the server at runtime in
//      production (from its Fly secrets), so no build-time args are needed.
//   2. import.meta.env.VITE_* — build-time env, used for local `vite dev`.
const runtime = typeof window !== 'undefined' ? window.__CALLBACK_CONFIG__ : undefined
const url = runtime?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL
const publishableKey = runtime?.supabasePublishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  // Surfaced early in the console so a misconfigured setup is obvious.
  console.error(
    'Missing Supabase config. In dev set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY in client/.env; in production set ' +
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as server env vars.'
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
