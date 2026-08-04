// Fail-closed Subject Snapshot capture.
// Runs in the main process: shells out to a fixed set of Git commands and reads
// untracked file content directly. Every input is normalized in a stable order
// and hashed with SHA-256. If any part of the capture cannot be made exact, the
// snapshot is returned with `complete: false` and an `exclusion` reason so it
// can never be used as evidence.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { type Stats, lstatSync, realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import type {
  SubjectSnapshotExclusion,
  VerificationSubjectSnapshot
} from '../../shared/controlled-verification-types.ts'
import { canonicalStringify, sha256Utf8 } from '../utils/evidence-digest.ts'
import {
  type ParsedPorcelainEntry,
  parsePorcelainV1Z,
  resolveTrustedGitExecutable,
  resolveWhereGitExecutable
} from './git-verification.ts'

const CONTROL_RE = /[\u0000-\u001f\u007f]/
const DRIVE_RE = /^[A-Za-z]:/
const UNC_OR_DEVICE_RE = /^(?:\\\\|\/\/|\\[?.]\\)/
const SUBJECT_SEPARATOR = '|'
const DEFAULT_DIFF_LIMIT_BYTES = 512 * 1024
const DEFAULT_UNTRACKED_FILE_LIMIT = 500
const DEFAULT_UNTRACKED_BYTES_LIMIT = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

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

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function fold(value: string): string {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
}

function isWithinRoot(canonical: string, root: string): boolean {
  const separator = process.platform === 'win32' ? '\\' : '/'
  return canonical === root || canonical.startsWith(`${root}${separator}`)
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Fail-closed path check for paths reported by Git. A safe path must be
 * workspace-relative, use `/` separators, contain no traversal/empty/dot
 * segments, and contain no control characters or drive/UNC/device prefixes.
 */
export function isUnsafeGitPath(value: string): boolean {
  if (typeof value !== 'string' || !value) return true
  if (value.includes('\\') || isAbsolute(value) || DRIVE_RE.test(value) || UNC_OR_DEVICE_RE.test(value)) return true
  if (CONTROL_RE.test(value)) return true
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return true
  return false
}

/**
 * Validates every path Git reported (tracked changes plus untracked files).
 * Returns `PATH_ESCAPE` on the first unsafe path, otherwise `null`.
 */
export function validateStatusPaths(entries: readonly Pick<ParsedPorcelainEntry, 'path' | 'oldPath'>[]): SubjectSnapshotExclusion | null {
  for (const entry of entries) {
    if (isUnsafeGitPath(entry.path)) return 'PATH_ESCAPE'
    if (entry.oldPath !== undefined && isUnsafeGitPath(entry.oldPath)) return 'PATH_ESCAPE'
  }
  return null
}

interface GitCommandResult {
  stdout: Buffer
  stderr: Buffer
  truncated: boolean
  exitCode: number
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
    const timer = setTimeout(() => { timedOut = true; try { child.kill() } catch { /* best effort */ } }, timeoutMs)
    child.once('error', error => { clearTimeout(timer); rejectRun(error) })
    child.once('exit', code => {
      clearTimeout(timer)
      const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), truncated, exitCode: code ?? -1 }
      if (timedOut) rejectRun(new Error('Git operation timed out'))
      else resolveRun(result)
    })
  })
}

export interface VerificationSubjectSnapshotOptions {
  gitExecutable?: string
  diffLimitBytes?: number
  untrackedFileLimit?: number
  untrackedBytesLimit?: number
  timeoutMs?: number
  /**
   * Testing seam: replaces the `git status --porcelain` buffer so the fail-closed
   * path validation can be exercised with a path Git itself would never report.
   * Never set outside tests.
   */
  statusOverride?: Buffer
  /**
   * Testing seam: invoked after the initial capture and before the fail-closed
   * recheck, so a mutation can be injected deterministically between the two
   * content reads. Never set outside tests.
   */
  beforeRecheck?: () => void | Promise<void>
}

const DIFF_ARGS = ['--no-ext-diff', '--no-textconv', '--binary', '--no-color', '--']
const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '--untracked-files=all']
const DIFF_CACHED_ARGS = ['diff', '--cached', ...DIFF_ARGS]
const DIFF_WORKTREE_ARGS = ['diff', ...DIFF_ARGS]

export class VerificationSubjectSnapshotService {
  private readonly gitExecutable: string | null
  private readonly diffLimitBytes: number
  private readonly untrackedFileLimit: number
  private readonly untrackedBytesLimit: number
  private readonly timeoutMs: number
  private readonly statusOverride: Buffer | undefined
  private readonly beforeRecheck: (() => void | Promise<void>) | undefined

  constructor(options: VerificationSubjectSnapshotOptions = {}) {
    this.diffLimitBytes = clampInt(options.diffLimitBytes ?? DEFAULT_DIFF_LIMIT_BYTES, 64, 4 * 1024 * 1024)
    this.untrackedFileLimit = clampInt(options.untrackedFileLimit ?? DEFAULT_UNTRACKED_FILE_LIMIT, 1, 1_000_000)
    this.untrackedBytesLimit = clampInt(options.untrackedBytesLimit ?? DEFAULT_UNTRACKED_BYTES_LIMIT, 1, 1_000_000_000)
    this.timeoutMs = clampInt(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, 30_000)
    this.statusOverride = options.statusOverride
    this.beforeRecheck = options.beforeRecheck
    try {
      if (options.gitExecutable) {
        this.gitExecutable = resolveTrustedGitExecutable([options.gitExecutable])
      } else {
        const viaWhere = resolveWhereGitExecutable()
        this.gitExecutable = viaWhere ? resolveTrustedGitExecutable([viaWhere]) : null
      }
    } catch {
      this.gitExecutable = null
    }
  }

  async capture(workspaceRoot: string): Promise<VerificationSubjectSnapshot> {
    const fail = (exclusion: SubjectSnapshotExclusion): VerificationSubjectSnapshot => ({
      repositoryIdentityDigest: '',
      headOid: null,
      stagedDiffDigest: '',
      unstagedDiffDigest: '',
      untrackedContentDigest: '',
      subjectDigest: '',
      complete: false,
      exclusion
    })

    try {
      const git = this.gitExecutable
      if (!git) return fail('SNAPSHOT_INCOMPLETE')

      const root = this.canonicalDirectory(workspaceRoot)

      const toplevelResult = await runGit(git, root, ['rev-parse', '--show-toplevel'], 16 * 1024, this.timeoutMs)
      if (toplevelResult.exitCode !== 0 || toplevelResult.truncated) return fail('SNAPSHOT_INCOMPLETE')
      let canonicalToplevel: string
      try {
        canonicalToplevel = realpathSync.native(resolve(toplevelResult.stdout.toString('utf8').trim()))
      } catch {
        return fail('SNAPSHOT_INCOMPLETE')
      }
      if (fold(canonicalToplevel) !== fold(root)) return fail('SNAPSHOT_INCOMPLETE')

      const originResult = await runGit(git, root, ['config', '--get', 'remote.origin.url'], 4 * 1024, this.timeoutMs)
      const origin = originResult.exitCode === 0 && !originResult.truncated
        ? (originResult.stdout.toString('utf8').trim() || null)
        : null

      const headResult = await runGit(git, root, ['rev-parse', '--verify', '--quiet', 'HEAD'], 4 * 1024, this.timeoutMs)
      let headOid: string | null
      if (headResult.exitCode === 0) {
        const oid = headResult.stdout.toString('utf8').trim()
        if (!/^[0-9a-fA-F]{40,64}$/.test(oid)) return fail('SNAPSHOT_INCOMPLETE')
        headOid = oid
      } else {
        const symref = await runGit(git, root, ['symbolic-ref', '-q', 'HEAD'], 4 * 1024, this.timeoutMs)
        if (symref.exitCode === 0) headOid = null
        else return fail('SNAPSHOT_INCOMPLETE')
      }

      const stagedResult = await runGit(git, root, DIFF_CACHED_ARGS, this.diffLimitBytes, this.timeoutMs)
      const unstagedResult = await runGit(git, root, DIFF_WORKTREE_ARGS, this.diffLimitBytes, this.timeoutMs)
      if (stagedResult.exitCode !== 0 || unstagedResult.exitCode !== 0) return fail('SNAPSHOT_INCOMPLETE')
      if (stagedResult.truncated || unstagedResult.truncated) return fail('DIFF_LIMIT_EXCEEDED')

      const statusBuffer = this.statusOverride ?? await this.readStatus(git, root)
      let entries: ParsedPorcelainEntry[]
      try {
        entries = parsePorcelainV1Z(statusBuffer.toString('utf8'))
      } catch {
        return fail('SNAPSHOT_INCOMPLETE')
      }
      const pathExclusion = validateStatusPaths(entries)
      if (pathExclusion) return fail(pathExclusion)

      const untrackedPaths = entries
        .filter(entry => entry.index === '?' && entry.worktree === '?')
        .map(entry => entry.path)
        .sort()
      if (untrackedPaths.length > this.untrackedFileLimit) return fail('UNTRACKED_LIMIT_EXCEEDED')

      const fileDigests: Array<{ path: string; contentDigest: string }> = []
      let totalBytes = 0
      for (const path of untrackedPaths) {
        const abs = join(root, path)
        const stats = this.safePathStats(root, path)
        if (!stats) return fail('UNSAFE_SYMLINK_OR_REPARSE')
        if (stats.size > this.untrackedBytesLimit - totalBytes) return fail('UNTRACKED_LIMIT_EXCEEDED')
        let buffer: Buffer
        try {
          buffer = await readFile(abs)
        } catch {
          return fail('FILE_CHANGED_DURING_CAPTURE')
        }
        totalBytes += buffer.byteLength
        if (totalBytes > this.untrackedBytesLimit) return fail('UNTRACKED_LIMIT_EXCEEDED')
        fileDigests.push({ path, contentDigest: sha256Hex(buffer) })
      }

      if (this.beforeRecheck) await this.beforeRecheck()

      // Fail-closed recheck: every component is captured again and must be
      // byte-identical, otherwise the state changed while we were reading.
      const headAgain = await runGit(git, root, ['rev-parse', '--verify', '--quiet', 'HEAD'], 4 * 1024, this.timeoutMs)
      const headAgainOid = headAgain.exitCode === 0 ? (headAgain.stdout.toString('utf8').trim() || null) : null
      if (headAgainOid !== headOid) return fail('FILE_CHANGED_DURING_CAPTURE')

      const stagedAgain = await runGit(git, root, DIFF_CACHED_ARGS, this.diffLimitBytes, this.timeoutMs)
      const unstagedAgain = await runGit(git, root, DIFF_WORKTREE_ARGS, this.diffLimitBytes, this.timeoutMs)
      if (stagedAgain.exitCode !== 0 || unstagedAgain.exitCode !== 0) return fail('SNAPSHOT_INCOMPLETE')
      if (stagedAgain.truncated || unstagedAgain.truncated) return fail('FILE_CHANGED_DURING_CAPTURE')
      if (!stagedAgain.stdout.equals(stagedResult.stdout)) return fail('FILE_CHANGED_DURING_CAPTURE')
      if (!unstagedAgain.stdout.equals(unstagedResult.stdout)) return fail('FILE_CHANGED_DURING_CAPTURE')

      const statusAgainBuffer = this.statusOverride ?? await this.readStatus(git, root)
      let entriesAgain: ParsedPorcelainEntry[]
      try {
        entriesAgain = parsePorcelainV1Z(statusAgainBuffer.toString('utf8'))
      } catch {
        return fail('SNAPSHOT_INCOMPLETE')
      }
      const untrackedAgain = entriesAgain
        .filter(entry => entry.index === '?' && entry.worktree === '?')
        .map(entry => entry.path)
        .sort()
      if (untrackedAgain.length !== untrackedPaths.length || untrackedAgain.some((path, index) => path !== untrackedPaths[index])) {
        return fail('FILE_CHANGED_DURING_CAPTURE')
      }
      const digestByPath = new Map(fileDigests.map(entry => [entry.path, entry.contentDigest]))
      for (const path of untrackedPaths) {
        let buffer: Buffer
        try {
          buffer = await readFile(join(root, path))
        } catch {
          return fail('FILE_CHANGED_DURING_CAPTURE')
        }
        if (sha256Hex(buffer) !== digestByPath.get(path)) return fail('FILE_CHANGED_DURING_CAPTURE')
      }

      const repositoryIdentityDigest = sha256Utf8(canonicalStringify({ toplevel: fold(canonicalToplevel), origin }))
      const stagedDiffDigest = sha256Utf8(canonicalStringify({ field: 'stagedDiff', content: stagedResult.stdout.toString('utf8') }))
      const unstagedDiffDigest = sha256Utf8(canonicalStringify({ field: 'unstagedDiff', content: unstagedResult.stdout.toString('utf8') }))
      const untrackedContentDigest = sha256Utf8(canonicalStringify(fileDigests.map(entry => ({ path: entry.path, contentDigest: entry.contentDigest }))))
      const subjectDigest = sha256Utf8([
        repositoryIdentityDigest,
        headOid === null ? '' : headOid,
        stagedDiffDigest,
        unstagedDiffDigest,
        untrackedContentDigest
      ].join(SUBJECT_SEPARATOR))

      return {
        repositoryIdentityDigest,
        headOid,
        stagedDiffDigest,
        unstagedDiffDigest,
        untrackedContentDigest,
        subjectDigest,
        complete: true
      }
    } catch {
      return fail('SNAPSHOT_INCOMPLETE')
    }
  }

  private async readStatus(git: string, root: string): Promise<Buffer> {
    const result = await runGit(git, root, STATUS_ARGS, 4 * 1024 * 1024, this.timeoutMs)
    if (result.exitCode !== 0 || result.truncated) throw new Error('Git status failed')
    return result.stdout
  }

  /**
   * Walks every path component below the repository root, rejecting symlinks,
   * junctions/reparse points, and any final path whose native realpath escapes
   * the root. Returns the final component's lstat on success, or `null` when
   * the path cannot be safely judged.
   */
  private safePathStats(root: string, relative: string): Stats | null {
    const parts = relative.split('/')
    let current = root
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index])
      let stats: Stats
      try {
        stats = lstatSync(current)
      } catch {
        return null
      }
      if (stats.isSymbolicLink()) return null
      if (index === parts.length - 1) {
        try {
          const canonical = realpathSync.native(current)
          if (!isWithinRoot(fold(canonical), fold(root))) return null
        } catch {
          return null
        }
        return stats
      }
    }
    return null
  }

  private canonicalDirectory(value: string): string {
    if (!value || !isAbsolute(value) || /^(?:\\\\|\\[?.]\\)/.test(value)) throw new Error('Selected workspace is unavailable')
    try {
      const canonical = realpathSync.native(resolve(value))
      if (!statSync(canonical).isDirectory()) throw new Error('not a directory')
      return canonical
    } catch {
      throw new Error('Selected workspace is unavailable')
    }
  }
}
