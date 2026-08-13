import test from 'node:test'
import assert from 'node:assert/strict'
import { registerResearchTools } from '../src/tools.js'

test('registers the seven DSH-facing research tools', () => {
  const registered = []
  const workbench = {
    create() {}, list() {}, get() {}, addSource() {}, extract() {}, analyze() {}, report() {},
  }
  const names = registerResearchTools({ tools: { register: tool => registered.push(tool) } }, workbench)
  assert.deepEqual(names, [
    'research_create', 'research_list', 'research_get', 'research_add_source',
    'research_extract', 'research_analyze', 'research_report',
  ])
  assert.equal(registered.length, 7)
  for (const tool of registered) {
    assert.equal(tool.output.schema.type, 'object')
    assert.equal(typeof tool.execute, 'function')
  }
})
