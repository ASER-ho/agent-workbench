import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.planning',
  'node_modules',
  'dist',
  'playwright-report',
  'test-results'
])

const CREDENTIAL_PATTERNS = [
  { kind: 'openai-token', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'github-token', expression: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: 'slack-token', expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { kind: 'bearer-value', expression: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b/gi },
  { kind: 'private-key-header', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: 'url-embedded-credential', expression: /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/gi }
]

export const RELEASE_TEXT_TARGETS = [
  'package.json',
  'package-lock.json',
  'src',
  'out',
  'resources',
  'README.md',
  'IMPLEMENTATION_SOURCE_OF_TRUTH.md',
  'KNOWN_RISKS.md',
  'PROJECT_DECISION_LOG.md',
  'TASK_BOARD.md',
  'docs/PRODUCT_BACKLOG_FULL.md',
  'docs/PUBLIC_ROADMAP.md'
]

export function findCredentialShapeMatches(text) {
  const matches = []
  for (const { kind, expression } of CREDENTIAL_PATTERNS) {
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
  if (stat.isFile()) return [absolute]
  if (!stat.isDirectory()) return []

  const files = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue
    files.push(...collectFiles(resolve(absolute, entry.name)))
  }
  return files
}

export function scanCredentialShapes(targets = RELEASE_TEXT_TARGETS) {
  const files = [...new Set(targets.flatMap(collectFiles))]
  const findings = []
  for (const file of files) {
    const matches = findCredentialShapeMatches(readFileSync(file).toString('latin1'))
    if (matches.length > 0) findings.push({ file, matches })
  }
  return { filesScanned: files.length, findings }
}

function runCli() {
  const targets = process.argv.slice(2)
  const result = scanCredentialShapes(targets.length > 0 ? targets : RELEASE_TEXT_TARGETS)
  const matchCount = result.findings.reduce((sum, finding) => sum + finding.matches.length, 0)
  if (matchCount === 0) {
    console.log(`CREDENTIAL_SHAPE_SCAN_PASS files=${result.filesScanned} matches=0`)
    return
  }
  console.error(`CREDENTIAL_SHAPE_SCAN_FAIL files=${result.filesScanned} matches=${matchCount}`)
  for (const finding of result.findings) {
    const kinds = [...new Set(finding.matches.map(match => match.kind))].join(',')
    console.error(`${relative(process.cwd(), finding.file)}: ${finding.matches.length} (${kinds})`)
  }
  process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) runCli()
