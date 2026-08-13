import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContextSwitchboard } from '../src/switchboard.js'
import { registerContextTools } from '../src/tools.js'

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
    assert.equal(activated.explicitUseRequired, true)
    assert.equal(board.current({ sessionKey: 's1' }).active.profileName, 'Product research')
    const rolled = board.rollback({ sessionKey: 's1' })
    assert.equal(rolled.rolledBack.profileName, 'Product research')
    assert.equal(rolled.active, null)
  } finally {
    board.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('registers six context tools', () => {
  const names = registerContextTools({ tools: { register() {} } }, {})
  assert.deepEqual(names, ['context_profile_save', 'context_profile_list', 'context_route', 'context_activate', 'context_current', 'context_rollback'])
})
