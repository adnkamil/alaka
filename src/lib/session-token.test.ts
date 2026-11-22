import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashSessionToken } from './session-token'

describe('hashSessionToken', () => {
  it('menghasilkan sha256 hex (64 karakter) yang deterministik', () => {
    const hash = hashSessionToken('abc')
    assert.equal(
      hash,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    assert.equal(hashSessionToken('abc'), hash)
  })

  it('token berbeda menghasilkan hash berbeda dan tidak sama dengan tokennya', () => {
    const token = '3f2b1c9e-8a6d-4f0e-9b7a-1d2c3e4f5a6b'
    assert.notEqual(hashSessionToken(token), token)
    assert.notEqual(hashSessionToken(token), hashSessionToken(`${token}x`))
  })
})
