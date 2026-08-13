import test from 'node:test'
import assert from 'node:assert/strict'
import { registerResearchTools } from '../src/tools.js'

test('registers the twelve DSH-facing research tools', () => {
  const registered = []
  const workbench = {
    create() {}, list() {}, get() {}, addSource() {}, extract() {}, analyze() {}, report() {}, addEvidence() {}, deleteSource() {}, exportProject() {}, importProject() {}, deleteProject() {},
  }
  const names = registerResearchTools({ tools: { register: tool => registered.push(tool) } }, workbench)
  assert.deepEqual(names, [
    'research_create', 'research_list', 'research_get', 'research_add_source',
    'research_extract', 'research_analyze', 'research_report',
    'research_evidence_add', 'research_source_delete', 'research_export', 'research_import', 'research_project_delete',
  ])
  assert.equal(registered.length, 12)
  for (const tool of registered) {
    assert.equal(tool.output.schema.type, 'object')
    assert.equal(typeof tool.execute, 'function')
  }
})
