// ──────────────────────────────────────────
// Project Capsule types — local safe project context model
// ──────────────────────────────────────────

/** Safety state snapshot for the current project capsule. */
export interface CapsuleSafetyState {
  /** Current runtime provider mode: 'default' or 'custom'. */
  providerStatus: 'default' | 'custom'
  /** True when no plaintext secrets are stored in settings or env. */
  secretsSafe: boolean
  /** True when public-facing outputs use basename / safe path labels only. */
  pathsSafe: boolean
  /** True when the latest verified release gate is blocked. */
  releaseBlocked: boolean
  /** Build status: 'pass' when build verified, 'unknown' otherwise. */
  buildStatus: 'pass' | 'unknown'
  /** Pack status: 'blocked' when env toolchain missing, 'pass' when verified, 'unknown' otherwise. */
  packStatus: 'blocked' | 'pass' | 'unknown'
  /** Current development phase status. */
  phaseStatus: 'phase-1-active' | 'unknown'
  /** True when the user has explicitly selected a workspace via the picker. */
  workspaceSelected: boolean
}

/**
 * Project Capsule — local project context without secrets or full paths.
 *
 * This is a Phase 1A MVP data model. Fields are intentionally minimal and
 * safe for local storage. Nothing in the capsule is sent to a remote service.
 */
export interface ProjectCapsule {
  capsuleVersion: 1
  projectName: string
  /** Human-readable workspace label (basename or short name). */
  workspaceLabel: string
  /** Display-safe path label. Never a full absolute path. */
  safePathLabel: string
  lastOpenedAt: string // ISO-8601
  safetyState: CapsuleSafetyState
  /** Free-form notes / handoff summary. May be empty. */
  notes: string
  createdAt: string // ISO-8601
  updatedAt: string // ISO-8601
}

/** Default empty capsule used when no saved capsule exists. */
export function createDefaultCapsule(workspaceLabel?: string, safePathLabel?: string): ProjectCapsule {
  const now = new Date().toISOString()
  return {
    capsuleVersion: 1,
    projectName: 'Agent Workbench',
    workspaceLabel: workspaceLabel ?? 'Current Workspace',
    safePathLabel: safePathLabel ?? '(not set)',
    lastOpenedAt: now,
    safetyState: {
      providerStatus: 'default',
      secretsSafe: true,
      pathsSafe: true,
      releaseBlocked: true, // safe default when no verified release evidence is available
      buildStatus: 'pass', // verified at 76152f6 / 7780fbe
      packStatus: 'blocked', // conservative default until capsule-specific pack evidence exists
      phaseStatus: 'phase-1-active',
      workspaceSelected: false // user must explicitly select workspace
    },
    notes: '',
    createdAt: now,
    updatedAt: now
  }
}
