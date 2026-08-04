// Trusted external node.exe discovery for the Main process.
// Design constraints:
// - The renderer must never supply or modify this path; discovery runs only in
//   the Main process over a fixed candidate chain, and every candidate must
//   independently pass validation.
// - A trusted node.exe must be a canonical absolute drive-letter path whose
//   basename is exactly node.exe, must resolve through realpath, must exist,
//   and must be a regular file. UNC and device paths are never trusted.
// - We deliberately do NOT use ELECTRON_RUN_AS_NODE, and we do NOT depend on any
//   Codex/private runtime path.
// - When no trusted node.exe can be found the API returns an explicit failure
//   result instead of throwing an obscure error.
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'

import { canonicalStringify, sha256Utf8 } from '../utils/evidence-digest.ts'
import { decodeWhereOutputCandidates } from './git-verification.ts'

const NODE_IDENTITY_DIGEST_PREFIX = 'aw-node-identity-v1\0'
const UNC_OR_DEVICE_RE = /^(?:\\\\|\\[?.]\\)/

export type TrustedNodeResult =
  | { trusted: true; executable: string; identityDigest: string }
  | { trusted: false; reason: string }

function isNodeExecutableBasename(value: string): boolean {
  return basename(value).toLocaleLowerCase('en-US') === 'node.exe'
}

function isTrustedLocalPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) && !UNC_OR_DEVICE_RE.test(value)
}

/**
 * Validates a single node.exe candidate and returns its canonical absolute path
 * when trusted, otherwise null. The candidate must be a drive-letter absolute
 * path with basename exactly node.exe, must pass realpath, must exist, and must
 * be a regular file. UNC and device paths are rejected before any filesystem
 * access.
 */
export function trustedNodeCandidate(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const raw = candidate.trim()
  if (!raw || !isAbsolute(raw) || !isTrustedLocalPath(raw) || !isNodeExecutableBasename(raw)) return null
  try {
    const canonical = realpathSync.native(resolve(raw))
    if (!isTrustedLocalPath(canonical) || !isNodeExecutableBasename(canonical)) return null
    if (!existsSync(canonical) || !statSync(canonical).isFile()) return null
    return canonical
  } catch {
    return null
  }
}

function nodeIdentityDigest(canonicalExecutable: string): string {
  return sha256Utf8(NODE_IDENTITY_DIGEST_PREFIX + canonicalStringify({ executable: canonicalExecutable }))
}

/**
 * Resolves a trusted node.exe from an explicit candidate list (used by tests to
 * inject candidates and by the production discovery chain). Returns the first
 * candidate that passes validation, or an explicit failure.
 */
export function resolveTrustedNodeFromCandidates(candidates: readonly unknown[]): TrustedNodeResult {
  for (const candidate of candidates) {
    const trusted = trustedNodeCandidate(candidate)
    if (trusted) {
      return { trusted: true, executable: trusted, identityDigest: nodeIdentityDigest(trusted) }
    }
  }
  return { trusted: false, reason: 'No trusted external node.exe found in the provided candidates' }
}

/**
 * Runs the trusted System32 where.exe to locate node.exe on PATH, reusing the
 * same GBK/UTF-8 tolerant output decoding used for git.exe. Returns the first
 * validated canonical path, or null.
 */
export function resolveWhereNodeExecutable(): string | null {
  const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
  const wherePath = join(systemRoot, 'System32', 'where.exe')
  if (!existsSync(wherePath)) return null
  const located = spawnSync(wherePath, ['node.exe'], {
    shell: false,
    windowsHide: true,
    encoding: 'buffer',
    timeout: 3_000,
    maxBuffer: 32 * 1024,
    env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: process.env['PATH'] }
  })
  if (located.status !== 0) return null
  for (const candidate of decodeWhereOutputCandidates(located.stdout)) {
    const trusted = trustedNodeCandidate(candidate)
    if (trusted) return trusted
  }
  return null
}

/**
 * Production discovery chain for a trusted external node.exe:
 * 1. AGENT_WORKBENCH_NODE_EXECUTABLE (if set, still must pass validation)
 * 2. Standard install locations: %ProgramFiles%\nodejs\node.exe and
 *    %LOCALAPPDATA%\Programs\nodejs\node.exe
 * 3. trusted System32 where.exe node.exe
 * If none validate, returns an explicit failure.
 */
export function resolveTrustedNodeExecutable(): TrustedNodeResult {
  const candidates: string[] = []
  const envNode = process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
  if (envNode) candidates.push(envNode)
  const programFiles = process.env['ProgramFiles']
  const localAppData = process.env['LOCALAPPDATA']
  if (programFiles) candidates.push(join(programFiles, 'nodejs', 'node.exe'))
  if (localAppData) candidates.push(join(localAppData, 'Programs', 'nodejs', 'node.exe'))
  const viaWhere = resolveWhereNodeExecutable()
  if (viaWhere) candidates.push(viaWhere)
  const result = resolveTrustedNodeFromCandidates(candidates)
  if (result.trusted) return result
  return {
    trusted: false,
    reason: 'No trusted external node.exe was found via AGENT_WORKBENCH_NODE_EXECUTABLE, standard install locations, or PATH'
  }
}
