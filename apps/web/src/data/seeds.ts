import { entriesFromCodes } from '@taxo/shared';
import type { Definition, RuleSet } from './types';

// Two shared definitions for the local repository (v3 phase 2): one for every
// platform, one scoped to search, so the platform filter has something to hide.
export const seedDefinitions: Definition[] = [
  {
    id: 'def-market',
    name: 'Market',
    platforms: [],
    entries: [
      { label: 'United Kingdom', code: 'uk' },
      { label: 'United States', code: 'us' },
      { label: 'Germany', code: 'de' },
    ],
    createdBy: 'you',
    updatedBy: 'you',
    createdAt: '2026-09-24T09:00:00.000Z',
    updatedAt: '2026-09-24T09:00:00.000Z',
  },
  {
    id: 'def-objective',
    name: 'Campaign objective',
    platforms: ['google', 'microsoft'],
    entries: [
      { label: 'Awareness', code: 'AWA' },
      { label: 'Conversion', code: 'CON' },
    ],
    createdBy: 'you',
    updatedBy: 'you',
    createdAt: '2026-09-24T09:00:00.000Z',
    updatedAt: '2026-09-24T09:00:00.000Z',
  },
];

// Demo data for the in-memory store (development and tests). Never written to
// Firestore. Created by the local user, who is an admin in development.
export const seedRuleSets: RuleSet[] = [
  {
    id: 'ruleset-global',
    name: 'Global campaign standard',
    createdBy: 'you',
    updatedBy: 'you',
    createdAt: '2024-09-10T09:00:00.000Z',
    updatedAt: '2025-02-21T15:42:00.000Z',
    rules: [
      {
        id: 'rule-initiative',
        key: 'initiative_name',
        name: 'Initiative Name',
        tags: { platform: 'google', entityType: 'campaign' },
        delimiter: '-',
        source: { dataset: 'marketing_dw', table: 'initiatives', nameColumn: 'initiative_id' },
        segments: [
          { id: 'seg-region', kind: 'enum', key: 'region', label: 'Region', required: true, allowedValues: entriesFromCodes(['na', 'emea', 'apac', 'latam']) },
          { id: 'seg-channel', kind: 'enum', key: 'channel', label: 'Channel', required: true, allowedValues: entriesFromCodes(['paid_search', 'paid_social', 'email', 'display', 'partner']) },
          { id: 'seg-initiative', kind: 'freeform', key: 'initiative', label: 'Initiative', required: true, maxLength: 32, illegalChars: [' ', '/', '?', '#', '&'] },
          { id: 'seg-quarter', kind: 'enum', key: 'quarter', label: 'Quarter', required: true, allowedValues: entriesFromCodes(['q1', 'q2', 'q3', 'q4']) },
        ],
      },
    ],
  },
];
