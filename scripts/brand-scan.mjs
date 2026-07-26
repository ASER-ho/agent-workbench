import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_PATH = resolve(fileURLToPath(import.meta.url))
const SKIPPED_FILES = new Set([SELF_PATH, resolve('tests/static/brand-scan.test.mts')])

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.planning',
  'node_modules',
  'out',
  'dist',
  'playwright-report',
  'test-results'
])

const LEGACY_BRAND_PATTERNS = [
  { kind: 'legacy-product-name', expression: /Claude Workspace Desktop/gi },
  { kind: 'legacy-pascal-product-name', expression: /ClaudeWorkspace/g },
  { kind: 'legacy-product-short-name', expression: /Claude Workspace/gi },
  { kind: 'legacy-chinese-product-name', expression: /Claude 工作区/gi },
  { kind: 'legacy-package-name', expression: /claude-workspace/gi },
  { kind: 'legacy-application-id', expression: /com\.claude\.workspace-desktop/gi }
]

export const PUBLIC_BRAND_TARGETS = [
  'package.json',
  'package-lock.json',
  'src',
  'resources',
  'scripts/verify-packed-app.mjs',
  'README.md',
  'PUBLIC_HISTORY_PROVENANCE.md',
  'docs/PUBLIC_ROADMAP.md',
  'docs/SAFETY_BOUNDARY.md',
  'docs/ENVIRONMENT_ISOLATION.md'
]

export function findLegacyBrandMatches(text) {
  const matches = []
  for (const { kind, expression } of LEGACY_BRAND_PATTERNS) {
    expression.lastIndex = 0
    for (const match of text.matchAll(expression)) {
      matches.push({ kind, index: match.index ?? -1 })
    }
  }
  return matches
}

function collectFiles(target) {
  const absolute = resolve(target)
  if (!existsSync(absolute)) return []
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) return []
  if (stat.isFile()) return SKIPPED_FILES.has(absolute) ? [] : [absolute]
  if (!stat.isDirectory()) return []

  const files = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue
    files.push(...collectFiles(resolve(absolute, entry.name)))
  }
  return files
}

export function scanLegacyBrand(targets = PUBLIC_BRAND_TARGETS) {
  const files = [...new Set(targets.flatMap(collectFiles))]
  const findings = []
  for (const file of files) {
    const matches = findLegacyBrandMatches(readFileSync(file).toString('utf8'))
    if (matches.length > 0) findings.push({ file, matches })
  }
  return { filesScanned: files.length, findings }
}

function runCli() {
  const targets = process.argv.slice(2)
  const result = scanLegacyBrand(targets.length > 0 ? targets : PUBLIC_BRAND_TARGETS)
  const matchCount = result.findings.reduce((sum, finding) => sum + finding.matches.length, 0)
  if (matchCount === 0) {
    console.log(`BRAND_SCAN_PASS files=${result.filesScanned} matches=0`)
    return
  }
  console.error(`BRAND_SCAN_FAIL files=${result.filesScanned} matches=${matchCount}`)
  for (const finding of result.findings) {
    const kinds = [...new Set(finding.matches.map(match => match.kind))].join(',')
    console.error(`${relative(process.cwd(), finding.file)}: ${finding.matches.length} (${kinds})`)
  }
  process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) runCli()
