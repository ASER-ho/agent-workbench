import { ControlledVerificationManager, type CompletedVerificationRecord } from '../controlled-verification-manager.ts'
import { REGISTERED_RECIPES } from './recipe-registry.ts'
import { getRememberedContract } from './contract-store.ts'
import { getSelectedWorkspaceBinding } from '../workspace-foundation/session-workspace.ts'
import type { AutoVerifySettings, ObservedAgentEvent } from '../../../shared/observation-types.ts'
import type { VerificationContract } from '../../../shared/verification-types.ts'

type WorkspaceLike = { cwd: string }

/** Case-insensitive cwd equality (Windows paths). */
export function cwdEquals(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/**
 * Recipe-whitelisted auto-verification. Only runs when every gate passes:
 * enabled, a session:end event, workspace match (if workspaceOnly), a
 * whitelisted recipe, and a remembered contract. Execution is delegated to the
 * existing ControlledVerificationManager (fixed command, allowlisted env,
 * fail-closed snapshot). Never executes anything from the transcript/hook.
 */
export class AutoVerifier {
  private settings: AutoVerifySettings = { autoVerifyEnabled: false, workspaceOnly: true, recipeIds: [] }
  private lastReceipt: CompletedVerificationRecord | null = null
  private readonly manager: ControlledVerificationManager
  private readonly onCompleted: (r: CompletedVerificationRecord) => void
  private readonly workspaceProvider: () => WorkspaceLike | null
  private readonly contractProvider: () => VerificationContract | null

  constructor(deps: {
    manager?: ControlledVerificationManager
    onCompleted: (r: CompletedVerificationRecord) => void
    workspaceProvider?: () => WorkspaceLike | null
    contractProvider?: () => VerificationContract | null
  }) {
    this.manager = deps.manager ?? new ControlledVerificationManager({
      gitExecutable: process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE'] || undefined
    })
    this.onCompleted = deps.onCompleted
    this.workspaceProvider = deps.workspaceProvider ?? getSelectedWorkspaceBinding
    this.contractProvider = deps.contractProvider ?? getRememberedContract
  }

  enable(settings: AutoVerifySettings): void {
    this.settings = { ...settings }
  }

  disable(): void {
    this.settings = { ...this.settings, autoVerifyEnabled: false }
  }

  getSettings(): AutoVerifySettings {
    return { ...this.settings }
  }

  getLastReceipt(): CompletedVerificationRecord | null {
    return this.lastReceipt
  }

  async handleEvent(event: ObservedAgentEvent): Promise<void> {
    if (!this.settings.autoVerifyEnabled) return
    if (event.event !== 'session:end') return

    if (this.settings.workspaceOnly) {
      const workspace = this.workspaceProvider()
      if (!workspace || !cwdEquals(workspace.cwd, event.cwd)) return
    }

    const recipe = REGISTERED_RECIPES.find((r) => this.settings.recipeIds.includes(r.id))
    if (!recipe) return

    const contract = this.contractProvider()
    if (!contract) return

    try {
      const preview = await this.manager.createPreview({ testPath: recipe.testPath, contract })
      await this.manager.confirmAndExecute({ confirmationId: preview.confirmationId })
    } catch {
      // A failed auto-run is surfaced through the normal verification result;
      // never throw into the observation pipeline.
      return
    }

    const receipt = this.manager.getCompletedVerification()
    if (receipt) {
      this.lastReceipt = receipt
      this.onCompleted(receipt)
    }
  }
}
