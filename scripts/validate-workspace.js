import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const packages = [
  'product-research-workbench',
  'context-switchboard',
  'plugin-preflight',
  'compatibility-radar',
]

for (const packageName of packages) {
  const directory = join(root.pathname, 'packages', packageName)
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  if (manifest.name !== `@dsh-toolbox/${packageName}`) {
    throw new Error(`${packageName}: unexpected package name`)
  }
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error(`${packageName}: missing DSH profile bundle patch`)
  }
  for (const path of ['index.js', 'cordis.patch.yml', 'README.md']) {
    await access(join(directory, path))
  }
}

console.log(`Validated ${packages.length} DSH profile bundles.`)
