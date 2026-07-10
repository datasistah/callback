// Runs migrations/001_init.sql against the database using DATABASE_URL.
//
// DDL cannot run through the Supabase JS client / PostgREST — only through a
// direct postgres connection. We use `pg` with the pooler connection string.
//
// Exposes migrate() so seed.js can create tables before inserting.
import './lib/loadEnv.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      [
        'ERROR: DATABASE_URL is not set.',
        'Find it in the Supabase Dashboard:',
        '  Settings → Database → Connection string → URI (Session mode, port 5432).',
        'It looks like:',
        '  postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres',
        'Add it to server/.env, then re-run.',
      ].join('\n')
    );
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration applied: tables are ready.');
  } finally {
    await client.end();
  }
}

// Allow `node migrate.js` to run it directly.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
