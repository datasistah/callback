// reset-demo.js — wipe the demo user's app data back to a blank slate WITHOUT
// deleting the auth user, so the existing login still works. Clears jobs
// (which cascades to resumes / cover_letters / scores / interview_sessions /
// questions), the base profile, and every Career Vault item.
//
// Run: `node server/reset-demo.js`
// The inverse of `seed.js` — use it to start fresh with your own resume.
import './lib/loadEnv.js';
import { adminClient } from './supabase.js';

const DEMO_EMAIL = process.env.RESET_EMAIL || 'maya.rivera@example.com';

async function findUserByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) || null;
}

async function run() {
  const admin = adminClient();
  const user = await findUserByEmail(admin, DEMO_EMAIL);
  if (!user) {
    console.error(`User ${DEMO_EMAIL} not found — nothing to reset.`);
    process.exit(1);
  }
  const userId = user.id;

  // Order matters only cosmetically: deleting jobs already cascades to their
  // interview sessions/questions, resumes, cover letters, and scores.
  for (const table of ['jobs', 'profiles', 'career_items']) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
    console.log(`Cleared ${table}`);
  }

  console.log(`\n${DEMO_EMAIL} is now a blank slate — profile, vault, and board are empty.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
