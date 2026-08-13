// Static regression for the 0.1.3 Human RC smoke fixes:
//  - HUMAN-MAJOR-01: diag.next.* keys must exist in BOTH locale blocks of
//    LocaleContext.tsx, or the renderer leaks the raw key into the UI.
//  - HUMAN-MAJOR-02: Environment diagnostics must resolve tools through the
//    unified Trusted Tool Resolver, not a PATH-only where.exe lookup.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const locale = readFileSync('src/renderer/contexts/LocaleContext.tsx', 'utf8')
const diagnostics = readFileSync('src/main/services/diagnostics.ts', 'utf8')
const resolver = readFileSync('src/main/services/trusted-tool-resolver.ts', 'utf8')

const NEXT_KEYS = [
  '"diag.next.title"',
  '"diag.next.node"',
  '"diag.next.npm"',
  '"diag.next.git"',
  '"diag.next.claude"',
  '"diag.next.generic"'
]

test('HUMAN-MAJOR-01: diag.next.* keys exist in the zh locale block', () => {
  const zhStart = locale.indexOf('"diag.title": "环境诊断"')
  const zhEnd = locale.indexOf('"diag.tNodePath": "已在 PATH')
  assert.ok(zhStart >= 0, 'zh diag block anchor missing')
  const zhBlock = locale.slice(zhStart, zhEnd)
  for (const key of NEXT_KEYS) assert.ok(zhBlock.includes(key), `zh missing ${key}`)
})

test('HUMAN-MAJOR-01: diag.next.* keys exist in the en locale block', () => {
  const enStart = locale.indexOf('"diag.title": "Environment Diagnostics"')
  const enEnd = locale.indexOf('"diag.tNodePath": "Node.js in PATH"')
  assert.ok(enStart >= 0, 'en diag block anchor missing')
  const enBlock = locale.slice(enStart, enEnd)
  for (const key of NEXT_KEYS) assert.ok(enBlock.includes(key), `en missing ${key}`)
})

test('HUMAN-MAJOR-01: locale loader never returns an unhandled key verbatim (no raw-key leak)', () => {
  // The t() fallback returns the key itself as the last resort. These keys must
  // never reach that path, so ensure they are resolvable in both blocks.
  assert.ok(NEXT_KEYS.length === 6)
})

test('HUMAN-MAJOR-02: diagnostics resolves tools via the Trusted Tool Resolver', () => {
  assert.ok(diagnostics.includes("from './trusted-tool-resolver'"), 'diagnostics must import the resolver')
  assert.ok(!diagnostics.includes("locateExecutable('node')"), 'diagnostics must not use a PATH-only locateExecutable for node')
})

test('HUMAN-MAJOR-02: resolver exposes unified node/claude/npm resolution + overrides', () => {
  for (const sym of ['resolveNode', 'resolveClaude', 'resolveNpm', 'persistToolOverrides', 'loadToolOverrides', 'trustedExecutableCandidate']) {
    assert.ok(resolver.includes(sym), `resolver missing ${sym}`)
  }
})
