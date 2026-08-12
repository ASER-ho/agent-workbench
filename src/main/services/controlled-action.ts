import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import type {
  ActionApproval,
  ActionBinding,
  ActionExecutionResult,
  ActionProposal,
  ActionReceiptStatus,
  ActionType,
  SafeSharePackage,
  WorkReceipt
} from '../../shared/action-types'
import type { SessionSnapshot } from '../../shared/session-types'

const FILE_CONTENT = 'Agent Workbench controlled action\n'
const DEFAULT_FILE_TARGET = 'stage-c/receipt-proof.txt'
const COMMAND_SOURCE = "const delay=Number(process.argv[2]||0);setTimeout(()=>process.stdout.write('controlled-action:ok\\n'),delay)"
const FORBIDDEN_SEGMENTS = new Set(['.claude', '.git', '.env', 'memory', 'skills', 'projects', 'node_modules', 'secrets.enc'])

export interface ControlledActionOptions {
  workspaceRoot: string
  getSessionSnapshot: () => SessionSnapshot
  executablePath?: string
  marker?: string
  proposalTtlMs?: number
  commandDelayMs?: number
  fileWriteDelayMs?: number
  fileTargetResolveDelayMs?: number
  fileTargetRelativePath?: string
}

export interface SanitizedValue {
  value: string
  redactions: Array<'secret' | 'absolute_path' | 'username'>
}

export function sanitizeForShare(input: string): SanitizedValue {
  let value = String(input ?? '')
  const redactions = new Set<'secret' | 'absolute_path' | 'username'>()
  const replace = (pattern: RegExp, replacement: string, category: 'secret' | 'absolute_path' | 'username') => {
    if (pattern.test(value)) {
      redactions.add(category)
      pattern.lastIndex = 0
      value = value.replace(pattern, replacement)
    }
  }
  replace(/\b(?:SecretStore|ANTHROPIC_[A-Z_]+|sk-[A-Za-z0-9_-]{16,}|(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+)/gi, '[REDACTED_SECRET]', 'secret')
  replace(/\b(?:USERNAME|USERPROFILE|USER|COMPUTERNAME)\s*=\s*[^\s]+/gi, '[REDACTED_USER]', 'username')
  replace(/[A-Za-z]:[\\/][^\s]+/g, '[REDACTED_PATH]', 'absolute_path')
  replace(/\\\\[^\\\s]+\\[^\s]*/g, '[REDACTED_PATH]', 'absolute_path')
  replace(/(^|[\s("'])\/(?:[^/\s]+\/)*[^/\s]+/gm, '$1[REDACTED_PATH]', 'absolute_path')
  return { value, redactions: [...redactions] }
}

function safeWorkspaceLabel(value: string): string {
  const label = String(value ?? '').trim()
  if (!label || label.length > 80 || label.startsWith('/') || label.startsWith('../') || label.startsWith('..\\') || /[A-Za-z]:[\\/]/.test(label)) {
    throw new Error('workspace label is unsafe')
  }
  return label
}

function normalizedRelativeTarget(value: string): string {
  const normalized = String(value ?? '').replace(/\\/g, '/').trim()
  const parts = normalized.split('/')
  if (!normalized || isAbsolute(normalized) || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('file target is outside the workspace')
  }
  if (parts.some(part => FORBIDDEN_SEGMENTS.has(part.toLowerCase()))) {
    throw new Error('file target is forbidden')
  }
  return normalized
}

function proposalFingerprint(proposal: Omit<ActionProposal, 'proposalHash'>): string {
  return createHash('sha256').update(JSON.stringify(proposal)).digest('hex')
}

function cloneProposal(proposal: ActionProposal): ActionProposal {
  return { ...proposal, preview: proposal.preview.kind === 'command'
    ? { ...proposal.preview, arguments: [...proposal.preview.arguments] }
    : { ...proposal.preview } }
}

function cloneReceipt(receipt: WorkReceipt): WorkReceipt {
  return { ...receipt, affectedFiles: [...receipt.affectedFiles] }
}

export class ControlledActionManager {
  private readonly workspaceRoot: string
  private readonly workspaceId: string
  private readonly getSessionSnapshot: () => SessionSnapshot
  private readonly executablePath: string
  private readonly marker: string
  private readonly proposalTtlMs: number
  private readonly commandDelayMs: number
  private readonly fileWriteDelayMs: number
  private readonly fileTargetResolveDelayMs: number
  private readonly fileTargetRelativePath: string
  private pendingProposal: ActionProposal | null = null
  private approvedProposal: ActionProposal | null = null
  private approval: ActionApproval | null = null
  private readonly receipts = new Map<string, WorkReceipt>()
  private activeChild: ChildProcessWithoutNullStreams | null = null
  private executing = false
  private disposeRequested = false
  private executionSettled: Promise<void> | null = null
  private settleExecution: (() => void) | null = null

  constructor(options: ControlledActionOptions) {
    if (!options.workspaceRoot || !existsSync(options.workspaceRoot)) throw new Error('controlled action fixture workspace is unavailable')
    this.workspaceRoot = realpathSync(resolve(options.workspaceRoot))
    this.workspaceId = createHash('sha256').update(this.workspaceRoot).digest('hex').slice(0, 16)
    this.getSessionSnapshot = options.getSessionSnapshot
    this.executablePath = options.executablePath ?? process.execPath
    this.marker = options.marker ?? 'agent-workbench-action-stub'
    this.proposalTtlMs = Math.max(1_000, options.proposalTtlMs ?? 120_000)
    this.fileWriteDelayMs = Math.max(0, Math.min(5_000, options.fileWriteDelayMs ?? 0))
    this.fileTargetResolveDelayMs = Math.max(0, Math.min(5_000, options.fileTargetResolveDelayMs ?? 0))
    this.commandDelayMs = Math.max(0, Math.min(5_000, options.commandDelayMs ?? 20))
    this.fileTargetRelativePath = options.fileTargetRelativePath ?? DEFAULT_FILE_TARGET
  }

  isExecuting(): boolean {
    return this.executing
  }

  propose(input: { actionType: ActionType; workspaceLabel: string }): ActionProposal {
    const session = this.activeSession(input.workspaceLabel)
    if (input.actionType !== 'command' && input.actionType !== 'file_change') throw new Error('action type is unsupported')
    if (this.pendingProposal) this.setReceiptStatus(this.pendingProposal.proposalId, 'cancelled')
    if (this.approvedProposal) this.setReceiptStatus(this.approvedProposal.proposalId, 'cancelled')
    this.pendingProposal = null
    this.approvedProposal = null
    this.approval = null

    const createdAt = Date.now()
    const proposalId = randomUUID()
    const workspaceLabel = safeWorkspaceLabel(input.workspaceLabel)
    const common = {
      proposalId,
      sessionId: session.sessionId!,
      workspaceId: this.workspaceId,
      workspaceLabel,
      actionType: input.actionType,
      riskLevel: 'low' as const,
      createdAt,
      expiresAt: createdAt + this.proposalTtlMs
    }
    const immutable: Omit<ActionProposal, 'proposalHash'> = input.actionType === 'command'
      ? {
          ...common,
          exactTarget: basename(this.executablePath),
          preview: {
            kind: 'command', executable: basename(this.executablePath),
            arguments: ['-e', COMMAND_SOURCE, '--', this.marker, String(this.commandDelayMs)],
            workingDirectoryLabel: workspaceLabel,
            expectedImpact: 'Runs one fixed local fixture check without a shell or file mutation.'
          }
        }
      : (() => {
          const relativePath = normalizedRelativeTarget(this.fileTargetRelativePath)
          return {
            ...common,
            exactTarget: relativePath,
            preview: {
              kind: 'file_change', relativePath, action: 'create' as const,
              diff: `--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1 @@\n+Agent Workbench controlled action\n`,
              expectedImpact: 'Creates one deterministic proof file inside the fixture workspace.'
            }
          }
        })()
    const proposal: ActionProposal = { ...immutable, proposalHash: proposalFingerprint(immutable) }
    this.pendingProposal = proposal
    this.receipts.set(proposalId, this.newReceipt(proposal, 'proposed'))
    return cloneProposal(proposal)
  }

  approve(binding: ActionBinding): ActionApproval {
    const proposal = this.assertPendingBinding(binding)
    this.assertSessionStillBound(proposal)
    const approval: ActionApproval = {
      ...binding,
      approvalId: randomUUID(),
      approvedAt: Date.now(),
      expiresAt: proposal.expiresAt
    }
    this.pendingProposal = null
    this.approvedProposal = proposal
    this.approval = approval
    this.setReceiptStatus(proposal.proposalId, 'approved')
    return { ...approval }
  }

  reject(binding: ActionBinding): WorkReceipt {
    const proposal = this.assertPendingBinding(binding)
    this.pendingProposal = null
    return this.setReceiptStatus(proposal.proposalId, 'rejected')
  }

  cancel(binding: ActionBinding): WorkReceipt {
    const proposal = this.assertPendingBinding(binding)
    this.pendingProposal = null
    return this.setReceiptStatus(proposal.proposalId, 'cancelled')
  }

  async execute(approvalId: string): Promise<ActionExecutionResult> {
    if (!this.approval || !this.approvedProposal || this.approval.approvalId !== approvalId) throw new Error('approval is invalid or consumed')
    if (this.executing) throw new Error('an action is already executing')
    const proposal = this.approvedProposal
    if (this.approval.expiresAt <= Date.now()) {
      this.approval = null
      this.approvedProposal = null
      this.setReceiptStatus(proposal.proposalId, 'cancelled')
      throw new Error('approval expired')
    }
    this.assertSessionStillBound(proposal)
    this.approval = null
    this.approvedProposal = null
    this.executing = true
    this.executionSettled = new Promise(resolveSettled => { this.settleExecution = resolveSettled })
    this.disposeRequested = false
    const startedAt = Date.now()
    let status: ActionReceiptStatus = 'failed'
    let exitCode = 1
    let stdout = ''
    let stderr = ''
    let affectedFiles: string[] = []
    let errorCategory: WorkReceipt['errorCategory'] = 'process_error'

    try {
      if (proposal.actionType === 'command') {
        const result = await this.runCommand(proposal)
        exitCode = result.exitCode
        stdout = result.stdout
        stderr = result.stderr
        status = this.disposeRequested ? 'cancelled' : exitCode === 0 ? 'executed' : 'failed'
        errorCategory = status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'process_error' : undefined
      } else {
        if (this.disposeRequested) throw new Error('file action cancelled during shutdown')
        await this.runFileChange(proposal)
        exitCode = 0
        status = 'executed'
        affectedFiles = [proposal.exactTarget]
        errorCategory = undefined
      }
    } catch (error) {
      stderr = error instanceof Error ? error.message : 'controlled action failed'
      status = this.disposeRequested ? 'cancelled' : 'failed'
      errorCategory = status === 'cancelled' ? 'cancelled' : /path|symlink|target|workspace/i.test(stderr) ? 'path_boundary' : 'process_error'
    } finally {
      this.activeChild = null
      this.executing = false
      const settle = this.settleExecution
      this.settleExecution = null
      this.executionSettled = null
      settle?.()
    }

    const safeOut = sanitizeForShare(stdout.trim()).value.slice(0, 2_000)
    const safeErr = sanitizeForShare(stderr.trim()).value.slice(0, 2_000)
    const receipt = this.receipts.get(proposal.proposalId)!
    Object.assign(receipt, {
      status, startedAt, endedAt: Date.now(), decidedAt: receipt.decidedAt ?? startedAt,
      exitCode, stdoutSummary: safeOut, stderrSummary: safeErr,
      affectedFiles, errorCategory
    } satisfies Partial<WorkReceipt>)
    const diff = status === 'executed' && proposal.preview.kind === 'file_change'
      ? sanitizeForShare(proposal.preview.diff).value
      : ''
    const handoff = this.renderHandoff(receipt, diff)
    return { receipt: cloneReceipt(receipt), diff, handoff, safeShare: this.renderSafeShare(receipt, diff, handoff) }
  }

  getReceipts(): WorkReceipt[] {
    return [...this.receipts.values()].map(cloneReceipt)
  }

  async dispose(): Promise<void> {
    if (this.pendingProposal) this.setReceiptStatus(this.pendingProposal.proposalId, 'cancelled')
    if (this.approvedProposal) this.setReceiptStatus(this.approvedProposal.proposalId, 'cancelled')
    const execution = this.executionSettled
    this.pendingProposal = null
    this.approvedProposal = null
    this.approval = null
    this.disposeRequested = true
    const child = this.activeChild
    if (child) {
      try { child.kill() } catch { /* execution promise still owns final receipt */ }
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>(resolveEnd => {
          const timer = setTimeout(resolveEnd, 1_500)
          child.once('exit', () => { clearTimeout(timer); resolveEnd() })
          child.once('error', () => { clearTimeout(timer); resolveEnd() })
        })
      }
    }
    if (execution) await execution
  }

  private activeSession(workspaceLabel: string): SessionSnapshot {
    const session = this.getSessionSnapshot()
    const label = safeWorkspaceLabel(workspaceLabel)
    if (session.status !== 'running' || !session.sessionId || session.workspaceLabel !== label) {
      throw new Error('running session context is required')
    }
    return session
  }

  private assertSessionStillBound(proposal: ActionProposal): void {
    const current = this.activeSession(proposal.workspaceLabel)
    if (current.sessionId !== proposal.sessionId || this.workspaceId !== proposal.workspaceId) throw new Error('session or workspace binding changed')
  }

  private assertPendingBinding(binding: ActionBinding): ActionProposal {
    const proposal = this.pendingProposal
    if (!proposal || proposal.proposalId !== binding.proposalId) throw new Error('proposal is unavailable')
    const expectedHash = proposalFingerprint({ ...proposal, proposalHash: undefined } as never)
    if (proposal.expiresAt <= Date.now()) {
      this.pendingProposal = null
      this.setReceiptStatus(proposal.proposalId, 'cancelled')
      throw new Error('proposal expired')
    }
    if (proposal.proposalHash !== expectedHash || proposal.proposalHash !== binding.proposalHash ||
        proposal.sessionId !== binding.sessionId || proposal.workspaceId !== binding.workspaceId) {
      throw new Error('approval binding mismatch')
    }
    return proposal
  }

  private newReceipt(proposal: ActionProposal, status: ActionReceiptStatus): WorkReceipt {
    return {
      receiptId: randomUUID(), proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
      sessionId: proposal.sessionId, workspaceId: proposal.workspaceId, workspaceLabel: proposal.workspaceLabel,
      actionType: proposal.actionType, exactTarget: proposal.exactTarget, status,
      proposedAt: proposal.createdAt, stdoutSummary: '', stderrSummary: '', affectedFiles: []
    }
  }

  private setReceiptStatus(proposalId: string, status: ActionReceiptStatus): WorkReceipt {
    const receipt = this.receipts.get(proposalId)
    if (!receipt) throw new Error('proposal receipt is unavailable')
    receipt.status = status
    receipt.decidedAt = Date.now()
    return cloneReceipt(receipt)
  }

  private runCommand(proposal: ActionProposal): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (proposal.preview.kind !== 'command') throw new Error('command preview mismatch')
    const expectedArgs = ['-e', COMMAND_SOURCE, '--', this.marker, String(this.commandDelayMs)]
    if (proposal.exactTarget !== basename(this.executablePath) || JSON.stringify(proposal.preview.arguments) !== JSON.stringify(expectedArgs)) {
      throw new Error('command arguments changed after approval')
    }
    const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
    return new Promise((resolveRun, rejectRun) => {
      const child = spawn(this.executablePath, expectedArgs, {
        cwd: this.workspaceRoot,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ELECTRON_RUN_AS_NODE: '1', SystemRoot: systemRoot, WINDIR: systemRoot,
          ComSpec: process.env['ComSpec'] ?? `${systemRoot}\\System32\\cmd.exe`,
          TEMP: process.env['TEMP'] ?? process.env['TMP'], TMP: process.env['TMP'] ?? process.env['TEMP']
        }
      })
      this.activeChild = child
      let stdout = '', stderr = ''
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-4_096) })
      child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4_096) })
      const timer = setTimeout(() => { try { child.kill() } catch {} }, 5_000)
      child.once('error', error => { clearTimeout(timer); rejectRun(error) })
      child.once('exit', code => { clearTimeout(timer); resolveRun({ exitCode: code ?? -1, stdout, stderr }) })
    })
  }

  private async runFileChange(proposal: ActionProposal): Promise<void> {
    if (proposal.preview.kind !== 'file_change' || proposal.preview.relativePath !== proposal.exactTarget) throw new Error('file target changed after approval')
    if (this.fileWriteDelayMs > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, this.fileWriteDelayMs))
    if (this.disposeRequested) throw new Error('file action cancelled during shutdown')
    const target = await this.resolveSafeFileTarget(proposal.exactTarget)
    if (this.disposeRequested) throw new Error('file action cancelled during shutdown')
    await fs.writeFile(target, FILE_CONTENT, { encoding: 'utf8', flag: 'wx' })
  }
  private async resolveSafeFileTarget(relativeTarget: string): Promise<string> {
    const normalized = normalizedRelativeTarget(relativeTarget)
    const target = resolve(this.workspaceRoot, ...normalized.split('/'))
    const rel = relative(this.workspaceRoot, target)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('file target escapes workspace')
    const parts = normalized.split('/').slice(0, -1)
    let cursor = this.workspaceRoot
    for (const part of parts) {
      cursor = join(cursor, part)
      if (!existsSync(cursor)) break
      const stat = lstatSync(cursor)
      if (stat.isSymbolicLink()) throw new Error('symlink target is forbidden')
      if (!stat.isDirectory()) throw new Error('file target parent is not a directory')
    }
    mkdirSync(dirname(target), { recursive: true })
    const parentReal = await fs.realpath(dirname(target))
    const rootReal = await fs.realpath(this.workspaceRoot)
    const parentRel = relative(rootReal, parentReal)
    if (parentRel.startsWith('..') || isAbsolute(parentRel)) throw new Error('symlink target escapes workspace')
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink()) throw new Error('symlink target is forbidden')
      throw new Error('file target already exists')
    }
    if (this.fileTargetResolveDelayMs > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, this.fileTargetResolveDelayMs))
    return target
  }

  private renderHandoff(receipt: WorkReceipt, diff: string): string {
    const modified = receipt.affectedFiles.length ? receipt.affectedFiles.map(item => `- ${item}`).join('\n') : '- None'
    const completed = receipt.status === 'executed' ? `- ${receipt.actionType} executed with exit code ${receipt.exitCode}` : '- None'
    const pending = receipt.status === 'executed' ? '- None' : `- Action ended as ${receipt.status}`
    return sanitizeForShare(`# Controlled Action Handoff\n\n## Task\n\n- ${receipt.actionType}: ${receipt.exactTarget}\n\n## Completed\n\n${completed}\n\n## Not completed\n\n${pending}\n\n## Evidence\n\n- Receipt: ${receipt.receiptId}\n- Status: ${receipt.status}\n- Exit code: ${receipt.exitCode ?? 'not run'}\n\n## Modified files\n\n${modified}\n\n## Tests run\n\n- Deterministic controlled-action verification\n\n## Risks\n\n- Fixture-only alpha action\n\n## Next step\n\n- Review the receipt before any further action.\n${diff ? `\n## Diff\n\n\`\`\`diff\n${diff}\`\`\`\n` : ''}`).value
  }

  private renderSafeShare(receipt: WorkReceipt, diff: string, handoff: string): SafeSharePackage {
    const source = `# Safe Share Package\n\n## Work Receipt\n\n- Status: ${receipt.status}\n- Action: ${receipt.actionType}\n- Target: ${receipt.exactTarget}\n- Exit code: ${receipt.exitCode ?? 'not run'}\n\n${handoff}\n${diff ? `\n## Approved Diff\n\n${diff}` : ''}`
    const safe = sanitizeForShare(source)
    return { markdown: safe.value, redactionsApplied: safe.redactions }
  }
}
