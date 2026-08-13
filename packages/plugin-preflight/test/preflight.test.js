import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanPlugin } from '../src/preflight.js'
import { registerPreflightTools } from '../src/tools.js'

test('accepts this package without blocking bundle findings', async () => {
  const result = await scanPlugin(new URL('..', import.meta.url).pathname)
  assert.equal(result.package, '@dsh-toolbox/plugin-preflight')
  assert.equal(result.summary.high, 0)
  assert.match(result.markdown, /Plugin Preflight/)
  assert.match(result.fingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.ok(result.sbom.dependencies.some(item => item.name === '@deepseek-ai/dsh-tools'))
})

test('applies organization policy to otherwise valid packages', async () => {
  const result = await scanPlugin(new URL('..', import.meta.url).pathname, { policy: { allowedLicenses: ['Apache-2.0'] } })
  assert.equal(result.verdict, 'review-required')
  assert.ok(result.findings.some(item => item.code === 'policy-license'))
})

test('flags lifecycle scripts, missing patch, process execution, and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-preflight-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'risky', version: '1.0.0', main: 'index.js', license: 'MIT', scripts: { postinstall: 'node install.js' }, dsh: { bundle: { patch: './missing.yml' } } }))
    await writeFile(join(root, 'index.js'), "import { exec } from 'node:child_process'; exec('whoami')")
    await writeFile(join(root, 'LICENSE'), 'MIT')
    await mkdir(join(root, 'real'))
    await symlink(join(root, 'real'), join(root, 'link'))
    const result = await scanPlugin(root)
    assert.equal(result.verdict, 'review-required')
    for (const code of ['lifecycle-script', 'patch-not-found', 'process-execution', 'symlink-not-followed']) {
      assert.ok(result.findings.some(item => item.code === code), code)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('DSH tool refuses paths outside its active working directory', async () => {
  const registered = []
  registerPreflightTools({ tools: { register: tool => registered.push(tool) } })
  await assert.rejects(
    registered[0].execute({ path: new URL('../../context-switchboard', import.meta.url).pathname }, { agent: { session: { header: { cwd: new URL('..', import.meta.url).pathname } } } }),
    /outside allowed roots/,
  )
})

test('tool report uses a private default directory and escapes hostile HTML', async () => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'dsh-preflight-report-plugin-'))
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-preflight-report-data-'))
  try {
    await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({
      name: '@safe/<img src=x onerror=alert(1)>', version: '1.0.0', main: 'index.js', license: 'MIT',
      files: ['index.js', 'cordis.patch.yml', 'LICENSE'], dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(pluginRoot, 'index.js'), 'export function apply() {}')
    await writeFile(join(pluginRoot, 'cordis.patch.yml'), "- insert:\n    - id: hostile\n      name: '@safe/<img src=x onerror=alert(1)>'\n")
    await writeFile(join(pluginRoot, 'LICENSE'), 'MIT')
    const registered = []
    registerPreflightTools({ tools: { register: tool => registered.push(tool) } }, value => value, { dataDir })
    const result = await registered[1].execute({ path: pluginRoot }, { agent: { session: { header: { cwd: pluginRoot } } } })
    const html = await readFile(result.reports.find(item => item.format === 'html').path, 'utf8')
    assert.doesNotMatch(html, /<img src=x/i)
    assert.match(html, /&lt;img src=x/)
  } finally {
    await rm(pluginRoot, { recursive: true, force: true })
    await rm(dataDir, { recursive: true, force: true })
  }
})
