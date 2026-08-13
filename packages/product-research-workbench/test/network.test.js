import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeUrl, isPublicAddress } from '../src/network.js'

test('classifies private, metadata, documentation, and public IP ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.4.2', '169.254.169.254', '100.64.0.1', '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(address), true, address)
  }
})

test('rejects loopback, metadata aliases, credentials, and non-http protocols', async () => {
  await assert.rejects(assertSafeUrl('http://127.0.0.1/private'), /non-public/)
  await assert.rejects(assertSafeUrl('http://[::1]/private'), /non-public/)
  await assert.rejects(assertSafeUrl('http://169.254.169.254/latest/meta-data'), /non-public/)
  await assert.rejects(assertSafeUrl('http://metadata.google.internal/computeMetadata/v1'), /non-public hostname/)
  await assert.rejects(assertSafeUrl('https://user:secret@example.com'), /credentials/)
  await assert.rejects(assertSafeUrl('file:///etc/passwd'), /Only http and https/)
})
