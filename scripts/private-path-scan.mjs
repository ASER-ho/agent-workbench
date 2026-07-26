import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.planning',
  'node_modules',
  'playwright-report',
  'test-results'
])

const SYSTEM_ROOTS = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata'
])

const CANDIDATE_PATTERNS = [
  {
    kind: 'javascript-escaped-windows-path',
    expression: /\b[A-Za-z]:(?:\\\\)+[^\r\n"'`<>]+/g
  },
  {
    kind: 'raw-windows-path',
    expression: /\b[A-Za-z]:\\(?!\\)[^\r\n"'`<>]+/g
  },
  {
    kind: 'forward-windows-path',
    expression: /\b[A-Za-z]:\/[^\r\n"'`<>]+/g
  },
  {
    kind: 'unix-user-path',
    expression: /\/(?:Users|home)\/[^/\s"'`<>]+\/[^\s"'`<>]+/g
  }
]

function normalizeCandidate(value) {
  return value.replace(/\\\\/g, '\\').replace(/\\/g, '/')
}

function isPrivateCandidate(value, usernames) {
  const normalized = normalizeCandidate(value)
  const lower = normalized.toLowerCase()

  if (lower.startsWith('/users/') || lower.startsWith('/home/')) return true
  if (/^[a-z]:\/\.{3}(?:\s|$)/i.test(normalized)) return false
  if (!/^[a-z]:\//i.test(normalized)) return false

  const segments = normalized.slice(3).split('/').filter(Boolean)
  if (segments.length === 0) return false
  if (segments[0] === '...') return false
  if (SYSTEM_ROOTS.has(segments[0].toLowerCase())) return false
  if (segments[0].toLowerCase() === 'users') return true

  return true
}

export function findPrivatePathMatches(text, options = {}) {
  const usernames = [...new Set(
    (options.usernames ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean)
  )]
  const matches = []

  for (const { kind, expression } of CANDIDATE_PATTERNS) {
    expression.lastIndex = 0
    for (const match of text.matchAll(expression)) {
      if (!isPrivateCandidate(match[0], usernames)) continue
      matches.push({
        kind,
        index: match.index ?? -1,
        normalized: normalizeCandidate(match[0])
      })
    }
  }

  for (const username of usernames) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`\\b${escaped}\\b`, 'gi')
    for (const match of text.matchAll(expression)) {
      matches.push({
        kind: 'local-username',
        index: match.index ?? -1,
        normalized: '[local-username]'
      })
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

export function scanPrivatePaths(targets, options = {}) {
  const files = [...new Set(targets.flatMap(collectFiles))]
  const findings = []

  for (const file of files) {
    const text = readFileSync(file).toString('latin1')
    const matches = findPrivatePathMatches(text, options)
    if (matches.length > 0) {
      findings.push({ file, matches })
    }
  }

  return { filesScanned: files.length, findings }
}

function runCli() {
  const targets = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
  const effectiveTargets = targets.length > 0 ? targets : ['src', 'out']
  const usernames = [process.env.USERNAME]
  const result = scanPrivatePaths(effectiveTargets, { usernames })
  const matchCount = result.findings.reduce((total, finding) => total + finding.matches.length, 0)

  if (matchCount === 0) {
    console.log(`PRIVATE_PATH_SCAN_PASS files=${result.filesScanned} matches=0`)
    return
  }

  console.error(`PRIVATE_PATH_SCAN_FAIL files=${result.filesScanned} matches=${matchCount}`)
  for (const finding of result.findings) {
    const kinds = [...new Set(finding.matches.map((match) => match.kind))].join(',')
    console.error(`${relative(process.cwd(), finding.file)}: ${finding.matches.length} (${kinds})`)
  }
  process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runCli()
}
