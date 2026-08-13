import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanPlugin } from '../src/preflight.js'
import { registerPreflightTools } from '../src/tools.js'

test('accepts this package without blocking bundle findings', async () => {
  const result = await scanPlugin(new URL('..', import.meta.url).pathname)
  assert.equal(result.package, '@dsh-toolbox/plugin-preflight')
  assert.equal(result.summary.high, 0)
  assert.match(result.markdown, /Plugin Preflight/)
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
