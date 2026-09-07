import type { RuleSet as EngineRuleSet } from '@taxo/shared';

// The stored Rule Set document: the engine's shape plus ownership and timestamps.
// This is exactly what lives at /rulesets/{id} in Firestore.
export type RuleSet = EngineRuleSet & {
  ownerId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

export type RuleSetDraft = Pick<RuleSet, 'name' | 'rules'>;
