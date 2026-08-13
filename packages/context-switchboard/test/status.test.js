import test from 'node:test'
import assert from 'node:assert/strict'
import { registerStatusTool } from '../src/status.js'

test('registers a non-mutating scaffold status tool', async () => {
  const registered = []
  registerStatusTool({ tools: { register: tool => registered.push(tool) } })
  assert.equal(registered[0].name, 'context_switchboard_status')
  assert.equal((await registered[0].execute()).ready, false)
})
