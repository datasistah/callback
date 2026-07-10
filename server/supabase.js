// Supabase clients.
//
// publishableClient — used by route handlers. Created per request with the
//   caller's access token so reads/writes run as that user and respect RLS.
// adminClient — service-role client. Used ONLY by seed.js. Never imported by
//   route files (it bypasses RLS).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in server/.env.');
  process.exit(1);
}

// Returns a publishable-key client scoped to the given user access token.
// Every query made with it runs under that user's RLS policies.
export function userClient(accessToken) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Service-role admin client — bypasses RLS. seed.js only.
export function adminClient() {
  if (!SECRET_KEY) {
    console.error('ERROR: SUPABASE_SECRET_KEY must be set to use the admin client.');
    process.exit(1);
  }
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
