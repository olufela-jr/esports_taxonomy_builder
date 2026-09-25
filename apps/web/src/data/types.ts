import type { Definition as EngineDefinition, RuleSet as EngineRuleSet } from '@taxo/shared';

// What every stored document carries besides its own fields. The tenant is the
// path, not a field, so a document can never claim another tenant.
export type Audit = {
  createdBy: string; // uid of the admin who created it; never changes
  updatedBy: string; // uid of the admin who last saved it (D31)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

// The stored Rule Set document: the engine's shape plus audit fields. This is
// exactly what lives at tenants/{tenantId}/rulesets/{id} in Firestore.
export type RuleSet = EngineRuleSet & Audit;

export type RuleSetDraft = Pick<RuleSet, 'name' | 'rules'>;

// A shared definition as stored at tenants/{tenantId}/definitions/{id} (v3 phase 2).
export type Definition = EngineDefinition & Audit;

export type DefinitionDraft = Pick<Definition, 'name' | 'platforms' | 'entries'>;

// The tenant document at tenants/{tenantId}. Written only by the provisioning
// and migration scripts; the app and the scan Function read it.
export type TenantConfig = {
  allowedDatasets: string[]; // BigQuery datasets a scan may read; anything else is refused
  platforms: string[]; // the platforms this tenant uses (v3 phase 2 scopes definitions by them)
};

export type Tenant = {
  id: string;
  name: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
};

// tenants/{tenantId}/users/{uid}: a readable mirror of the custom claims, for
// the admin screens to come. The claims on the token are the truth.
export type TenantUser = {
  uid: string;
  email: string | null;
  role: 'admin' | 'user';
  updatedAt: string;
};
