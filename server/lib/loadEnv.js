// Loads environment variables, ensuring server/.env exists.
//
// At startup: if server/.env is missing, copy the project-root .env into it
// (the root .env holds the real Supabase credentials for this workspace).
// If neither exists, print a clear error and exit — never silently continue.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const serverEnv = path.join(serverDir, '.env');
const rootEnv = path.resolve(serverDir, '..', '.env');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];

function ensureEnvFile() {
  if (fs.existsSync(serverEnv)) return;

  if (fs.existsSync(rootEnv)) {
    const parsed = dotenv.parse(fs.readFileSync(rootEnv));
    const hasKeys = REQUIRED.every((k) => parsed[k]);
    if (hasKeys) {
      fs.copyFileSync(rootEnv, serverEnv);
      console.log('Copied project-root .env to server/.env.');
      return;
    }
  }

  console.error(
    'ERROR: server/.env is missing. Copy .env.example to server/.env and fill in your Supabase credentials.'
  );
  process.exit(1);
}

ensureEnvFile();
dotenv.config({ path: serverEnv });

export {};
