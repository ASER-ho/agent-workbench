import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import type {
  AgentDescriptor,
  SessionLaunchPlan,
  SessionReadiness,
  SessionSnapshot
} from '../../shared/session-types'
export type {
  AgentDescriptor,
  AgentSessionStatus,
  SessionLaunchPlan,
  SessionReadiness,
  SessionSnapshot
} from '../../shared/session-types'
export interface SessionManagerOptions {
  executablePath?: string
  responseTimeoutMs?: number
  confirmationTtlMs?: number
  fixtureMarker?: string
  startDelayMs?: number
  stopGraceMs?: number
  stopKillWaitMs?: number
}

export interface AgentAdapter {
  readonly descriptor: AgentDescriptor
  detect(): boolean
  spawn(handlers: {
    onData: (data: string) => void
    onError: (error: Error) => void
    onExit: (code: number | null) => void
  }): ChildProcessWithoutNullStreams
}

const STUB_SOURCE = String.raw`
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
process.stdout.write('[stub] ready\n')
rl.on('line', (line) => {
  if (line === '__STOP__') { process.stdout.write('[stub] stopped\n'); process.exit(0) }
  if (line === '__CRASH__') { process.stderr.write('[stub] crash requested\n'); process.exit(17) }
  if (line === '__TIMEOUT__') return
  const response = '[stub] received: ' + line + '\n'
  const split = Math.max(1, Math.floor(response.length / 2))
  process.stdout.write(response.slice(0, split))
  setTimeout(() => process.stdout.write(response.slice(split)), 15)
})
process.on('SIGTERM', () => process.exit(0))
`

export class StubAgentAdapter implements AgentAdapter {
  readonly descriptor: AgentDescriptor
  private readonly executablePath: string
  private readonly fixtureMarker: string

  constructor(executablePath: string, fixtureMarker: string) {
    this.executablePath = executablePath
    this.fixtureMarker = fixtureMarker
    this.descriptor = {
      adapterId: 'stub',
      agentLabel: 'Deterministic Stub Agent',
      providerLabel: 'Local Stub',
      modelLabel: 'deterministic-v1',
      executableBasename: basename(executablePath)
    }
  }

  detect(): boolean {
    return existsSync(this.executablePath)
  }

  spawn(handlers: {
    onData: (data: string) => void
    onError: (error: Error) => void
    onExit: (code: number | null) => void
  }): ChildProcessWithoutNullStreams {
    const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
    const env: NodeJS.ProcessEnv = {
      ELECTRON_RUN_AS_NODE: '1',
      AGENT_WORKBENCH_STUB: '1',
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      ComSpec: process.env['ComSpec'] ?? `${systemRoot}\\System32\\cmd.exe`,
      TEMP: process.env['TEMP'] ?? process.env['TMP'],
      TMP: process.env['TMP'] ?? process.env['TEMP']
    }
    const child = spawn(this.executablePath, ['-e', STUB_SOURCE, '--', this.fixtureMarker], {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', handlers.onData)
    child.stderr.on('data', handlers.onData)
    child.on('error', handlers.onError)
    child.on('exit', handlers.onExit)
    child.stdin.on('error', () => { /* writes are bounded by lifecycle state */ })
    return child
  }
}

const FULL_PATH_RE = /(^[A-Za-z]:[\\/])|(^\\\\)|(^\/(?:Users|home)\/)|(^~[\\/])|([\\/]\.\.[\\/])/

function isSafeWorkspaceLabel(value: string): boolean {
  const label = String(value ?? '').trim()
  const hasUnsafePrefix = label.startsWith('/') || label.startsWith('../') || label.startsWith('..\\')
  return label.length > 0 && label.length <= 80 && label !== 'Current Workspace' && label !== '(not set)' &&
    !hasUnsafePrefix && !FULL_PATH_RE.test(label)
}

function fingerprintPlan(input: Omit<SessionLaunchPlan, 'confirmationId' | 'fingerprint' | 'expiresAt'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export class AgentSessionManager {
  private readonly adapter: StubAgentAdapter
  private readonly responseTimeoutMs: number
  private readonly confirmationTtlMs: number
  private readonly startDelayMs: number
  private readonly stopGraceMs: number
  private readonly stopKillWaitMs: number
  private pendingPlan: SessionLaunchPlan | null = null
  private child: ChildProcessWithoutNullStreams | null = null
  private snapshot: SessionSnapshot
  private dataHandlers: Array<(data: string) => void> = []
  private statusHandlers: Array<(snapshot: SessionSnapshot) => void> = []
  private responseTimer: ReturnType<typeof setTimeout> | null = null
  private awaitingResponse = false
  private stopRequested = false
  private timeoutRequested = false

  constructor(options: SessionManagerOptions = {}) {
    const executablePath = options.executablePath ?? process.execPath
    this.adapter = new StubAgentAdapter(executablePath, options.fixtureMarker ?? process.env['AGENT_WORKBENCH_FIXTURE_ROOT'] ?? 'agent-workbench-stub')
    this.responseTimeoutMs = Math.max(50, options.responseTimeoutMs ?? Number(process.env['AGENT_WORKBENCH_STUB_TIMEOUT_MS'] ?? 30_000))
    this.confirmationTtlMs = Math.max(1_000, options.confirmationTtlMs ?? 120_000)
    this.startDelayMs = Math.max(0, Math.min(5_000, options.startDelayMs ?? Number(process.env['AGENT_WORKBENCH_STUB_START_DELAY_MS'] ?? 0)))
    this.stopGraceMs = Math.max(10, Math.min(5_000, options.stopGraceMs ?? 500))
    this.stopKillWaitMs = Math.max(10, Math.min(10_000, options.stopKillWaitMs ?? 1_500))
    this.snapshot = { ...this.adapter.descriptor, status: 'stopped', updatedAt: Date.now() }
  }

  onData(handler: (data: string) => void): () => void {
    this.dataHandlers.push(handler)
    return () => { this.dataHandlers = this.dataHandlers.filter(item => item !== handler) }
  }

  onStatus(handler: (snapshot: SessionSnapshot) => void): () => void {
    this.statusHandlers.push(handler)
    return () => { this.statusHandlers = this.statusHandlers.filter(item => item !== handler) }
  }

  getSnapshot(): SessionSnapshot {
    return { ...this.snapshot }
  }

  getReadiness(input: { workspaceLabel: string; confirmationId?: string }): SessionReadiness {
    const workspaceSelected = isSafeWorkspaceLabel(input.workspaceLabel)
    const executableAvailable = this.adapter.detect()
    const providerKnown = Boolean(this.adapter.descriptor.providerLabel)
    const modelKnown = Boolean(this.adapter.descriptor.modelLabel)
    const safetySatisfied = workspaceSelected && this.adapter.descriptor.adapterId === 'stub'
    const noActiveSession = !this.child && !['starting', 'running', 'stopping'].includes(this.snapshot.status)
    const userConfirmation = Boolean(
      input.confirmationId &&
      this.pendingPlan &&
      this.pendingPlan.confirmationId === input.confirmationId &&
      this.pendingPlan.workspaceLabel === input.workspaceLabel &&
      this.pendingPlan.expiresAt > Date.now() &&
      this.isPlanFingerprintValid(this.pendingPlan)
    )
    const readyToPrepare = workspaceSelected && executableAvailable && providerKnown && modelKnown && safetySatisfied && noActiveSession
    return {
      workspaceSelected,
      executableAvailable,
      providerKnown,
      modelKnown,
      safetySatisfied,
      noActiveSession,
      userConfirmation,
      readyToPrepare,
      readyToStart: readyToPrepare && userConfirmation
    }
  }

  prepareLaunch(input: { workspaceLabel: string }): SessionLaunchPlan {
    const readiness = this.getReadiness(input)
    if (!readiness.noActiveSession) throw new Error('active session exists')
    if (!readiness.readyToPrepare) throw new Error('session readiness failed')
    const immutable = {
      ...this.adapter.descriptor,
      workspaceLabel: input.workspaceLabel.trim(),
      riskCodes: ['workspace_access', 'local_process'] as Array<'workspace_access' | 'local_process'>,
      canStop: true as const
    }
    const plan: SessionLaunchPlan = {
      ...immutable,
      confirmationId: randomUUID(),
      fingerprint: fingerprintPlan(immutable),
      expiresAt: Date.now() + this.confirmationTtlMs
    }
    this.pendingPlan = plan
    return { ...plan, riskCodes: [...plan.riskCodes] }
  }

  async start(confirmationId: string): Promise<SessionSnapshot> {
    const plan = this.pendingPlan
    if (!plan || plan.confirmationId !== confirmationId || plan.expiresAt <= Date.now() || !this.isPlanFingerprintValid(plan)) {
      throw new Error('confirmation is invalid or expired')
    }
    const readiness = this.getReadiness({ workspaceLabel: plan.workspaceLabel, confirmationId })
    if (!readiness.readyToStart) throw new Error('confirmation readiness failed')
    this.pendingPlan = null
    this.stopRequested = false
    this.timeoutRequested = false
    this.updateSnapshot({
      ...this.adapter.descriptor,
      sessionId: randomUUID(),
      workspaceLabel: plan.workspaceLabel,
      status: 'starting',
      pid: undefined,
      exitCode: undefined,
      reason: undefined
    })
    let child: ChildProcessWithoutNullStreams | null = null
    try {
      child = this.adapter.spawn({
        onData: data => this.handleData(child!, data),
        onError: error => this.handleSpawnError(child!, error),
        onExit: code => this.handleExit(child!, code)
      })
      this.child = child
      await new Promise<void>((resolve, reject) => {
        child!.once('spawn', resolve)
        child!.once('error', reject)
      })
      if (this.startDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.startDelayMs))
      if (this.child !== child || this.snapshot.status !== 'starting') throw new Error('stub agent start was cancelled')
      this.updateSnapshot({ status: 'running', pid: child.pid })
      return this.getSnapshot()
    } catch {
      if (child && this.child === child && !this.stopRequested) {
        try { child.kill() } catch { /* process did not start */ }
        this.child = null
        this.updateSnapshot({ status: 'error', pid: undefined, reason: 'spawn_error' })
      }
      throw new Error('stub agent failed to start')
    }
  }

  async input(text: string): Promise<void> {
    if (!this.child || this.snapshot.status !== 'running') throw new Error('session is not running')
    const task = String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 8_000)
    if (!task) return
    this.clearResponseTimer()
    this.awaitingResponse = true
    const child = this.child
    this.responseTimer = setTimeout(() => {
      if (this.child !== child || this.snapshot.status !== 'running') return
      this.timeoutRequested = true
      try { child.kill() } catch { this.handleExit(child, null) }
    }, this.responseTimeoutMs)
    this.child.stdin.write(`${task}\n`)
  }

  async stop(): Promise<SessionSnapshot> {
    if (!this.child) {
      this.updateSnapshot({ status: 'stopped', pid: undefined })
      return this.getSnapshot()
    }
    this.clearResponseTimer()
    this.stopRequested = true
    this.updateSnapshot({ status: 'stopping' })
    const child = this.child
    try {
      child.stdin.write('__STOP__\n', error => {
        if (error && this.child === child) {
          try { child.kill() } catch { /* already exited */ }
        }
      })
    } catch {
      try { child.kill() } catch { /* already exited */ }
    }
    let ended = await this.waitForChildEnd(child, this.stopGraceMs)
    if (!ended && this.child === child) {
      try { child.kill() } catch { /* already exited */ }
      ended = await this.waitForChildEnd(child, this.stopKillWaitMs)
    }
    if (!ended && this.child === child) {
      this.timeoutRequested = false
      this.updateSnapshot({ status: 'error', pid: child.pid, reason: 'stop_timeout' })
    }
    return this.getSnapshot()
  }

  async dispose(): Promise<void> {
    this.pendingPlan = null
    this.clearResponseTimer()
    if (this.child) await this.stop()
  }

  private isPlanFingerprintValid(plan: SessionLaunchPlan): boolean {
    const immutable = {
      adapterId: plan.adapterId,
      agentLabel: plan.agentLabel,
      providerLabel: plan.providerLabel,
      modelLabel: plan.modelLabel,
      executableBasename: plan.executableBasename,
      workspaceLabel: plan.workspaceLabel,
      riskCodes: plan.riskCodes,
      canStop: plan.canStop
    }
    return fingerprintPlan(immutable) === plan.fingerprint
  }

  private handleData(child: ChildProcessWithoutNullStreams, data: string): void {
    if (this.child !== child) return
    const chunk = String(data)
    if (this.awaitingResponse && chunk.trim() !== '[stub] ready') {
      this.clearResponseTimer()
    }
    this.dataHandlers.forEach(handler => handler(chunk))
  }

  private handleSpawnError(child: ChildProcessWithoutNullStreams, _error: Error): void {
    if (this.child !== child) return
    this.clearResponseTimer()
    this.child = null
    if (this.stopRequested) this.updateSnapshot({ status: 'stopped', pid: undefined })
    else this.updateSnapshot({ status: 'error', pid: undefined, reason: 'spawn_error' })
    this.stopRequested = false
    this.timeoutRequested = false
  }

  private handleExit(child: ChildProcessWithoutNullStreams, code: number | null): void {
    if (this.child !== child) return
    this.clearResponseTimer()
    this.child = null
    const exitCode = code ?? -1
    if (this.timeoutRequested) {
      this.updateSnapshot({ status: 'timed_out', pid: undefined, exitCode, reason: 'response_timeout' })
    } else if (this.stopRequested) {
      this.updateSnapshot({ status: 'stopped', pid: undefined, exitCode })
    } else if (exitCode === 0) {
      this.updateSnapshot({ status: 'exited', pid: undefined, exitCode, reason: 'process_exit' })
    } else {
      this.updateSnapshot({ status: 'crashed', pid: undefined, exitCode, reason: 'process_exit' })
    }
    this.stopRequested = false
    this.timeoutRequested = false
  }

  private updateSnapshot(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, updatedAt: Date.now() }
    const current = this.getSnapshot()
    this.statusHandlers.forEach(handler => handler(current))
  }

  private clearResponseTimer(): void {
    if (this.responseTimer) clearTimeout(this.responseTimer)
    this.responseTimer = null
    this.awaitingResponse = false
  }

  private waitForChildEnd(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout>
      const finish = (ended: boolean) => {
        clearTimeout(timer)
        child.removeListener('exit', onExit)
        child.removeListener('error', onError)
        resolve(ended)
      }
      const onExit = () => finish(true)
      const onError = () => finish(true)
      child.once('exit', onExit)
      child.once('error', onError)
      timer = setTimeout(() => finish(false), timeoutMs)
    })
  }
}
