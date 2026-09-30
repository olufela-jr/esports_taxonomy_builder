// ALL tenant-level calls for the super user go through this module: the list
// of tenants (read straight from Firestore, which the rules allow the super
// user), and creating or editing one (Callables, since the tenant document is
// never written from a client). Memory mode keeps a small directory so the
// Tenants screen works in development and Playwright.
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { isPlatform } from '@taxo/shared';
import { getFirebase } from '@/lib/firebase';
import { LOCAL_TENANT_ID } from './auth';
import type { Mode } from './mode';
import type { Tenant, TenantConfig } from './types';

export type TenantDraft = {
  id: string;
  name: string;
  config: TenantConfig;
};

export type TenantsDirectory = {
  getSnapshot(): Tenant[];
  subscribe(listener: (tenants: Tenant[]) => void): () => void;
  create(draft: TenantDraft): Promise<Tenant>;
  update(id: string, patch: { name?: string; config?: TenantConfig }): Promise<Tenant>;
};

// Test hook: the tenants a memory-mode super user sees besides the local one.
declare global {
  interface Window {
    __taxoTestTenants?: Tenant[];
  }
}

const TENANT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const DATASET = /^[A-Za-z0-9_]+$/;

function byName(a: Tenant, b: Tenant): number {
  return a.name.localeCompare(b.name);
}

// The shape the Function stores: datasets deduplicated and sorted, platforms
// lowercase. Applied by the memory directory so it reads back the same way.
export function normalizeTenantConfig(config: TenantConfig): TenantConfig {
  return {
    allowedDatasets: [...new Set(config.allowedDatasets.map((item) => item.trim()).filter(Boolean))].sort(),
    platforms: [...new Set(config.platforms.map((item) => item.trim().toLowerCase()).filter(Boolean))],
  };
}

// The same checks the Function applies, so the form can refuse early with the
// same wording; the Function is still the one that decides.
export function checkTenantDraft(draft: TenantDraft): string[] {
  const errors: string[] = [];
  if (!TENANT_ID.test(draft.id)) errors.push('A tenant id is lowercase letters, digits and hyphens, 2 to 63 characters.');
  if (!draft.name.trim()) errors.push('A tenant needs a name.');
  const badDataset = draft.config.allowedDatasets.find((dataset) => !DATASET.test(dataset));
  if (badDataset) errors.push(`Dataset "${badDataset}" is not a valid BigQuery dataset id (letters, digits and underscores).`);
  const unknown = draft.config.platforms.filter((id) => !isPlatform(id));
  if (unknown.length > 0) errors.push(`Unknown platform(s): ${unknown.join(', ')}.`);
  return errors;
}

// ---- Shared workspace ------------------------------------------------------------

function createFirestoreDirectory(db: Firestore): TenantsDirectory {
  const { functions } = getFirebase();
  const create = httpsCallable<TenantDraft, Tenant>(functions, 'createTenant');
  const update = httpsCallable<{ id: string; name?: string; config?: TenantConfig }, Tenant>(functions, 'updateTenant');
  let snapshot: Tenant[] = [];
  const listeners = new Set<(tenants: Tenant[]) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      collection(db, 'tenants'),
      (result) => {
        snapshot = result.docs.map((item) => item.data() as Tenant).sort(byName);
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        console.error('Tenants subscription failed', error);
        stopListening = null;
      },
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      ensureListening();
      listener(snapshot);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stopListening) {
          stopListening();
          stopListening = null;
          snapshot = [];
        }
      };
    },
    async create(draft) { return (await create(draft)).data; },
    async update(id, patch) { return (await update({ id, ...patch })).data; },
  };
}

// ---- Memory mode -----------------------------------------------------------------

function createMemoryDirectory(): TenantsDirectory {
  const now = '2026-09-24T00:00:00.000Z';
  const local: Tenant = { id: LOCAL_TENANT_ID, name: 'Local workspace', config: { allowedDatasets: [], platforms: [] }, createdAt: now, updatedAt: now };
  let tenants: Tenant[] = [local, ...(window.__taxoTestTenants ?? []).filter((tenant) => tenant.id !== LOCAL_TENANT_ID)].sort(byName);
  const listeners = new Set<(tenants: Tenant[]) => void>();
  const commit = (next: Tenant[]) => {
    tenants = [...next].sort(byName);
    listeners.forEach((listener) => listener(tenants));
  };
  return {
    getSnapshot: () => tenants,
    subscribe(listener) {
      listeners.add(listener);
      listener(tenants);
      return () => { listeners.delete(listener); };
    },
    async create(draft) {
      const errors = checkTenantDraft(draft);
      if (errors.length > 0) throw new Error(errors[0]);
      if (tenants.some((tenant) => tenant.id === draft.id)) throw new Error(`A tenant with the id "${draft.id}" already exists.`);
      const stamp = new Date().toISOString();
      const tenant: Tenant = { ...draft, name: draft.name.trim(), config: normalizeTenantConfig(draft.config), createdAt: stamp, updatedAt: stamp };
      commit([...tenants, tenant]);
      return tenant;
    },
    async update(id, patch) {
      const current = tenants.find((tenant) => tenant.id === id);
      if (!current) throw new Error(`There is no tenant "${id}".`);
      const next: Tenant = { ...current, name: patch.name?.trim() || current.name, config: normalizeTenantConfig(patch.config ?? current.config), updatedAt: new Date().toISOString() };
      const errors = checkTenantDraft(next);
      if (errors.length > 0) throw new Error(errors[0]);
      commit(tenants.map((tenant) => (tenant.id === id ? next : tenant)));
      return next;
    },
  };
}

export function createTenantsDirectory(mode: Mode): TenantsDirectory {
  return mode === 'firestore' ? createFirestoreDirectory(getFirebase().db) : createMemoryDirectory();
}
