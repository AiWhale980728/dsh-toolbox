import test from 'node:test'
import assert from 'node:assert/strict'
import { registerStatusTool } from '../src/status.js'

test('registers a non-upgrading scaffold status tool', async () => {
  const registered = []
  registerStatusTool({ tools: { register: tool => registered.push(tool) } })
  assert.equal(registered[0].name, 'compatibility_radar_status')
  assert.match((await registered[0].execute()).boundary, /not auto-upgrade/i)
})
