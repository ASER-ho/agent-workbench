import { appendFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { ControlledVerificationManager, type CompletedVerificationRecord } from '../controlled-verification-manager.ts'
import { REGISTERED_RECIPES } from './recipe-registry.ts'
import { getRememberedContractSnapshot, type RememberedContractSnapshot } from './contract-store.ts'
import { getSelectedWorkspaceBinding } from '../workspace-foundation/session-workspace.ts'
import type {
  AuditHealth,
  AutoVerificationAuthorization,
  AutoVerificationRevocationReason,
  AutoVerifySettings
} from '../../../shared/observation-types.ts'
import type { VerificationContract } from '../../../shared/verification-types.ts'
import type { WorkspaceBinding } from '../workspace-foundation/workspace-types.ts'
import type { RegisteredRecipe } from './recipe-registry-types.ts'
import type { ObservedAgentEventInternal } from './agent-events.ts'

export type AutoVerificationAuditEvent =
  | 'authorization_granted'
  | 'authorization_revoked'
  | 'authorization_consumed'
  | 'auto_run_started'
  | 'auto_run_completed'
  | 'auto_run_failed'

export interface AutoVerificationAuditEntry {
  ts: number
  event: AutoVerificationAuditEvent
  authorizationId: string
  trigger: 'auto:session-end'
  recipeIds: string[]
  workspaceDisplayId: string
  contractDigestPrefix: string
  sessionIdDigest?: string
  verdict?: string | null
  reason?: string | null
}

interface InternalAuthorization extends AutoVerificationAuthorization {
  workspaceId: string
  cwd: string
  contractDigest: string
  contractGeneration: number
  contract: VerificationContract
}

type AuditWriter = (entry: AutoVerificationAuditEntry) => void

/** Case-insensitive cwd equality (Windows paths). */
export function cwdEquals(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function digestSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex').slice(0, 16)
}

function normalizeRecipeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort()
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Main-owned single-use authorization lease for recipe-whitelisted automatic
 * verification. The lease is consumed synchronously before any verification
 * work, so duplicate session:end delivery can never execute twice.
 */
export class AutoVerifier {
  private authorization: InternalAuthorization | null = null
  private lastReceipt: CompletedVerificationRecord | null = null
  private auditHealth: AuditHealth = { state: 'HEALTHY', error: null }
  private readonly manager: ControlledVerificationManager
  private readonly onCompleted: (r: CompletedVerificationRecord) => void
  private readonly onStatusChanged: () => void
  private readonly workspaceProvider: () => WorkspaceBinding | null
  private readonly contractProvider: () => RememberedContractSnapshot
  private readonly recipeProvider: () => RegisteredRecipe[]
  private readonly auditWriter: AuditWriter
  private readonly now: () => number

  constructor(deps: {
    manager?: ControlledVerificationManager
    onCompleted: (r: CompletedVerificationRecord) => void
    onStatusChanged?: () => void
    workspaceProvider?: () => WorkspaceBinding | null
    contractProvider?: () => RememberedContractSnapshot
    recipeProvider?: () => RegisteredRecipe[]
    auditPath?: string | null
    auditWriter?: AuditWriter
    now?: () => number
  }) {
    this.manager = deps.manager ?? new ControlledVerificationManager({
      gitExecutable: process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE'] || undefined
    })
    this.onCompleted = deps.onCompleted
    this.onStatusChanged = deps.onStatusChanged ?? (() => {})
    this.workspaceProvider = deps.workspaceProvider ?? getSelectedWorkspaceBinding
    this.contractProvider = deps.contractProvider ?? getRememberedContractSnapshot
    this.recipeProvider = deps.recipeProvider ?? (() => REGISTERED_RECIPES)
    this.now = deps.now ?? Date.now
    this.auditWriter = deps.auditWriter ?? ((entry) => {
      if (!deps.auditPath) throw new Error('audit path unavailable')
      appendFileSync(deps.auditPath, JSON.stringify(entry) + '\n', 'utf8')
    })
  }

  arm(settings: AutoVerifySettings): AutoVerificationAuthorization {
    if (!settings.autoVerifyEnabled) throw new Error('authorization must be explicitly enabled')
    if (!settings.workspaceOnly) throw new Error('auto verification must remain workspace-bound')

    const workspace = this.workspaceProvider()
    if (!workspace) throw new Error('Select a workspace before authorizing auto verification')
    const contractSnapshot = this.contractProvider()
    if (!contractSnapshot.contract || !contractSnapshot.digest) {
      throw new Error('Generate a verification preview before authorizing auto verification')
    }

    const recipeIds = normalizeRecipeIds(settings.recipeIds)
    const recipes = this.recipeProvider()
    if (recipeIds.length === 0 || recipeIds.some((id) => !recipes.some((recipe) => recipe.id === id))) {
      throw new Error('Select only registered auto-verification recipes')
    }

    if (this.authorization?.state === 'AUTHORIZED') {
      const reason: AutoVerificationRevocationReason = sameIds(this.authorization.recipeIds, recipeIds)
        ? 'USER_DISABLED'
        : 'RECIPE_CHANGED'
      this.revoke(reason)
    }

    const authorization: InternalAuthorization = {
      authorizationId: randomUUID(),
      workspaceId: workspace.workspaceId,
      workspaceDisplayId: workspace.workspaceDisplayId,
      cwd: workspace.cwd,
      contractDigest: contractSnapshot.digest,
      contractDigestPrefix: contractSnapshot.digest.slice(0, 12),
      contractGeneration: contractSnapshot.generation,
      contract: contractSnapshot.contract,
      recipeIds,
      recipeLabels: recipeIds.map((id) => recipes.find((recipe) => recipe.id === id)?.label ?? id),
      trigger: 'session:end',
      createdAt: this.now(),
      state: 'AUTHORIZED',
      reason: null
    }

    this.writeCritical(this.entry('authorization_granted', authorization))
    this.authorization = authorization
    this.onStatusChanged()
    return this.publicAuthorization()
  }

  /** Compatibility wrapper for the existing IPC request shape. */
  enable(settings: AutoVerifySettings): void {
    this.arm(settings)
  }

  disable(reason: AutoVerificationRevocationReason = 'USER_DISABLED'): void {
    this.revoke(reason)
  }

  revoke(reason: AutoVerificationRevocationReason): void {
    if (!this.authorization || this.authorization.state !== 'AUTHORIZED') return
    this.authorization = { ...this.authorization, state: 'REVOKED', reason }
    this.writeBestEffort(this.entry('authorization_revoked', this.authorization, { reason }))
    this.onStatusChanged()
  }

  getSettings(): AutoVerifySettings {
    return {
      autoVerifyEnabled: this.authorization?.state === 'AUTHORIZED',
      workspaceOnly: true,
      recipeIds: this.authorization?.recipeIds ? [...this.authorization.recipeIds] : [],
      authorization: this.authorization ? this.publicAuthorization() : null
    }
  }

  getAuditHealth(): AuditHealth {
    return { ...this.auditHealth }
  }

  getLastReceipt(): CompletedVerificationRecord | null {
    return this.lastReceipt
  }

  validateBindings(): void {
    const authorization = this.authorization
    if (!authorization || authorization.state !== 'AUTHORIZED') return
    const workspace = this.workspaceProvider()
    if (!workspace) {
      this.revoke('WORKSPACE_CLEARED')
      return
    }
    if (workspace.workspaceId !== authorization.workspaceId || !cwdEquals(workspace.cwd, authorization.cwd)) {
      this.revoke('WORKSPACE_CHANGED')
      return
    }
    const contract = this.contractProvider()
    if (contract.generation !== authorization.contractGeneration || contract.digest !== authorization.contractDigest) {
      this.revoke('CONTRACT_CHANGED')
      return
    }
    const registered = normalizeRecipeIds(this.recipeProvider().map((recipe) => recipe.id))
    if (authorization.recipeIds.some((id) => !registered.includes(id))) this.revoke('RECIPE_CHANGED')
  }

  async handleEvent(event: ObservedAgentEventInternal): Promise<void> {
    if (event.event !== 'session:end') return
    this.validateBindings()
    const authorization = this.authorization
    if (!authorization || authorization.state !== 'AUTHORIZED') return
    if (!cwdEquals(authorization.cwd, event.cwd)) return

    // Atomic in the Main process event loop: consume before any await or I/O.
    this.authorization = { ...authorization, state: 'CONSUMED', reason: null }
    this.onStatusChanged()
    const consumed = this.authorization
    const sessionIdDigest = digestSessionId(event.sessionId)

    try {
      this.writeCritical(this.entry('authorization_consumed', consumed, { sessionIdDigest }))
      this.writeCritical(this.entry('auto_run_started', consumed, { sessionIdDigest }))
    } catch {
      return
    }

    const recipe = this.recipeProvider().find((candidate) => consumed.recipeIds.includes(candidate.id))
    if (!recipe) {
      this.writeBestEffort(this.entry('auto_run_failed', consumed, { sessionIdDigest, reason: 'RECIPE_UNAVAILABLE' }))
      return
    }

    try {
      const preview = await this.manager.createPreview({ testPath: recipe.testPath, contract: consumed.contract })
      await this.manager.confirmAndExecute({ confirmationId: preview.confirmationId })
      const receipt = this.manager.getCompletedVerification()
      if (!receipt) {
        this.writeBestEffort(this.entry('auto_run_failed', consumed, { sessionIdDigest, reason: 'NO_COMPLETED_VERIFICATION' }))
        return
      }
      this.lastReceipt = receipt
      this.onCompleted(receipt)
      const execution = receipt.execution as { state?: string; criterion?: { verdict?: string } } | null
      const verdict = execution?.state === 'executed' ? (execution.criterion?.verdict ?? null) : (execution?.state ?? null)
      this.writeBestEffort(this.entry('auto_run_completed', consumed, { sessionIdDigest, verdict }))
    } catch {
      this.writeBestEffort(this.entry('auto_run_failed', consumed, { sessionIdDigest, reason: 'CONTROLLED_VERIFICATION_FAILED' }))
    } finally {
      this.onStatusChanged()
    }
  }

  private publicAuthorization(): AutoVerificationAuthorization {
    if (!this.authorization) throw new Error('authorization unavailable')
    const {
      workspaceId: _workspaceId,
      cwd: _cwd,
      contractDigest: _contractDigest,
      contractGeneration: _contractGeneration,
      contract: _contract,
      ...displaySafe
    } = this.authorization
    return { ...displaySafe, recipeIds: [...displaySafe.recipeIds], recipeLabels: [...displaySafe.recipeLabels] }
  }

  private entry(
    event: AutoVerificationAuditEvent,
    authorization: InternalAuthorization,
    extra: Partial<Pick<AutoVerificationAuditEntry, 'sessionIdDigest' | 'verdict' | 'reason'>> = {}
  ): AutoVerificationAuditEntry {
    return {
      ts: this.now(),
      event,
      authorizationId: authorization.authorizationId,
      trigger: 'auto:session-end',
      recipeIds: [...authorization.recipeIds],
      workspaceDisplayId: authorization.workspaceDisplayId,
      contractDigestPrefix: authorization.contractDigestPrefix,
      ...extra
    }
  }

  private writeCritical(entry: AutoVerificationAuditEntry): void {
    try {
      this.auditWriter(entry)
    } catch {
      this.degradeAudit('Automatic verification audit is unavailable')
      throw new Error('AUTO_VERIFY_AUDIT_UNAVAILABLE')
    }
  }

  private writeBestEffort(entry: AutoVerificationAuditEntry): void {
    try {
      this.auditWriter(entry)
    } catch {
      this.degradeAudit('Automatic verification result audit is degraded')
    }
  }

  private degradeAudit(error: string): void {
    this.auditHealth = { state: 'DEGRADED', error }
    this.onStatusChanged()
  }
}
