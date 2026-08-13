// Unified trusted tool resolution for the Main process.
//
// This is the single source of truth for Node.js, Claude CLI, and npm. Both the
// Environment Diagnostics surface and the Verification engine resolve tools
// through here, so they can never disagree about which Node/npm/Claude is in use.
//
// Discovery is deterministic and bounded:
//   node   : AGENT_WORKBENCH_NODE_EXECUTABLE -> user override -> %ProgramFiles%\nodejs
//            -> %LOCALAPPDATA%\Programs\nodejs -> trusted where.exe
//   claude : user override -> trusted where.exe -> known AppData locations
//   npm    : derived from the trusted Node (npm.cmd / npm-cli.js beside node.exe),
//            then trusted where.exe as a fallback
//
// Every candidate must pass `trustedExecutableCandidate`: canonical drive-letter
// absolute path, exact basename, realpath, regular file. UNC/device paths and
// relative paths are never trusted. The renderer may supply only an override
// path which is re-validated here; it can never force a resolution.

import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'

import { decodeWhereOutputCandidates } from './git-verification.ts'

const UNC_OR_DEVICE_RE = /^(?:\\\\|\\[?.]\\)/

export type ToolKind = 'node' | 'claude' | 'npm'

export type ToolSource =
  | 'override'
  | 'environment'
  | 'standard-location'
  | 'path'
  | 'derived-from-node'
  | 'not-found'

export interface ResolvedTool {
  kind: ToolKind
  found: boolean
  executable: string | null
  version: string | null
  source: ToolSource
  reason?: string
}

export interface ToolOverrides {
  node?: string
  claude?: string
}

const EXPECTED_BASENAME: Record<ToolKind, string[]> = {
  node: ['node.exe'],
  claude: ['claude.exe'],
  npm: ['npm.cmd', 'npm-cli.js']
}

function isTrustedLocalPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) && !UNC_OR_DEVICE_RE.test(value)
}

/**
 * Validates a single executable candidate and returns its canonical path when
 * trusted, otherwise null. Must be a drive-letter absolute path whose basename
 * is one of the expected names, resolve through realpath, exist, and be a
 * regular file.
 */
export function trustedExecutableCandidate(candidate: unknown, kind: ToolKind): string | null {
  if (typeof candidate !== 'string') return null
  const raw = candidate.trim()
  if (!raw || !isAbsolute(raw) || !isTrustedLocalPath(raw)) return null
  const expected = EXPECTED_BASENAME[kind].map((b) => b.toLowerCase())
  if (!expected.includes(basename(raw).toLowerCase())) return null
  try {
    const canonical = realpathSync.native(resolve(raw))
    if (!isTrustedLocalPath(canonical)) return null
    if (!expected.includes(basename(canonical).toLowerCase())) return null
    if (!existsSync(canonical) || !statSync(canonical).isFile()) return null
    return canonical
  } catch {
    return null
  }
}

function readVersion(executable: string, args: string[], timeout = 5000): string | null {
  try {
    const out = spawnSync(executable, args, { shell: false, windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 })
    if (out.status !== 0) return null
    const v = (out.stdout || '').trim().split(/\r?\n/)[0]
    return v || null
  } catch {
    return null
  }
}

function whereExecutable(name: string): string[] {
  const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
  const wherePath = join(systemRoot, 'System32', 'where.exe')
  if (!existsSync(wherePath)) return []
  const located = spawnSync(wherePath, [name], {
    shell: false, windowsHide: true, encoding: 'buffer', timeout: 3_000, maxBuffer: 32 * 1024,
    env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: process.env['PATH'] }
  })
  if (located.status !== 0) return []
  return decodeWhereOutputCandidates(located.stdout)
}

// ─── Tool override persistence (lazy Electron, like SecretStore) ─────────────

let userDataDir: string | null | undefined
function getUserDataDir(): string | null {
  if (userDataDir === undefined) {
    try {
      // electron is externalized in the main-process bundle; in a plain Node
      // test process this require throws and is caught here.
      const electron = require('electron') as typeof import('electron')
      userDataDir = electron.app.getPath('userData')
    } catch {
      userDataDir = null
    }
  }
  return userDataDir
}

/** Test seam: point override storage at a specific directory. */
export function __setToolOverrideDir(dir: string | null): void {
  userDataDir = dir
}

function overrideFilePath(): string | null {
  const base = getUserDataDir()
  return base ? join(base, 'tool-overrides.json') : null
}

export function loadToolOverrides(): ToolOverrides {
  const path = overrideFilePath()
  if (!path || !existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const rec = parsed as Record<string, unknown>
    const result: ToolOverrides = {}
    if (typeof rec['node'] === 'string') result.node = rec['node']
    if (typeof rec['claude'] === 'string') result.claude = rec['claude']
    return result
  } catch {
    return {}
  }
}

export function persistToolOverrides(overrides: ToolOverrides): void {
  const path = overrideFilePath()
  if (!path) return
  mkdirSync(dirname(path), { recursive: true })
  const clean: Record<string, string> = {}
  if (overrides.node) clean['node'] = overrides.node
  if (overrides.claude) clean['claude'] = overrides.claude
  writeFileSync(path, JSON.stringify(clean, null, 2), 'utf8')
}

// ─── Resolvers ───────────────────────────────────────────────────────────────

export function resolveNode(): ResolvedTool {
  const overrides = loadToolOverrides()

  // 1. environment (still must pass validation)
  const envNode = process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
  if (envNode) {
    const c = trustedExecutableCandidate(envNode, 'node')
    if (c) return { kind: 'node', found: true, executable: c, version: readVersion(c, ['--version']), source: 'environment' }
  }

  // 2. user override
  if (overrides.node) {
    const c = trustedExecutableCandidate(overrides.node, 'node')
    if (c) return { kind: 'node', found: true, executable: c, version: readVersion(c, ['--version']), source: 'override' }
  }

  // 3. standard install locations
  const programFiles = process.env['ProgramFiles']
  const localAppData = process.env['LOCALAPPDATA']
  for (const dir of [programFiles ? join(programFiles, 'nodejs', 'node.exe') : null,
                    localAppData ? join(localAppData, 'Programs', 'nodejs', 'node.exe') : null]) {
    if (!dir) continue
    const c = trustedExecutableCandidate(dir, 'node')
    if (c) return { kind: 'node', found: true, executable: c, version: readVersion(c, ['--version']), source: 'standard-location' }
  }

  // 4. trusted where.exe
  for (const candidate of whereExecutable('node.exe')) {
    const c = trustedExecutableCandidate(candidate, 'node')
    if (c) return { kind: 'node', found: true, executable: c, version: readVersion(c, ['--version']), source: 'path' }
  }

  return { kind: 'node', found: false, executable: null, version: null, source: 'not-found', reason: 'No trusted node.exe found via environment, override, standard install locations, or PATH' }
}

export function resolveClaude(): ResolvedTool {
  const overrides = loadToolOverrides()

  // 1. user override
  if (overrides.claude) {
    const c = trustedExecutableCandidate(overrides.claude, 'claude')
    if (c) return { kind: 'claude', found: true, executable: c, version: readVersion(c, ['--version']), source: 'override' }
  }

  // 2. trusted where.exe
  for (const candidate of whereExecutable('claude.exe')) {
    const c = trustedExecutableCandidate(candidate, 'claude')
    if (c) return { kind: 'claude', found: true, executable: c, version: readVersion(c, ['--version']), source: 'path' }
  }

  // 3. known AppData locations
  const candidates = [
    join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    join(homedir(), 'AppData', 'Local', 'anthropic', 'claude', 'claude.exe')
  ]
  for (const candidate of candidates) {
    const c = trustedExecutableCandidate(candidate, 'claude')
    if (c) return { kind: 'claude', found: true, executable: c, version: readVersion(c, ['--version']), source: 'standard-location' }
  }

  return { kind: 'claude', found: false, executable: null, version: null, source: 'not-found', reason: 'No trusted claude.exe found via override, PATH, or known AppData locations' }
}

/** npm is derived from the trusted Node installation (same directory). */
export function resolveNpm(nodeExecutable: string | null): ResolvedTool {
  if (nodeExecutable) {
    const dir = dirname(nodeExecutable)
    const npmCmd = join(dir, 'npm.cmd')
    const npmCli = join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js')

    // npm.cmd beside node.exe (canonical, regular file)
    const cmdCandidate = trustedExecutableCandidate(npmCmd, 'npm')
    if (cmdCandidate) {
      // Read the version via the node executable + npm-cli.js when present, else
      // by running npm.cmd directly.
      const version = existsSync(npmCli) ? readVersion(nodeExecutable, [npmCli, '--version']) : readVersion(cmdCandidate, ['--version'])
      return { kind: 'npm', found: true, executable: cmdCandidate, version, source: 'derived-from-node' }
    }
    const cliCandidate = trustedExecutableCandidate(npmCli, 'npm')
    if (cliCandidate) {
      return { kind: 'npm', found: true, executable: cliCandidate, version: readVersion(nodeExecutable, [cliCandidate, '--version']), source: 'derived-from-node' }
    }
  }

  // fallback: trusted where.exe npm.cmd
  for (const candidate of whereExecutable('npm.cmd')) {
    const c = trustedExecutableCandidate(candidate, 'npm')
    if (c) return { kind: 'npm', found: true, executable: c, version: readVersion(c, ['--version']), source: 'path' }
  }

  return { kind: 'npm', found: false, executable: null, version: null, source: 'not-found', reason: 'npm not found beside the trusted Node, or on PATH' }
}
