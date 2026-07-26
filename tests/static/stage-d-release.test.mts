import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))

test('Stage D uses the official prebuilt node-pty package without host rebuilds', () => {
  assert.equal(manifest.dependencies['@homebridge/node-pty-prebuilt-multiarch'], undefined)
  assert.equal(manifest.dependencies['node-pty'], '1.2.0-beta.12')
  assert.equal(manifest.build.npmRebuild, false)
  assert.equal(manifest.scripts.postinstall, 'node scripts/verify-node-pty-prebuild.mjs')
  assert.match(readFileSync('src/main/services/claude-process.ts', 'utf8'), /from 'node-pty'/)
  const postinstall = readFileSync('scripts/verify-node-pty-prebuild.mjs', 'utf8')
  assert.match(postinstall, /require\('electron'\)/)
  assert.match(postinstall, /Electron binary hydration failed/)
  assert.match(manifest.scripts['test:static'], /stage-a-safety\.test\.mts .*stage-d-release\.test\.mts/)
  assert.ok(manifest.build.files.includes('!**/*.map'))
})

test('Stage D Windows release icon is a deterministic 256px ICO asset', () => {
  assert.equal(manifest.build.win.icon, 'resources/icon.ico')
  assert.equal(existsSync('resources/icon.ico'), true)
  const icon = readFileSync('resources/icon.ico')
  assert.equal(icon.readUInt16LE(0), 0)
  assert.equal(icon.readUInt16LE(2), 1)
  assert.equal(icon.readUInt16LE(4), 1)
  assert.equal(icon.readUInt8(6), 0)
  assert.equal(icon.readUInt8(7), 0)
  assert.equal(icon.readUInt16LE(12), 32)
  assert.equal(icon.readUInt32LE(18), 22)
})

test('Stage D generated outputs and probe directories stay untracked', () => {
  const ignore = readFileSync('.gitignore', 'utf8')
  assert.match(ignore, /^dist\/$/m)
  assert.match(ignore, /^test-results\/$/m)
  assert.match(ignore, /^playwright-report\/$/m)
  assert.match(ignore, /^\.stage-d-/m)
})

test('Stage D renderer source contains no credential-shaped API key placeholder', () => {
  const settings = readFileSync('src/renderer/components/editors/SettingsEditor.tsx', 'utf8')
  assert.doesNotMatch(settings, /sk-[A-Za-z0-9_-]{16,}/)
})
