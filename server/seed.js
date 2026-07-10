// Seed script — runnable with `node server/seed.js`.
//
// 1. Runs migrate() so all tables exist.
// 2. Uses the Supabase admin (service-role) client to create one demo user
//    (email-confirmed, so they can log in immediately) and populate realistic
//    data/AI-field sample data scoped to that user.
// 3. Idempotent: reuses the demo user if present, and clears the user's seed
//    rows before re-inserting, so running it twice never errors.
// 4. Prints the demo user's email + password to stdout on completion.
import './lib/loadEnv.js';
import { migrate } from './migrate.js';
import { adminClient } from './supabase.js';
import { embedItem } from './lib/vault.js';

const DEMO_EMAIL = 'maya.rivera@example.com';
const DEMO_PASSWORD = 'JobTailor2026!';

const BASE_PROFILE = `MAYA RIVERA — Senior Machine Learning Engineer
San Francisco, CA · maya.rivera@example.com

SUMMARY
Senior ML engineer with 6 years building and shipping recommendation systems
and applied LLM features. Strong in Python and PyTorch, with production
experience in model evaluation, A/B testing, and deploying models on AWS.

EXPERIENCE
Northstar Data — Senior ML Engineer (2021–present)
- Built a deep-learning recommendation system in PyTorch serving 4M daily users.
- Stood up an offline + online evaluation harness; ran weekly A/B tests.
- Owned data pipelines feeding the model; partnered with data engineering.

Brightwave Analytics — Machine Learning Engineer (2018–2021)
- Built NLP classifiers for support-ticket routing (scikit-learn, spaCy).
- Productionized models as REST services on AWS (ECS, Lambda).

SKILLS
Python, PyTorch, scikit-learn, machine learning, recommendation systems,
NLP, model evaluation, A/B testing, AWS, SQL, data pipelines, statistics.`;

const SEED_JOBS = [
  {
    title: 'Senior Machine Learning Engineer',
    company: 'Northwind AI',
    description:
      'We are hiring a Senior ML Engineer to own our recommendation stack. ' +
      'Required: Python, PyTorch, machine learning, recommendation systems, ' +
      'MLOps, feature stores, Ray, and strong experience with model evaluation ' +
      'and A/B testing. You will partner with data engineering on data pipelines.',
    url: 'https://northwind.ai/careers/sr-ml-engineer',
    status: 'bookmarked',
  },
  {
    title: 'Applied AI Engineer',
    company: 'Halcyon Labs',
    description:
      'Build LLM-powered product features end to end. Required: Python, ' +
      'LangChain, large language models, prompt engineering, model evaluation, ' +
      'and experience deploying on AWS. Nice to have: RAG pipelines, vector databases.',
    url: 'https://halcyonlabs.com/jobs/applied-ai-engineer',
    status: 'applied',
  },
  {
    title: 'Data Scientist, Experimentation',
    company: 'Cobalt Systems',
    description:
      'Own our experimentation platform and metrics. Required: Python, ' +
      'statistics, A/B testing, statistical modeling, SQL, and data analysis. ' +
      'You will design experiments and build dashboards for product teams.',
    url: 'https://cobalt.systems/careers/data-scientist-experimentation',
    status: 'interviewing',
  },
  {
    title: 'Data Analyst, Growth',
    company: 'Meridian Health',
    description:
      'Analyze growth and retention. Required: SQL, data analysis, statistics, ' +
      'dashboarding, and clear communication. Nice to have: Python, A/B testing.',
    url: 'https://meridianhealth.com/careers/data-analyst-growth',
    status: 'bookmarked',
  },
];

// Curated Career Vault — atomic, provenance-ready facts for Maya. Each maps to
// one or more of the seed jobs so tailoring retrieves and cites real items.
const SEED_CAREER_ITEMS = [
  { kind: 'experience', title: 'Northstar Data — Senior ML Engineer',
    content: 'Built a deep-learning recommendation system in PyTorch serving 4M daily users, lifting engagement 12%.',
    source: 'Northstar Data (2021–present)' },
  { kind: 'experience', title: 'Northstar Data — Senior ML Engineer',
    content: 'Stood up an offline + online model evaluation harness and ran weekly A/B tests to gate every launch.',
    source: 'Northstar Data (2021–present)' },
  { kind: 'experience', title: 'Northstar Data — Senior ML Engineer',
    content: 'Owned the data pipelines feeding the recommender, partnering with data engineering on freshness and quality.',
    source: 'Northstar Data (2021–present)' },
  { kind: 'experience', title: 'Brightwave Analytics — ML Engineer',
    content: 'Built NLP classifiers for support-ticket routing with scikit-learn and spaCy, cutting manual triage 40%.',
    source: 'Brightwave Analytics (2018–2021)' },
  { kind: 'experience', title: 'Brightwave Analytics — ML Engineer',
    content: 'Productionized models as REST services on AWS (ECS, Lambda) with monitoring and automated rollbacks.',
    source: 'Brightwave Analytics (2018–2021)' },
  { kind: 'project', title: 'Experimentation platform',
    content: 'Designed A/B tests and statistical significance checks for product launches, building dashboards for stakeholders.',
    source: 'Northstar Data' },
  { kind: 'skill', title: 'Python & PyTorch',
    content: 'Python and PyTorch for production machine learning, from training to serving.', source: 'SKILLS' },
  { kind: 'skill', title: 'Recommendation systems',
    content: 'Recommendation systems: candidate generation, ranking, and evaluation.', source: 'SKILLS' },
  { kind: 'skill', title: 'Model evaluation & A/B testing',
    content: 'Model evaluation, A/B testing, and experimentation methodology.', source: 'SKILLS' },
  { kind: 'skill', title: 'AWS',
    content: 'Deploying and operating models on AWS (ECS, Lambda, SageMaker).', source: 'SKILLS' },
];

async function findUserByEmail(admin, email) {
  // listUsers is paginated; the demo set is tiny, so one page is plenty.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) || null;
}

async function run() {
  console.log('Running migration...');
  await migrate();

  const admin = adminClient();

  // 1. Demo user — reuse if present (idempotent).
  let user = await findUserByEmail(admin, DEMO_EMAIL);
  if (user) {
    console.log(`Demo user already exists (${DEMO_EMAIL}); reusing.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created demo user (${DEMO_EMAIL}).`);
  }

  const userId = user.id;

  // 2. Clear this user's existing seed rows so re-runs don't pile up / conflict.
  //    Deleting jobs cascades to resumes / cover_letters / scores.
  await admin.from('jobs').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('user_id', userId);
  await admin.from('career_items').delete().eq('user_id', userId);

  // 3. Base profile (one per user).
  const { error: profileErr } = await admin.from('profiles').insert({
    user_id: userId,
    content: BASE_PROFILE,
    updated_at: new Date().toISOString(),
  });
  if (profileErr) throw profileErr;

  // 4. Jobs across pipeline stages.
  const rows = SEED_JOBS.map((j) => ({ ...j, user_id: userId }));
  const { error: jobsErr } = await admin.from('jobs').insert(rows);
  if (jobsErr) throw jobsErr;

  // 5. Career Vault — embed each item (pgvector column stores a bracketed
  //    literal, hence JSON.stringify) so tailoring can retrieve + cite them.
  const vaultRows = [];
  for (const item of SEED_CAREER_ITEMS) {
    const embedding = await embedItem(item);
    vaultRows.push({ user_id: userId, ...item, embedding: JSON.stringify(embedding) });
  }
  const { error: vaultErr } = await admin.from('career_items').insert(vaultRows);
  if (vaultErr) throw vaultErr;
  console.log(`Seeded ${vaultRows.length} Career Vault items.`);

  console.log('Seed complete.');
  console.log('');
  console.log('=== Demo login ===');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log('==================');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
