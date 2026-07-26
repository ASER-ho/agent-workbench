import { dialog } from 'electron'
import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import type { ProjectCapsule } from '../../shared/capsule-types'
import { createDefaultCapsule } from '../../shared/capsule-types'
import { getMemoryDir, setSelectedWorkspaceRoot } from '../utils/paths'

const CAPSULE_FILENAME = 'project-capsule.json'

// Patterns that indicate a full absolute path (must not be saved)
const FULL_PATH_PATTERNS = [
  /^[A-Za-z]:[\\/]/,        // C:\...  D:/...
  /^\/Users\//,              // /Users/...
  /^\/home\//,               // /home/...
  /^\\\\[^\\]+\\/,           // \\server\...
  /^\/[^/]+\/[^/]+/,         // /root/subdir/... (Unix abs path with depth)
  /^~[\\/]/,                 // ~/... or ~\...
  /[\\/]\.\.[\\/]/,          // ../ or ..\  (traversal attempt)
  /%[A-Z]+%[\\/]/            // %APPDATA%\... etc.
]

/** Sanitize a path label: reject full paths, return safe basename or original. */
function sanitizePathLabel(input: string): { value: string; rejected: boolean } {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return { value: '', rejected: false }

  for (const pattern of FULL_PATH_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Attempt to extract basename as a safe fallback
      const cleaned = trimmed.replace(/\\/g, '/').replace(/\/+$/, '')
      const basename = cleaned.split('/').pop() ?? '(sanitized)'
      return { value: basename.slice(0, 80), rejected: true }
    }
  }

  return { value: trimmed.slice(0, 200), rejected: false }
}

function redactCredentialLike(input: string): string {
  return String(input ?? '')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '********')
    .replace(/\b(?:ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi, '********')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}\b/gi, 'Bearer ********')
    .replace(/\b([A-Z][A-Z0-9_]*(?:API_KEY|AUTH_TOKEN|TOKEN|SECRET)|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1: ********')
}

/** Remove inline absolute paths from free-form notes before storage or display. */
function sanitizeFreeText(input: string): string {
  let value = String(input ?? '').slice(0, 2000)
  const inlinePathPatterns = [
    /[A-Za-z]:[\\/][^\s<>"'`]+/g,
    /\\\\[^\\\s]+\\[^\s<>"'`]+/g,
    /%[A-Z][A-Z0-9_]*%[\\/][^\s<>"'`]+/gi,
    /~[\\/][^\s<>"'`]+/g,
    /(?<![:/])\/(?:[^/\s<>"'`]+\/)+[^\s<>"'`)]+/g
  ]
  for (const pattern of inlinePathPatterns) value = value.replace(pattern, '[path hidden]')
  return redactCredentialLike(value)
}

function getCapsulePath(): string {
  const memoryDir = getMemoryDir()
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true })
  }
  return join(memoryDir, CAPSULE_FILENAME)
}

export function registerCapsuleHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CAPSULE_LOAD, async () => {
    const path = getCapsulePath()
    if (!existsSync(path)) {
      return { capsule: createDefaultCapsule(), source: 'default' as const }
    }
    try {
      const raw = readFileSync(path, 'utf-8')
      const data: ProjectCapsule = JSON.parse(raw)
      if (data.capsuleVersion !== 1) {
        return { capsule: createDefaultCapsule(), source: 'default' as const }
      }
      const loadedPath = sanitizePathLabel(data.safePathLabel)
      const safeProjectName = redactCredentialLike(sanitizePathLabel(data.projectName).value) || 'Agent Workbench'
      const safeWorkspaceLabel = redactCredentialLike(sanitizePathLabel(data.workspaceLabel).value) || 'Current Workspace'
      const safePathLabel = redactCredentialLike(loadedPath.value) || '(not set)'
      const safeNotes = sanitizeFreeText(data.notes ?? '')
      if (safeProjectName !== data.projectName || safeWorkspaceLabel !== data.workspaceLabel || safePathLabel !== data.safePathLabel || safeNotes !== (data.notes ?? '')) {
        data.projectName = safeProjectName
        data.workspaceLabel = safeWorkspaceLabel
        data.safePathLabel = safePathLabel
        data.notes = safeNotes
        if (loadedPath.rejected) data.safetyState.pathsSafe = false
        writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
      }
      return { capsule: data, source: 'saved' as const }
    } catch {
      return { capsule: createDefaultCapsule(), source: 'fallback' as const, loadError: 'Capsule file could not be read. Using safe default capsule.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CAPSULE_SAVE, async (_event, capsule: ProjectCapsule) => {
    try {
      // Sanitize path label: reject full paths, keep basename
      const pathResult = sanitizePathLabel(capsule.safePathLabel)

      // Also sanitize projectName and workspaceLabel for path-like content
      const projectNameSanitized = sanitizePathLabel(capsule.projectName)
      const workspaceLabelSanitized = sanitizePathLabel(capsule.workspaceLabel)
      const rawNotes = String(capsule.notes ?? '').slice(0, 2000)
      const safeNotes = sanitizeFreeText(rawNotes)

      // Main-side recalculation: workspace is "selected" only when labels
      // are explicitly set to non-trivial values, not renderer-claimed.
      const safeProjectName = redactCredentialLike(projectNameSanitized.value) || 'Agent Workbench'
      const safeWorkspaceLabel = redactCredentialLike(workspaceLabelSanitized.value) || 'Current Workspace'
      const safePathLabel = redactCredentialLike(pathResult.value) || '(not set)'
      const workspaceSelected =
        safeWorkspaceLabel !== 'Current Workspace' &&
        safeWorkspaceLabel !== '' &&
        safePathLabel !== '(not set)' &&
        safePathLabel !== '' &&
        !pathResult.rejected

      const safe: ProjectCapsule = {
        capsuleVersion: 1,
        projectName: safeProjectName,
        workspaceLabel: safeWorkspaceLabel,
        safePathLabel,
        lastOpenedAt: new Date().toISOString(),
        safetyState: {
          providerStatus: capsule.safetyState?.providerStatus === 'custom' ? 'custom' : 'default',
          secretsSafe: Boolean(capsule.safetyState?.secretsSafe),
          pathsSafe: !pathResult.rejected && Boolean(capsule.safetyState?.pathsSafe),
          releaseBlocked: Boolean(capsule.safetyState?.releaseBlocked),
          buildStatus: capsule.safetyState?.buildStatus === 'pass' ? 'pass' : 'unknown',
          packStatus: capsule.safetyState?.packStatus === 'pass' ? 'pass' : capsule.safetyState?.packStatus === 'blocked' ? 'blocked' : 'unknown',
          phaseStatus: capsule.safetyState?.phaseStatus === 'phase-1-active' ? 'phase-1-active' : 'unknown',
          workspaceSelected
        },
        notes: safeNotes,
        createdAt: String(capsule.createdAt ?? capsule.lastOpenedAt ?? new Date().toISOString()),
        updatedAt: new Date().toISOString()
      }

      const path = getCapsulePath()
      const dir = dirname(path)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(path, JSON.stringify(safe, null, 2), 'utf-8')

      if (pathResult.rejected || safeNotes !== rawNotes) {
        return { success: true, warning: 'Full path detected and sanitized. Safe label saved instead.' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Capsule save failed. No secrets were exposed.' }
    }
  })

  // Safe workspace label picker — returns basename only, never full path
  ipcMain.handle(IPC_CHANNELS.CAPSULE_PICK_WORKSPACE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true as const }
    }

    // Extract basename only — full path never leaves main process
    const raw = result.filePaths[0]
    setSelectedWorkspaceRoot(raw)
    const cleaned = raw.replace(/\\/g, '/').replace(/\/+$/, '')
    const basename = cleaned.split('/').pop() ?? 'workspace'
    const safeLabel = basename.slice(0, 80)

    return {
      cancelled: false as const,
      projectName: safeLabel,
      workspaceLabel: safeLabel,
      safePathLabel: safeLabel
    }
  })
}
