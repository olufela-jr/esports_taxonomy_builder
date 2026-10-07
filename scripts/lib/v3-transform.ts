// The pure half of the provisioning script: the tenant document and the
// `--platforms` flag. No Firestore here, so it is unit tested without an
// emulator; scripts/provision-user.ts does the reading and writing.
import { isPlatform, PLATFORMS } from '@taxo/shared';
import type { Tenant } from '../../apps/web/src/data/types';

export function tenantDocument(id: string, name: string, allowedDatasets: string[], now: string, platforms: string[] = []): Tenant {
  return {
    id,
    name,
    config: { allowedDatasets, platforms },
    createdAt: now,
    updatedAt: now,
  };
}

// A comma-separated `--platforms` value as the tenant's platform ids (D38):
// trimmed, lowercased, deduplicated, every one a known platform or an error.
export function parsePlatforms(value: string): string[] {
  const ids = [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const unknown = ids.filter((id) => !isPlatform(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown platform(s): ${unknown.join(', ')}. Known: ${PLATFORMS.map((platform) => platform.id).join(', ')}.`);
  }
  return ids;
}
