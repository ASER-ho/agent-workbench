import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findCredentialShapeMatches,
  RELEASE_TEXT_TARGETS,
  scanCredentialShapes
} from '../../scripts/credential-shape-scan.mjs'

test('credential scanner detects representative synthetic shapes', () => {
  const samples = [
    ['sk', 'synthetic012345678901234567890'].join('-'),
    ['ghp', 'Synthetic012345678901234567890'].join('_'),
    ['xoxb', '1234567890', 'synthetic1234567890'].join('-'),
    ['Bearer', 'Synthetic.Token.Value.1234567890'].join(' '),
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    ['https://synthetic-user', 'synthetic-password@example.invalid'].join(':')
  ]
  for (const sample of samples) {
    assert.equal(findCredentialShapeMatches(sample).length > 0, true)
  }
})

test('release text targets contain no credential-shaped values', () => {
  const result = scanCredentialShapes(RELEASE_TEXT_TARGETS)
  assert.deepEqual(result.findings, [])
})
