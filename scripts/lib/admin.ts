// Shared setup for the one-off scripts: the Firebase project from .firebaserc
// and an Admin SDK app on Application Default Credentials for the project
// owner. A gitignored .env.scripts in the repo root can carry
// GOOGLE_APPLICATION_CREDENTIALS pointing at a credentials file kept apart
// from the machine's default ADC (see README, "Provisioning and migration").
import { existsSync, readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function defaultProjectId(): string {
  const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf8')) as { projects?: { default?: string } };
  const projectId = firebaserc.projects?.default;
  if (!projectId) throw new Error('.firebaserc has no default project.');
  return projectId;
}

// Project-local settings for these scripts only; never committed.
const ENV_FILE = '.env.scripts';

export function loadScriptEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function connect(projectId: string): Firestore {
  loadScriptEnv();
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}
