// Loads environment variables for the server.
//
// Two supported sources, in order:
//   1. Real process env (production): a host like Fly.io injects secrets as
//      actual environment variables — there is no .env file in the container.
//      When the required keys are already present, we use them as-is.
//   2. A .env file (local dev): server/.env, or the project-root .env copied
//      into place on first run (the root .env holds this workspace's creds).
//
// Only when NEITHER source provides the required keys do we print a clear error
// and exit — never silently continue with a half-configured server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const serverEnv = path.join(serverDir, '.env');
const rootEnv = path.resolve(serverDir, '..', '.env');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];

function hasRequiredEnv(source) {
  return REQUIRED.every((k) => source[k]);
}

function loadEnv() {
  // (1) Production / already-configured: secrets are in the real environment
  // (Fly, Docker `-e`, CI). No file needed.
  if (hasRequiredEnv(process.env)) return;

  // (2) Local dev: prefer server/.env, else seed it from the project-root .env.
  if (fs.existsSync(serverEnv)) {
    dotenv.config({ path: serverEnv });
    if (hasRequiredEnv(process.env)) return;
  }

  if (fs.existsSync(rootEnv)) {
    const parsed = dotenv.parse(fs.readFileSync(rootEnv));
    if (hasRequiredEnv(parsed)) {
      fs.copyFileSync(rootEnv, serverEnv);
      console.log('Copied project-root .env to server/.env.');
      dotenv.config({ path: serverEnv });
      return;
    }
  }

  console.error(
    'ERROR: Supabase credentials are not configured. In local dev, copy ' +
      '.env.example to server/.env and fill it in. In production, set ' +
      `${REQUIRED.join(', ')} (and OPENROUTER_API_KEY) as environment variables.`
  );
  process.exit(1);
}

loadEnv();

export {};
