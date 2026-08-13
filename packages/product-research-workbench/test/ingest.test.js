import test from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, htmlTitle, importTextSource } from '../src/ingest.js'

test('extracts conservative plain text without scripts or styles', () => {
  const html = '<html><head><title>Users &amp; Tools</title><style>.x{}</style></head><body><h1>Pain</h1><script>alert(1)</script><p>Manual &lt;work&gt; is difficult.</p></body></html>'
  assert.equal(htmlTitle(html), 'Users & Tools')
  const text = htmlToText(html)
  assert.match(text, /Pain/)
  assert.match(text, /Manual <work> is difficult/)
  assert.doesNotMatch(text, /alert|\.x/)
})

test('caps pasted-text imports by UTF-8 byte length', () => {
  assert.throws(() => importTextSource({ text: '隐私问题', maxSourceBytes: 4 }), /exceeds/)
})
