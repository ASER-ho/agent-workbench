import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  findLegacyBrandMatches,
  PUBLIC_BRAND_TARGETS,
  scanLegacyBrand
} from '../../scripts/brand-scan.mjs'

test('legacy brand scanner detects product names, package names, and app ids', () => {
  const legacySamples = [
    ['Claude', 'Workspace', 'Desktop'].join(' '),
    ['Claude', 'Workspace'].join(' '),
    ['Claude', 'Workspace', 'Api'].join(''),
    ['claude', 'workspace', 'desktop'].join('-'),
    ['com', 'claude', 'workspace-desktop'].join('.')
  ]
  for (const sample of legacySamples) {
    assert.equal(findLegacyBrandMatches(sample).length > 0, true)
  }
})

test('public product source and current documentation contain no legacy brand identity', () => {
  const result = scanLegacyBrand(PUBLIC_BRAND_TARGETS)
  assert.deepEqual(result.findings, [])
})

test('package and runtime identity are aligned to Agent Workbench', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const mainSource = readFileSync('src/main/index.ts', 'utf8')
  const secretStoreSource = readFileSync('src/main/services/secret-store.ts', 'utf8')

  assert.equal(pkg.name, 'agent-workbench-desktop')
  assert.equal(pkg.build.productName, 'Agent Workbench')
  assert.equal(pkg.build.appId, 'com.agentworkbench.desktop')
  assert.equal(pkg.build.artifactName, 'Agent Workbench Setup ${version}.${ext}')
  assert.equal(pkg.build.win.executableName, 'Agent Workbench')
  assert.equal(pkg.build.nsis.shortcutName, 'Agent Workbench')
  assert.match(mainSource, /app\.setName\('Agent Workbench'\)/)
  assert.match(mainSource, /setAppUserModelId\('com\.agentworkbench\.desktop'\)/)
  assert.doesNotMatch(secretStoreSource, /\.claude-workspace|cwd-v1/)
})

test('public README identifies Agent Workbench as an independent project', () => {
  const readme = readFileSync('README.md', 'utf8')
  assert.match(readme, /^# Agent Workbench$/m)
  assert.match(readme, /independent project/i)
  assert.doesNotMatch(readme, /independent open-source desktop application/i)
  assert.match(readme, /No open-source license has been selected yet/i)
  assert.match(readme, /not affiliated with or endorsed by Anthropic or OpenAI/i)
})
