// Main-only safe path resolution for controlled verification.
//
// Guards a workspace-relative target (a test file path) against symlink /
// junction / reparse-point escape, so that `node --test <relative>` can never
// follow a link outside the workspace root. This is the same pattern proven by
// VerificationSubjectSnapshotService.safePathStats, extracted for reuse by both
// the snapshot capture and the controlled verification manager.
//
// This module is Main-only and MUST NOT be imported by anything bundled into
// the Electron renderer.
import { type Stats, lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const DRIVE_RE = /^[A-Za-z]:/
const UNC_OR_DEVICE_RE = /^(?:\\\\|\/\/|\\[?.]\\)/

function fold(value: string): string {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
}

/** True when canonical is root or a descendant of root (path-segment aware). */
function isWithinRoot(canonical: string, root: string): boolean {
  const rel = relative(fold(root), fold(canonical))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Resolves a workspace-relative target to a canonical absolute path that is
 * guaranteed to be a plain regular file inside the workspace root, with no
 * symlink/junction/reparse component anywhere along the path.
 *
 * Returns `{ ok: true, canonical }` on success, or `{ ok: false, reason }`.
 * The canonical path is intended for Main-process use only and must never be
 * sent across IPC.
 */
export function resolveSafeTestTarget(
  workspaceRoot: string,
  relativeTarget: string
): { ok: true; canonical: string } | { ok: false; reason: string } {
  const root = safeCanonicalDirectory(workspaceRoot)
  if (!root) return { ok: false, reason: 'workspace root is unavailable' }
  if (!relativeTarget || isAbsolute(relativeTarget) || DRIVE_RE.test(relativeTarget) || UNC_OR_DEVICE_RE.test(relativeTarget)) {
    return { ok: false, reason: 'test path must be workspace-relative' }
  }
  const parts = relativeTarget.split(/[\\/]/)
  if (parts.some(part => !part || part === '.' || part === '..')) {
    return { ok: false, reason: 'test path contains an empty, dot, or traversal segment' }
  }

  let current = root
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index])
    let stats: Stats
    try {
      stats = lstatSync(current)
    } catch {
      return { ok: false, reason: 'test path does not resolve' }
    }
    if (stats.isSymbolicLink()) return { ok: false, reason: 'test path traverses a symlink or reparse point' }
    if (index === parts.length - 1) {
      if (!stats.isFile()) return { ok: false, reason: 'test target is not a regular file' }
      let canonical: string
      try {
        canonical = realpathSync.native(current)
      } catch {
        return { ok: false, reason: 'test target realpath is unavailable' }
      }
      if (!isWithinRoot(canonical, root)) return { ok: false, reason: 'test target escapes the workspace root' }
      if (!isPlainFile(canonical)) return { ok: false, reason: 'test target is not a regular file' }
      return { ok: true, canonical }
    }
  }
  return { ok: false, reason: 'test target could not be resolved' }
}

function safeCanonicalDirectory(value: string): string | null {
  if (!value || !isAbsolute(value) || UNC_OR_DEVICE_RE.test(value)) return null
  try {
    return realpathSync.native(resolve(value))
  } catch {
    return null
  }
}

function isPlainFile(canonical: string): boolean {
  try {
    return lstatSync(canonical).isFile()
  } catch {
    return false
  }
}
