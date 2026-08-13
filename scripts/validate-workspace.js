import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const rootManifest = JSON.parse(await readFile(join(root.pathname, 'package.json'), 'utf8'))
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
  if (manifest.version !== rootManifest.version) {
    throw new Error(`${packageName}: version ${manifest.version} does not match workspace ${rootManifest.version}`)
  }
  if (manifest.dependencies?.['@deepseek-ai/dsh-tools'] !== '0.1.0-rc.6') {
    throw new Error(`${packageName}: must pin the loader-smoked DSH Tools runtime`)
  }
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error(`${packageName}: missing DSH profile bundle patch`)
  }
  for (const path of ['index.js', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    await access(join(directory, path))
  }
  const patch = await readFile(join(directory, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes(`name: '${manifest.name}'`)) throw new Error(`${packageName}: bundle patch does not mount its package name`)
  if ((manifest.scripts ?? {}).preinstall || (manifest.scripts ?? {}).install || (manifest.scripts ?? {}).postinstall || (manifest.scripts ?? {}).prepare) {
    throw new Error(`${packageName}: install lifecycle scripts require an explicit security review`)
  }
}

console.log(`Validated ${packages.length} DSH profile bundles.`)
