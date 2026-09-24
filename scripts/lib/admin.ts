// Shared setup for the one-off scripts: the Firebase project from .firebaserc
// and an Admin SDK app on Application Default Credentials. Run
// `gcloud auth application-default login` as the project owner first.
import { readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function defaultProjectId(): string {
  const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf8')) as { projects?: { default?: string } };
  const projectId = firebaserc.projects?.default;
  if (!projectId) throw new Error('.firebaserc has no default project.');
  return projectId;
}

export function connect(projectId: string): Firestore {
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
