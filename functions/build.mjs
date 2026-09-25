// Bundles the Function with esbuild so @taxo/shared is inlined: pnpm's
// symlinked node_modules are not there at deploy time, so nothing from the
// workspace may be left as an import. The SDKs and the BigQuery client stay
// external and are installed from the generated deploy/package.json, which
// lists the runtime dependencies only (the workspace dev dependency would not
// resolve on the deploy server). deploy/node_modules links to this package's
// so the Firebase CLI can load the code locally to discover the functions.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies);

mkdirSync('deploy', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'deploy/index.js',
  sourcemap: true,
  external,
  logLevel: 'info',
});

writeFileSync('deploy/package.json', `${JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: pkg.type,
  main: 'index.js',
  engines: pkg.engines,
  dependencies: pkg.dependencies,
}, null, 2)}\n`);

if (!existsSync('deploy/node_modules')) symlinkSync('../node_modules', 'deploy/node_modules', 'dir');
