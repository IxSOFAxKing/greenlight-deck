// Bundles the Electron main + preload processes (including @greenlight/platform
// and @greenlight/player/server straight from source) into dist-electron/.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const packages = path.resolve(root, '..')

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  alias: {
    '@greenlight/platform': path.join(packages, 'platform/src/index.ts'),
    '@greenlight/player/server': path.join(packages, 'player/src/server/index.ts'),
  },
}

await build({
  ...shared,
  entryPoints: [path.join(root, 'electron/main.ts')],
  outfile: path.join(root, 'dist-electron/main.cjs'),
})

await build({
  ...shared,
  entryPoints: [path.join(root, 'electron/preload.ts')],
  outfile: path.join(root, 'dist-electron/preload.cjs'),
})
