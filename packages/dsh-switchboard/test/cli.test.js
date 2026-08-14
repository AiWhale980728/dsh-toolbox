import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runCli } from '../src/cli.js'

async function cliFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-switchboard-cli-'))
  const home = join(root, 'home')
  const profile = join(home, 'profiles', 'toolbox')
  const bundle = join(profile, 'node_modules', '@example', 'bundle')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    private: true,
    dependencies: { '@example/bundle': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }, null, 2) + '\n')
  await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(bundle, 'package.json'), JSON.stringify({
    name: '@example/bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n')
  await writeFile(join(bundle, 'cordis.patch.yml'), '[]\n')
  return { root, home, profile }
}

function sink() {
  let value = ''
  return { stream: { write(chunk) { value += String(chunk) } }, value: () => value }
}

test('CLI bundle mutation is dry-run by default and applies only with explicit --apply', async () => {
  const setup = await cliFixture()
  const output = sink()
  const runner = async () => ({ ok: true, code: 0, stdout: '# valid\n', stderr: '' })
  await runCli(['bundle', 'enable', 'toolbox', '@example/bundle', '--home', setup.home, '--data-dir', join(setup.root, 'data')], { stdout: output.stream, commandRunner: runner })
  const plan = JSON.parse(output.value())
  assert.equal(plan.action, 'set-bundle-order')
  assert.deepEqual(JSON.parse(await readFile(join(setup.profile, 'package.json'), 'utf8')).dsh.profile.bundles, ['@deepseek-ai/dsh-base'])

  const applied = sink()
  await runCli(['bundle', 'enable', 'toolbox', '@example/bundle', '--home', setup.home, '--data-dir', join(setup.root, 'data'), '--apply'], { stdout: applied.stream, commandRunner: runner })
  assert.equal(JSON.parse(applied.value()).status, 'applied')
  assert.deepEqual(JSON.parse(await readFile(join(setup.profile, 'package.json'), 'utf8')).dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@example/bundle'])
})

test('CLI saves and applies a reviewable plan file', async () => {
  const setup = await cliFixture()
  const planPath = join(setup.root, 'plan.json')
  const output = sink()
  await runCli(['plan', 'toolbox', '--home', setup.home, '--data-dir', join(setup.root, 'data'), '--bundles', '@deepseek-ai/dsh-base,@example/bundle', '--out', planPath], { stdout: output.stream })
  assert.equal(JSON.parse(output.value()).plan, planPath)
  assert.equal(JSON.parse(await readFile(planPath, 'utf8')).schema, 'dsh-switchboard/change-plan/v1')

  const applied = sink()
  await runCli(['apply', planPath, '--home', setup.home, '--data-dir', join(setup.root, 'data'), '--skip-runtime-validation'], { stdout: applied.stream })
  assert.equal(JSON.parse(applied.value()).result.runtime.skipped, true)
})
