import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContextSwitchboard } from '../src/switchboard.js'
import { registerContextTools } from '../src/tools.js'
import { registerRuntimeContext } from '../src/runtime.js'

test('routes, activates, and rolls back explicit context receipts', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-context-'))
  const board = new ContextSwitchboard({ dataDir })
  try {
    const research = board.saveProfile({ name: 'Product research', keywords: ['research', '竞品'], instructions: 'Cite every claim.', resources: ['research-notes/'], tokenBudget: 300 })
    board.saveProfile({ name: 'Coding', keywords: ['bug', 'code'], instructions: 'Run tests.' })
    const route = board.route({ task: '研究竞品并做 product research' })
    assert.equal(route.selected.profileId, research.profile.id)
    assert.equal(route.changed, false)
    const activated = board.activate({ sessionKey: 's1', profileId: research.profile.id, task: route.task })
    assert.match(activated.receipt.contextPacket, /Cite every claim/)
    assert.equal(activated.injectedOnNextAssembly, true)
    assert.match(board.contextForAgent({ session: { id: 's1' } }), /Cite every claim/)
    assert.equal(board.current({ sessionKey: 's1' }).active.profileName, 'Product research')
    const rolled = board.rollback({ sessionKey: 's1' })
    assert.equal(rolled.rolledBack.profileName, 'Product research')
    assert.equal(rolled.active, null)
  } finally {
    board.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('exports, imports, diagnoses, and preserves an activation stack', async () => {
  const leftDir = await mkdtemp(join(tmpdir(), 'dsh-context-left-'))
  const rightDir = await mkdtemp(join(tmpdir(), 'dsh-context-right-'))
  const left = new ContextSwitchboard({ dataDir: leftDir })
  const right = new ContextSwitchboard({ dataDir: rightDir })
  try {
    const a = left.saveProfile({ name: 'A', keywords: ['shared'], instructions: 'A instructions' }).profile
    const b = left.saveProfile({ name: 'B', keywords: ['shared'], negativeKeywords: ['skip'], instructions: 'B instructions', priority: 10 }).profile
    assert.equal(left.route({ task: 'shared skip' }).selected.profileId, a.id)
    left.activate({ sessionKey: 'stack', profileId: a.id })
    left.activate({ sessionKey: 'stack', profileId: b.id })
    assert.equal(left.current({ sessionKey: 'stack' }).active.profileName, 'B')
    assert.equal(left.rollback({ sessionKey: 'stack' }).active.profileName, 'A')
    assert.equal(left.history({ sessionKey: 'stack' }).activations.length, 2)
    assert.equal(left.diagnose().conflicts[0].keyword, 'shared')
    const imported = right.importProfiles({ document: left.exportProfiles() })
    assert.equal(imported.imported, 2)
  } finally {
    left.close(); right.close()
    await rm(leftDir, { recursive: true, force: true }); await rm(rightDir, { recursive: true, force: true })
  }
})

test('registers ten context tools', () => {
  const names = registerContextTools({ tools: { register() {} } }, {})
  assert.deepEqual(names, ['context_profile_save', 'context_profile_list', 'context_route', 'context_activate', 'context_current', 'context_rollback', 'context_history', 'context_profile_export', 'context_profile_import', 'context_diagnose'])
})

test('registers one DSH native runtime-context provider', () => {
  let definition
  const dispose = () => {}
  const returned = registerRuntimeContext({ systemPrompt: { context(value) { definition = value; return dispose } } }, {
    contextForAgent(agent) { return agent?.session?.id === 'native' ? 'active packet' : '' },
  })
  assert.equal(returned, dispose)
  assert.equal(definition.name, 'dsh-toolbox:context-switchboard')
  assert.equal(definition.text({ agent: { session: { id: 'native' } } }), 'active packet')
})

test('migrates an Alpha database without losing profiles', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-context-alpha-'))
  const path = join(dataDir, 'context.sqlite3')
  const alpha = new DatabaseSync(path)
  alpha.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL,
      keywords_json TEXT NOT NULL, instructions TEXT NOT NULL, resources_json TEXT NOT NULL,
      token_budget INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE activations (
      id TEXT PRIMARY KEY, session_key TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
      task TEXT NOT NULL, score REAL NOT NULL, context_packet TEXT NOT NULL, created_at TEXT NOT NULL,
      rolled_back_at TEXT
    );
    INSERT INTO profiles VALUES ('alpha-id', 'Alpha profile', '', '["alpha"]', 'Keep this.', '[]', 500, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `)
  alpha.close()
  const board = new ContextSwitchboard({ dataDir })
  try {
    const item = board.listProfiles().profiles[0]
    assert.equal(item.name, 'Alpha profile')
    assert.deepEqual(item.negativeKeywords, [])
    assert.equal(item.priority, 0)
    assert.equal(item.enabled, true)
  } finally {
    board.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})
