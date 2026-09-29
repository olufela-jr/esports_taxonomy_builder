// Demonstration shared definitions for a tenant's Dictionary (v3 phase 2):
// pure data, no Admin SDK, so tests can import it. `seed-definitions.ts`
// writes the whole list, skipping ids that already exist; `seed-ruleset.ts`
// writes `demoGame` on its own when the demo Rule Set needs it.
import type { Definition } from '@taxo/shared';

export const demoGame: Definition = {
  id: 'demo-game', name: 'Game title', platforms: [], entries: [
    { label: 'League of Legends', code: 'lol' },
    { label: 'Valorant', code: 'val' },
    { label: 'Counter-Strike 2', code: 'cs2' },
    { label: 'Dota 2', code: 'dota' },
    { label: 'Rocket League', code: 'rl' },
  ],
};

export const demoDefinitions: Definition[] = [
  { id: 'demo-market', name: 'Market', platforms: [], entries: [
    { label: 'United Kingdom', code: 'uk' }, { label: 'United States', code: 'us' }, { label: 'Germany', code: 'de' }, { label: 'France', code: 'fr' },
  ] },
  { id: 'demo-objective', name: 'Campaign objective', platforms: [], entries: [
    { label: 'Awareness', code: 'AWA' }, { label: 'Consideration', code: 'CON' }, { label: 'Conversion', code: 'CNV' },
  ] },
  { id: 'demo-funnel', name: 'Funnel stage', platforms: ['meta', 'tiktok', 'snapchat'], entries: [
    { label: 'Top of funnel', code: 'tof' }, { label: 'Mid funnel', code: 'mof' }, { label: 'Bottom of funnel', code: 'bof' },
  ] },
  { id: 'demo-match-type', name: 'Match type', platforms: ['google'], entries: [
    { label: 'Broad', code: 'brd' }, { label: 'Phrase', code: 'phr' }, { label: 'Exact', code: 'exa' },
  ] },
  demoGame,
];
