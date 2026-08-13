import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CompatibilityRadar } from '../src/radar.js'
import { satisfiesRange } from '../src/semver.js'

const packagesRoot = new URL('../../', import.meta.url).pathname
const pluginPaths = ['product-research-workbench', 'context-switchboard', 'plugin-preflight', 'compatibility-radar'].map(name => join(packagesRoot, name))

test('supports the common current DSH plugin semver ranges', () => {
  assert.equal(satisfiesRange('0.1.0-rc.6', '>=0.1.0-rc.5 <0.2.0'), true)
  assert.equal(satisfiesRange('0.2.0', '>=0.1.0-rc.5 <0.2.0'), false)
  assert.equal(satisfiesRange('4.0.1', '^4.0.1'), true)
  assert.equal(satisfiesRange('5.0.0', '^4.0.1'), false)
  assert.equal(satisfiesRange('24.1.0', '^22.19.0 || >=24.0.0'), true)
  assert.equal(satisfiesRange('22.19.1', '>=22.19'), true)
  assert.equal(satisfiesRange('22.18.9', '>=22.19'), false)
})

test('saves and diffs compatibility snapshots without upgrading anything', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-radar-'))
  const radar = new CompatibilityRadar({ dataDir })
  try {
    const before = await radar.snapshot({ label: 'rc6', dshToolsVersion: '0.1.0-rc.6', cordisVersion: '4.0.1', nodeVersion: '24.1.0', pluginPaths })
    assert.equal(before.summary.compatible, 4)
    const after = await radar.snapshot({ label: 'breaking', dshToolsVersion: '0.2.0', cordisVersion: '5.0.0', nodeVersion: '24.1.0', pluginPaths })
    assert.equal(after.summary.incompatible, 4)
    const diff = radar.diff({ beforeId: before.id, afterId: after.id })
    assert.equal(diff.upgradeRisk, 'review-required')
    assert.equal(diff.regressions.length, 4)
  } finally {
    radar.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})
