import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'

import type {
  VerificationChange,
  VerificationChangeState,
  VerificationChangeType,
  VerificationContract,
  VerificationInspection,
  VerificationPathClassification
} from '../../shared/verification-types'
import {
  buildPlainLanguageReceipt,
  classifyVerificationPath,
  normalizeVerificationPath,
  validateVerificationContract
} from '../../shared/verification-validation.ts'

const CONTROL_RE = /[\u0000-\u001f\u007f]/g
const SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+)/gi
const ABSOLUTE_RE = /(?:[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]*)/g
const COMMON_ARGS = [
  '--no-pager',
  '-c', 'color.ui=false',
  '-c', 'core.quotepath=false',
  '-c', 'core.pager=false',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=NUL',
  '-c', 'core.attributesFile=NUL',
  '-c', 'core.excludesFile=NUL',
  '-c', 'diff.external=',
  '-c', 'interactive.diffFilter='
] as const

export interface ParsedPorcelainEntry {
  index: string
  worktree: string
  path: string
  oldPath?: string
}

interface GitCommandResult {
  stdout: Buffer
  stderr: Buffer
  truncated: boolean
  exitCode: number
}

interface GitVerificationOptions {
  gitExecutable?: string
  diffLimitBytes?: number
  timeoutMs?: number
}

export function sanitizeGitError(input: string): string {
  return String(input ?? '')
    .replace(SECRET_RE, '[REDACTED_SECRET]')
    .replace(ABSOLUTE_RE, '[REDACTED_PATH]')
    .replace(CONTROL_RE, ' ')
    .trim()
    .slice(0, 1_000) || 'Git operation failed'
}

function trustedLocalExecutable(candidate: string): string | null {
  const raw = String(candidate ?? '').trim().replace(/^|$/g, '')
  if (!isAbsolute(raw) || !/^[A-Za-z]:[\\/]/.test(raw) || /^(?:\\\\|\\[?.]\\)/.test(raw)) return null
  if (basename(raw).toLocaleLowerCase('en-US') !== 'git.exe') return null
  try {
    const canonical = realpathSync.native(resolve(raw))
    if (!existsSync(canonical) || !statSync(canonical).isFile()) return null
    if (!/^[A-Za-z]:[\\/]/.test(canonical) || /^(?:\\\\|\\[?.]\\)/.test(canonical)) return null
    return canonical
  } catch { return null }
}

export function resolveTrustedGitExecutable(candidates: readonly string[]): string {
  for (const candidate of candidates) {
    const trusted = trustedLocalExecutable(candidate)
    if (trusted) return trusted
  }
  throw new Error('Trusted absolute git.exe is unavailable')
}

function strictDecoder(label: string): TextDecoder | null {
  try { return new TextDecoder(label, { fatal: true }) } catch { return null }
}

export function decodeWhereOutputCandidates(buffer: Buffer): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const attempts: string[] = []
  const gbk = strictDecoder('gbk')
  if (gbk) {
    try { attempts.push(gbk.decode(buffer)) } catch { /* strict decode failed */ }
  }
  const utf8 = strictDecoder('utf-8')
  if (utf8) {
    try { attempts.push(utf8.decode(buffer)) } catch { /* strict decode failed */ }
  }
  for (const text of attempts) {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

export function resolveWhereGitExecutable(): string | null {
  const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
  const wherePath = join(systemRoot, 'System32', 'where.exe')
  if (!existsSync(wherePath)) return null
  const located = spawnSync(wherePath, ['git.exe'], {
    shell: false, windowsHide: true, encoding: 'buffer', timeout: 3_000, maxBuffer: 32 * 1024,
    env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: process.env['PATH'] }
  })
  if (located.status !== 0) return null
  for (const candidate of decodeWhereOutputCandidates(located.stdout)) {
    const trusted = trustedLocalExecutable(candidate)
    if (trusted) return trusted
  }
  return null
}

function discoverTrustedGitExecutable(): string {
  const candidates: string[] = []
  if (process.env['AGENT_WORKBENCH_E2E'] === '1' && process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE']) {
    candidates.push(process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE'])
  }
  const programFiles = process.env['ProgramFiles']
  const localAppData = process.env['LOCALAPPDATA']
  if (programFiles) candidates.push(join(programFiles, 'Git', 'cmd', 'git.exe'), join(programFiles, 'Git', 'bin', 'git.exe'))
  if (localAppData) candidates.push(join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'))
  const viaWhere = resolveWhereGitExecutable()
  if (viaWhere) candidates.push(viaWhere)
  return resolveTrustedGitExecutable(candidates)
}

function safeGitEnv(): NodeJS.ProcessEnv {
  const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
  return {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    TEMP: process.env['TEMP'],
    TMP: process.env['TMP'],
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: 'NUL',
    GIT_CONFIG_COUNT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    LC_ALL: 'C',
    LANG: 'C'
  }
}

function runGit(executable: string, cwd: string, args: readonly string[], limitBytes: number, timeoutMs: number): Promise<GitCommandResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, [...COMMON_ARGS, ...args], {
      cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: safeGitEnv()
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let truncated = false
    let timedOut = false
    const append = (target: Buffer[], chunk: Buffer, isStdout: boolean) => {
      const current = isStdout ? stdoutBytes : stderrBytes
      const limit = isStdout ? limitBytes : 16 * 1024
      const room = Math.max(0, limit - current)
      if (room) target.push(chunk.subarray(0, room))
      if (isStdout) stdoutBytes += Math.min(chunk.length, room)
      else stderrBytes += Math.min(chunk.length, room)
      if (chunk.length > room) truncated = true
    }
    child.stdout.on('data', (chunk: Buffer) => append(stdout, Buffer.from(chunk), true))
    child.stderr.on('data', (chunk: Buffer) => append(stderr, Buffer.from(chunk), false))
    const timer = setTimeout(() => { timedOut = true; try { child.kill() } catch {} }, timeoutMs)
    child.once('error', error => { clearTimeout(timer); rejectRun(new Error(sanitizeGitError(error.message))) })
    child.once('exit', code => {
      clearTimeout(timer)
      const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), truncated, exitCode: code ?? -1 }
      if (timedOut) rejectRun(new Error('Git operation timed out'))
      else resolveRun(result)
    })
  })
}

export function parsePorcelainV1Z(raw: string): ParsedPorcelainEntry[] {
  const fields = raw.split('\0')
  const result: ParsedPorcelainEntry[] = []
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]
    if (!field) continue
    if (field.length < 4) throw new Error('Git status output is malformed')
    const index = field[0]
    const worktree = field[1]
    const path = field.slice(3)
    if ((index === 'R' || index === 'C') && i + 1 < fields.length) {
      result.push({ index, worktree, path, oldPath: fields[++i] })
    } else {
      result.push({ index, worktree, path })
    }
  }
  return result
}

function changeType(entry: ParsedPorcelainEntry): VerificationChangeType {
  const code = entry.index === '?' ? entry.worktree : `${entry.index}${entry.worktree}`
  if (entry.index === 'R' || entry.worktree === 'R') return 'renamed'
  if (entry.index === 'C' || entry.worktree === 'C') return 'copied'
  if (code.includes('D')) return 'deleted'
  if (code.includes('A') || entry.index === '?') return 'added'
  if (code.includes('M')) return 'modified'
  if (/[U]/.test(code) || code === 'AA' || code === 'DD') return 'unmerged'
  return 'unknown'
}

function changeStates(entry: ParsedPorcelainEntry): VerificationChangeState[] {
  if (entry.index === '?' && entry.worktree === '?') return ['untracked']
  const states: VerificationChangeState[] = []
  if (entry.index !== ' ' && entry.index !== '?') states.push('staged')
  if (entry.worktree !== ' ' && entry.worktree !== '?') states.push('unstaged')
  return states
}

function aggregateClassification(classes: VerificationPathClassification[]): VerificationPathClassification {
  if (classes.includes('forbidden')) return 'forbidden'
  if (classes.includes('outsideScope')) return 'outsideScope'
  return 'allowed'
}

function safeRelativePath(value: string): string {
  const normalized = normalizeVerificationPath(value.replace(CONTROL_RE, '_'))
  return normalized.replace(SECRET_RE, '[REDACTED_SECRET]')
}

function displayLabel(value: string): string {
  return value.replace(SECRET_RE, '[REDACTED_SECRET]').replace(CONTROL_RE, '').trim().slice(0, 64) || 'repository'
}

export class GitVerificationService {
  private readonly gitExecutable: string
  private readonly diffLimitBytes: number
  private readonly timeoutMs: number

  constructor(options: GitVerificationOptions = {}) {
    this.gitExecutable = options.gitExecutable
      ? resolveTrustedGitExecutable([options.gitExecutable])
      : discoverTrustedGitExecutable()
    this.diffLimitBytes = Math.max(64, Math.min(4 * 1024 * 1024, options.diffLimitBytes ?? 512 * 1024))
    this.timeoutMs = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 10_000))
  }

  async inspect(workspaceRoot: string, input: unknown): Promise<VerificationInspection> {
    const contract = validateVerificationContract(input)
    const selectedRoot = this.canonicalDirectory(workspaceRoot)
    const rootResult = await runGit(this.gitExecutable, selectedRoot, ['rev-parse', '--show-toplevel'], 16 * 1024, this.timeoutMs)
    if (rootResult.exitCode !== 0 || rootResult.truncated) throw new Error('Selected directory is not a Git repository')
    const reportedRoot = rootResult.stdout.toString('utf8').trim()
    let canonicalReported: string
    try { canonicalReported = realpathSync.native(resolve(reportedRoot)) } catch { throw new Error('Git repository root is unavailable') }
    const fold = (value: string) => process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
    if (fold(canonicalReported) !== fold(selectedRoot)) throw new Error('Selected directory must be the Git repository root')

    const [status, unstagedDiff, stagedDiff, branchResult, headResult] = await Promise.all([
      runGit(this.gitExecutable, selectedRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 4 * 1024 * 1024, this.timeoutMs),
      runGit(this.gitExecutable, selectedRoot, ['diff', '--no-ext-diff', '--no-textconv', '--binary', '--no-color', '--'], this.diffLimitBytes, this.timeoutMs),
      runGit(this.gitExecutable, selectedRoot, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--no-color', '--'], this.diffLimitBytes, this.timeoutMs),
      runGit(this.gitExecutable, selectedRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], 4 * 1024, this.timeoutMs),
      runGit(this.gitExecutable, selectedRoot, ['rev-parse', '--verify', 'HEAD'], 4 * 1024, this.timeoutMs)
    ])
    for (const result of [status, unstagedDiff, stagedDiff, branchResult, headResult]) {
      if (result.exitCode !== 0) throw new Error(sanitizeGitError(result.stderr.toString('utf8')))
    }
    if (status.truncated) throw new Error('Git status output exceeded the safe limit')

    const parsed = parsePorcelainV1Z(status.stdout.toString('utf8'))
    const changes: VerificationChange[] = parsed.map(entry => {
      const rawPaths = entry.oldPath ? [entry.oldPath, entry.path] : [entry.path]
      const normalized = rawPaths.map(normalizeVerificationPath)
      const classification = aggregateClassification(normalized.map(path => classifyVerificationPath(path, contract)))
      const path = safeRelativePath(entry.path)
      const oldPath = entry.oldPath ? safeRelativePath(entry.oldPath) : undefined
      const type = changeType(entry)
      return {
        path,
        ...(oldPath ? { oldPath, newPath: path } : {}),
        changeType: type,
        states: changeStates(entry),
        classification
      }
    })
    const allowedCount = changes.filter(change => change.classification === 'allowed').length
    const forbiddenCount = changes.filter(change => change.classification === 'forbidden').length
    const outsideScopeCount = changes.filter(change => change.classification === 'outsideScope').length
    const truncated = unstagedDiff.truncated || stagedDiff.truncated
    const digest = createHash('sha256')
      .update(status.stdout).update('\0').update(unstagedDiff.stdout).update('\0').update(stagedDiff.stdout)
      .digest('hex').toUpperCase()
    const displayName = displayLabel(basename(selectedRoot))
    const identityHash = createHash('sha256').update(fold(selectedRoot)).digest('hex').slice(0, 8)
    const branch = displayLabel(branchResult.stdout.toString('utf8'))
    const head = headResult.stdout.toString('utf8').trim().replace(/[^a-fA-F0-9]/g, '').slice(0, 12)
    const scopeCompliant = forbiddenCount === 0 && outsideScopeCount === 0
    const receipt = buildPlainLanguageReceipt({
      gitRead: true, scopeCompliant, changedCount: changes.length,
      forbiddenCount, outsideScopeCount, truncated
    })
    return {
      repository: { displayName, displayId: `${displayName} #${identityHash}`, branch, head },
      gitRead: true,
      changes,
      changedCount: changes.length,
      allowedCount,
      forbiddenCount,
      outsideScopeCount,
      unexpectedCount: forbiddenCount + outsideScopeCount,
      scopeCompliant,
      sanitizedSummary: `Changed ${changes.length}; allowed ${allowedCount}; forbidden ${forbiddenCount}; outside scope ${outsideScopeCount}; diff truncated ${truncated ? 'yes' : 'no'}.`,
      truncated,
      diffDigest: digest,
      diffDigestCoverage: truncated ? 'truncated-prefix' : 'complete',
      functionalVerificationPerformed: false,
      receipt
    }
  }

  private canonicalDirectory(value: string): string {
    if (!value || !isAbsolute(value) || /^(?:\\\\|\\[?.]\\)/.test(value)) throw new Error('Selected workspace is unavailable')
    try {
      const canonical = realpathSync.native(resolve(value))
      if (!statSync(canonical).isDirectory()) throw new Error('not a directory')
      return canonical
    } catch { throw new Error('Selected workspace is unavailable') }
  }
}
