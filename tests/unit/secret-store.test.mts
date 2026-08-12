import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FileSecretStore } from '../../src/main/services/secret-store.ts'

function fixture(): { dir: string; store: FileSecretStore } {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workbench-secret-'))
  const store = new FileSecretStore({ storagePath: join(dir, 'secrets.enc'), useScryptFallback: true })
  return { dir, store }
}

test('secret store: set/get/has/list/delete round-trip', async () => {
  const { dir, store } = fixture()
  try {
    assert.equal(await store.hasSecret('api:key'), false)
    assert.equal(await store.getSecret('api:key'), null)
    assert.deepEqual(await store.listRefs(), [])

    await store.setSecret('api:key', 'sk-test-1234567890')
    assert.equal(await store.hasSecret('api:key'), true)
    assert.equal(await store.getSecret('api:key'), 'sk-test-1234567890')
    assert.deepEqual(await store.listRefs(), ['api:key'])

    await store.deleteSecret('api:key')
    assert.equal(await store.hasSecret('api:key'), false)
    assert.equal(await store.getSecret('api:key'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secret store: secrets persist across store instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workbench-secret-'))
  try {
    const path = join(dir, 'secrets.enc')
    const a = new FileSecretStore({ storagePath: path, useScryptFallback: true })
    await a.setSecret('ref-a', 'value-a')
    await a.setSecret('ref-b', 'value-b')

    const b = new FileSecretStore({ storagePath: path, useScryptFallback: true })
    assert.equal(await b.getSecret('ref-a'), 'value-a')
    assert.equal(await b.getSecret('ref-b'), 'value-b')
    assert.deepEqual(await b.listRefs(), ['ref-a', 'ref-b'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secret store: fallback writes the legacy v1 scrypt format', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workbench-secret-'))
  try {
    const path = join(dir, 'secrets.enc')
    const store = new FileSecretStore({ storagePath: path, useScryptFallback: true })
    await store.setSecret('api:key', 'sk-test-1234567890')

    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { version: number; salt: string }
    assert.equal(raw.version, 1)
    assert.ok(raw.salt, 'salt is present')
    // The plaintext must never appear in the file.
    assert.ok(!readFileSync(path, 'utf-8').includes('sk-test-1234567890'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secret store: corrupted file throws a clear error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workbench-secret-'))
  try {
    const path = join(dir, 'secrets.enc')
    writeFileSync(path, 'not-json-at-all', 'utf-8')
    const store = new FileSecretStore({ storagePath: path, useScryptFallback: true })
    await assert.rejects(store.getSecret('api:key'), /SecretStore corrupted or cannot be decrypted/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secret store: tampered ciphertext fails authentication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workbench-secret-'))
  try {
    const path = join(dir, 'secrets.enc')
    const store = new FileSecretStore({ storagePath: path, useScryptFallback: true })
    await store.setSecret('api:key', 'sk-test-1234567890')

    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { ciphertext: string }
    const tampered = raw.ciphertext.slice(0, -2) + (raw.ciphertext.endsWith('AA') ? 'BB' : 'AA')
    writeFileSync(path, JSON.stringify({ ...raw, ciphertext: tampered }), 'utf-8')

    await assert.rejects(store.getSecret('api:key'), /SecretStore corrupted or cannot be decrypted/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
