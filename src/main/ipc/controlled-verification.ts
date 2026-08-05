import { app } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-types.ts'
import { buildVerificationReceipt } from '../../shared/verification-receipt-builder.ts'
import type { VerificationReceipt } from '../../shared/verification-receipt-types.ts'
import { CONTROLLED_VERIFICATION_CRITERION_ID } from '../../shared/controlled-verification-execution-types.ts'
import { ControlledVerificationManager } from '../services/controlled-verification-manager.ts'
import { VerificationExportService } from '../services/verification-export-service.ts'
import { trustedIpcMain as ipcMain } from './trusted-ipc.ts'
import type { ControlledVerificationResult } from '../../shared/controlled-verification-execution-types.ts'

/**
 * Builds the immutable Verification Receipt from the manager's most recent
 * executed result and the contract bound to it. All values come from Main-owned,
 * already-sanitized data — the renderer supplies only the export kind.
 */
function buildReceiptFromLastExecution(
  manager: ControlledVerificationManager
): VerificationReceipt | null {
  const executed = manager.getLastExecutedResult()
  const contract = manager.getLastContract()
  const preview = manager.getLastPreview()
  if (!executed || executed.state !== 'executed' || !contract || !preview) return null

  const result: Extract<ControlledVerificationResult, { state: 'executed' }> = executed
  const evidenceResult = result.evidence
  const unresolvedItems: string[] = []
  if (result.subjectChangedDuringVerification) unresolvedItems.push('SUBJECT_CHANGED_DURING_VERIFICATION')
  if (result.commandStatus === 'TIMEOUT') unresolvedItems.push('EXECUTION_TIMEOUT')
  if (result.commandStatus === 'CANCELLED') unresolvedItems.push('EXECUTION_CANCELLED')
  if (result.commandStatus === 'ERROR') unresolvedItems.push('EXECUTION_ERROR')
  if (!evidenceResult?.fresh) unresolvedItems.push('STALE_EVIDENCE')

  const criterionResult = result.criterion
  return buildVerificationReceipt({
    contract: {
      contractId: contract.title && contract.title.length > 0 ? contract.title : 'contract-untitled',
      contractDigest: preview.contractDigest,
      criteria: [{ criterionId: CONTROLLED_VERIFICATION_CRITERION_ID, title: contract.title }]
    },
    workspace: {
      displayId: preview.workspaceDisplayId,
      repositoryIdentityDigest: preview.repositoryIdentity.displayId
    },
    subject: {
      subjectDigest: result.subjectBeforeDigest,
      headOid: null,
      complete: result.subjectStable
    },
    policy: {
      policyVersion: 'r2b1-v1',
      policyDigest: preview.policyDigest,
      freshnessPolicyId: 'evidence-freshness-v1'
    },
    verification: {
      recipeType: 'node-test-v1',
      displaySafeCommand: result.commandPreview,
      executionStatus: result.commandStatus,
      exitCode: result.exitCode,
      isolationLevel: result.isolationLevels[0] ?? 'PROCESS_BOUNDARY_ONLY',
      outputTruncated: result.stdoutTruncated || result.stderrTruncated
    },
    evidence: evidenceResult ? [{
      evidenceId: evidenceResult.evidenceId,
      criterionId: evidenceResult.criterionId,
      result: evidenceResult.status,
      valid: evidenceResult.valid,
      policyDigest: evidenceResult.policyDigest,
      subjectDigest: evidenceResult.subjectDigest,
      observedAt: evidenceResult.observedAt,
      exclusionReason: evidenceResult.valid ? null : 'SUBJECT_CHANGED_DURING_VERIFICATION'
    }] : [],
    criterionResults: [{
      criterionId: CONTROLLED_VERIFICATION_CRITERION_ID,
      verdict: criterionResult.verdict,
      ruleId: criterionResult.ruleId,
      decisionTrace: criterionResult.decisionTrace
    }],
    overallVerdict: criterionResult.verdict,
    unresolvedItems,
    acceptanceDecision: 'NOT_RECORDED'
  })
}

/**
 * Registers the controlled verification IPC surface. The manager is the only
 * place that resolves the executable, builds the environment, captures the
 * Subject Snapshot, and records evidence. The renderer may submit only a
 * confirmationId at confirm time, and only an export kind at export time.
 */
export function registerControlledVerificationHandlers(): void {
  const e2eGitExecutable = process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE']
  const manager = new ControlledVerificationManager({ gitExecutable: e2eGitExecutable || undefined })
  const exportService = new VerificationExportService()

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_PREVIEW, async (_event, raw: unknown) => {
    return manager.createPreview(raw)
  })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_CONFIRM, async (_event, raw: unknown) => {
    return manager.confirmAndExecute(raw)
  })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_CANCEL, (_event, raw: unknown) => {
    return manager.cancel(raw)
  })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_EXPORT, async (_event, raw: unknown) => {
    const kind = (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>)['kind'])
    if (kind !== 'json' && kind !== 'md' && kind !== 'both') {
      return { ok: false, error: 'invalid export kind' }
    }
    const receipt = buildReceiptFromLastExecution(manager)
    if (!receipt) return { ok: false, error: 'no completed verification result to export' }
    return exportService.export({ kind, receipt })
  })

  const dispose = (): void => { manager.dispose() }
  app.on('before-quit', dispose)
  process.on('exit', dispose)
}
