// Tenants themselves, managed by the super user from the Tenants screen:
// create one, edit its name and config. Pure logic over a two-method store
// port; index.ts binds Firestore. Membership of a new tenant starts with the
// super user inviting its first admin (members.ts, with a tenantId).
import { HttpsError } from 'firebase-functions/v2/https';
import { isPlatform, PLATFORMS } from '@taxo/shared';
import type { CallerAuth } from './tenant';
import { superFromAuth } from './tenant';

export type TenantConfig = {
  allowedDatasets: string[];
  platforms: string[];
};

export type TenantDocument = {
  id: string;
  name: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
};

export type TenantsStore = {
  getTenant(id: string): Promise<TenantDocument | null>;
  writeTenant(tenant: TenantDocument): Promise<void>;
};

export type TenantPorts = {
  store: TenantsStore;
  now(): string;
};

const TENANT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const DATASET = /^[A-Za-z0-9_]+$/;

function parseId(value: unknown): string {
  if (typeof value !== 'string' || !TENANT_ID.test(value)) {
    throw new HttpsError('invalid-argument', 'A tenant id is lowercase letters, digits and hyphens, 2 to 63 characters.');
  }
  return value;
}

function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new HttpsError('invalid-argument', 'A tenant needs a name.');
  }
  return name;
}

function parseList(value: unknown, what: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HttpsError('invalid-argument', `${what} must be a list of strings.`);
  }
  return [...new Set((value as string[]).map((item) => item.trim()).filter(Boolean))];
}

export function parseConfig(value: unknown): TenantConfig {
  const candidate = (value ?? {}) as { allowedDatasets?: unknown; platforms?: unknown };
  const allowedDatasets = parseList(candidate.allowedDatasets, 'allowedDatasets');
  const badDataset = allowedDatasets.find((dataset) => !DATASET.test(dataset));
  if (badDataset) {
    throw new HttpsError('invalid-argument', `Dataset "${badDataset}" is not a valid BigQuery dataset id (letters, digits and underscores).`);
  }
  const platforms = parseList(candidate.platforms, 'platforms').map((id) => id.toLowerCase());
  const unknown = platforms.filter((id) => !isPlatform(id));
  if (unknown.length > 0) {
    throw new HttpsError('invalid-argument', `Unknown platform(s): ${unknown.join(', ')}. Known: ${PLATFORMS.map((platform) => platform.id).join(', ')}.`);
  }
  return { allowedDatasets: allowedDatasets.sort(), platforms };
}

export async function createTenant(ports: TenantPorts, auth: CallerAuth, data: unknown): Promise<TenantDocument> {
  superFromAuth(auth);
  const candidate = (data ?? {}) as { id?: unknown; name?: unknown; config?: unknown };
  const id = parseId(candidate.id);
  const name = parseName(candidate.name);
  const config = parseConfig(candidate.config);
  if (await ports.store.getTenant(id)) {
    throw new HttpsError('already-exists', `A tenant with the id "${id}" already exists.`);
  }
  const now = ports.now();
  const tenant: TenantDocument = { id, name, config, createdAt: now, updatedAt: now };
  await ports.store.writeTenant(tenant);
  return tenant;
}

export async function updateTenant(ports: TenantPorts, auth: CallerAuth, data: unknown): Promise<TenantDocument> {
  superFromAuth(auth);
  const candidate = (data ?? {}) as { id?: unknown; name?: unknown; config?: unknown };
  const id = parseId(candidate.id);
  const current = await ports.store.getTenant(id);
  if (!current) {
    throw new HttpsError('not-found', `There is no tenant "${id}".`);
  }
  const tenant: TenantDocument = {
    ...current,
    name: candidate.name === undefined ? current.name : parseName(candidate.name),
    config: candidate.config === undefined ? current.config : parseConfig(candidate.config),
    updatedAt: ports.now(),
  };
  await ports.store.writeTenant(tenant);
  return tenant;
}
