// Bundles the Function with esbuild so @taxo/shared is inlined: pnpm's
// symlinked node_modules are not there at deploy time, so nothing from the
// workspace may be left as an import. The Firebase SDKs stay external and are
// installed from functions/package.json on deploy.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'lib/index.js',
  sourcemap: true,
  external: ['firebase-functions', 'firebase-admin'],
  logLevel: 'info',
});
