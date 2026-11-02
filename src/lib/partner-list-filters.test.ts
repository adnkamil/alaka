import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { escapeLike } from './partner-list-filters.ts'

describe('escapeLike', () => {
  it('membiarkan teks biasa', () => {
    assert.equal(escapeLike('kereta bayi'), 'kereta bayi')
  })
  it('menetralkan karakter pola', () => {
    assert.equal(escapeLike('50%'), '50\\%')
    assert.equal(escapeLike('a_b'), 'a\\_b')
    assert.equal(escapeLike('a\\b'), 'a\\\\b')
  })
})
