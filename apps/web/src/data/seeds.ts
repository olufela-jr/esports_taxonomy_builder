import type { RuleSet } from './types';

// Demo data for the in-memory store (development and tests). Never written to Firestore.
export const seedRuleSets: RuleSet[] = [
  {
    id: 'ruleset-global',
    name: 'Global campaign standard',
    ownerId: 'maya',
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
          { id: 'seg-region', kind: 'enum', key: 'region', label: 'Region', required: true, allowedValues: ['na', 'emea', 'apac', 'latam'] },
          { id: 'seg-channel', kind: 'enum', key: 'channel', label: 'Channel', required: true, allowedValues: ['paid_search', 'paid_social', 'email', 'display', 'partner'] },
          { id: 'seg-initiative', kind: 'freeform', key: 'initiative', label: 'Initiative', required: true, maxLength: 32, illegalChars: [' ', '/', '?', '#', '&'] },
          { id: 'seg-quarter', kind: 'enum', key: 'quarter', label: 'Quarter', required: true, allowedValues: ['q1', 'q2', 'q3', 'q4'] },
        ],
      },
    ],
  },
  {
    id: 'ruleset-lifecycle',
    name: 'Lifecycle & CRM',
    ownerId: 'jonah',
    createdAt: '2024-11-04T11:15:00.000Z',
    updatedAt: '2025-02-19T12:18:00.000Z',
    rules: [
      {
        id: 'rule-lifecycle',
        key: 'lifecycle_campaign',
        name: 'Lifecycle Campaign',
        tags: { platform: 'email', entityType: 'campaign' },
        delimiter: '_',
        source: { dataset: 'crm_dw', table: 'campaigns', nameColumn: 'campaign_name' },
        segments: [
          { id: 'seg-motion', kind: 'enum', key: 'motion', label: 'Motion', required: true, allowedValues: ['acq', 'nurture', 'retention', 'winback'] },
          { id: 'seg-audience', kind: 'freeform', key: 'audience', label: 'Audience', required: true, maxLength: 24, illegalChars: [' ', '/', '?', '#', '&'] },
          { id: 'seg-offer', kind: 'freeform', key: 'offer', label: 'Offer', required: false, maxLength: 28, illegalChars: [' ', '/', '?', '#', '&'] },
        ],
      },
    ],
  },
  {
    id: 'ruleset-product',
    name: 'Product launches',
    ownerId: 'alina',
    createdAt: '2025-01-18T08:30:00.000Z',
    updatedAt: '2025-02-14T16:05:00.000Z',
    rules: [
      {
        id: 'rule-launch',
        key: 'launch_code',
        name: 'Launch Code',
        delimiter: '.',
        source: { dataset: 'product_dw', table: 'launches', nameColumn: 'launch_code' },
        segments: [
          { id: 'seg-product', kind: 'enum', key: 'product', label: 'Product', required: true, allowedValues: ['atlas', 'beacon', 'orbit'] },
          { id: 'seg-launch', kind: 'freeform', key: 'launch', label: 'Launch', required: true, maxLength: 36, illegalChars: [' ', '/', '?', '#', '&'] },
          { id: 'seg-market', kind: 'enum', key: 'market', label: 'Market', required: true, allowedValues: ['enterprise', 'midmarket', 'smb'] },
        ],
      },
    ],
  },
];
