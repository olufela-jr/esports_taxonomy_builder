import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { ConfigurationError } from './config-error';

// Firebase is configured entirely from build-time environment variables.
// See .env.example. When VITE_FIREBASE_PROJECT_ID is unset the app runs on the
// in-memory store (development and tests only; production refuses to start).

export type FirebaseServices = {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  functions: Functions; // the Callables, in the database's region
};

const env = import.meta.env;

export function isFirebaseConfigured(): boolean {
  return Boolean(env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID);
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured()) {
    throw new ConfigurationError('Firebase is not configured. Set the VITE_FIREBASE_* variables (see apps/web/.env.example).');
  }

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  // Optional fields such as `tags` are omitted by the app; tell Firestore to
  // drop undefined values instead of rejecting the write.
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const auth = getAuth(app);
  const functions = getFunctions(app, 'asia-south1');

  services = { app, db, auth, functions };
  return services;
}
