import { homedir } from 'os'
import { join, basename } from 'path'
import { TranscriptWatcher } from './transcript-watcher.ts'
import { HttpObservationEventServer } from './event-server.ts'
import { HookInstaller, readInstalledHookEndpoint } from './hook-installer.ts'
import { AutoVerifier } from './auto-verifier.ts'
import { onRememberedContractChanged } from './contract-store.ts'
import { onWorkspaceSelectionChanged } from '../workspace-foundation/workspace-selection.ts'
import { displayPath, toPublicEvent, type ObservedAgentEventInternal } from './agent-events.ts'
import type {
  AutoVerificationRevocationReason, AutoVerifySettings, HookHealth, HookPreviewResult,
  ObservedAgentEvent, ObservedEventName, ObservedSession, ObservedSessionStatus,
  ObservationStatus, VerificationCompletedPayload
} from '../../../shared/observation-types.ts'

const IDLE_MS = 60_000

const STATUS_BY_EVENT: Partial<Record<ObservedEventName, ObservedSessionStatus>> = {
  'session:start': 'idle',
  'user:prompt': 'thinking',
  'tool:start': 'working',
  'tool:end': 'working',
  'assistant:stop': 'attention',
  'subagent:start': 'working',
  'subagent:end': 'working',
  'compact': 'working',
  'error': 'error',
  'notification': 'attention',
  'session:end': 'ended'
}

/** Internal session with the full cwd (never crosses IPC). */
type InternalSession = ObservedSession & { cwd: string }

export interface ObservationManagerDeps {
  onSessionsChanged: (sessions: ObservedSession[]) => void
  onVerificationCompleted: (payload: VerificationCompletedPayload) => void
  /** Receives renderer-safe events only — never cwd/raw/transcriptPath. */
  onEvent: (event: ObservedAgentEvent) => void
  onStatusChanged?: (status: ObservationStatus) => void
  /** Test seams: override home-derived paths. */
  claudeProjectsDir?: string
  codexSessionsDir?: string
  hookSettingsPath?: string
  hookBackupPath?: string
  /** Append-only JSONL audit trail for auto-verification runs. */
  auditPath?: string
}

export class ObservationManager {
  private readonly deps: ObservationManagerDeps
  private readonly watcher = new TranscriptWatcher()
  private readonly server = new HttpObservationEventServer()
  private readonly autoVerifier: AutoVerifier
  private sessions = new Map<string, InternalSession>()
  private idleTimers = new Map<string, NodeJS.Timeout>()
  private enabled = false
  private lastError: string | null = null
  private installer: HookInstaller | null = null
  private hookSettingsPathValue: string | null = null
  private homeValue = homedir()
  private watchedClaudeValue = ''
  private watchedCodexValue = ''
  private failureKind: 'server' | 'watcher' | null = null
  private readonly unsubscribeContract: () => void
  private readonly unsubscribeWorkspace: () => void

  constructor(deps: ObservationManagerDeps) {
    this.deps = deps
    this.autoVerifier = new AutoVerifier({
      onCompleted: (r) => this.deps.onVerificationCompleted({ trigger: 'auto:session-end', receipt: r }),
      onStatusChanged: () => this.notifyStatusChanged(),
      auditPath: deps.auditPath ?? null
    })
    this.unsubscribeContract = onRememberedContractChanged(() => this.autoVerifier.validateBindings())
    this.unsubscribeWorkspace = onWorkspaceSelectionChanged(() => this.autoVerifier.validateBindings())
    this.watcher.onEvent((e) => { void this.handleEvent(e) })
    this.server.onEvent((e) => { void this.handleEvent(e) })
  }

  private key(event: ObservedAgentEventInternal): string {
    return `${event.agentKind}:${event.sessionId}`
  }

  async enable(): Promise<void> {
    if (this.enabled) return
    this.enabled = true
    this.lastError = null
    this.failureKind = null
    const home = this.homeValue
    const settingsPath = this.deps.hookSettingsPath ?? join(home, '.claude', 'settings.json')
    const backupPath = this.deps.hookBackupPath ?? join(home, '.claude', 'agent-workbench-hooks.backup.json')
    const claudeProjects = this.deps.claudeProjectsDir ?? join(home, '.claude', 'projects')
    const codexSessions = this.deps.codexSessionsDir ?? join(home, '.codex', 'sessions')
    this.watchedClaudeValue = claudeProjects
    this.watchedCodexValue = codexSessions
    this.hookSettingsPathValue = settingsPath

    let endpoint: { port: number; token: string }
    try {
      endpoint = await this.server.start(readInstalledHookEndpoint(settingsPath) ?? undefined)
    } catch {
      this.lastError = 'Observation server could not start'
      this.failureKind = 'server'
      this.enabled = false
      this.notifyStatusChanged()
      return
    }

    this.installer = new HookInstaller({
      settingsPath,
      backupPath,
      baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`,
      port: endpoint.port,
      token: endpoint.token
    })
    try {
      await this.watcher.start({ claudeProjects, codexSessions })
    } catch {
      await this.server.stop()
      this.lastError = 'Transcript watcher could not start'
      this.failureKind = 'watcher'
      this.enabled = false
      this.notifyStatusChanged()
      return
    }
    this.notifyStatusChanged()
  }

  async disable(reason: AutoVerificationRevocationReason = 'OBSERVATION_DISABLED'): Promise<void> {
    this.autoVerifier.disable(reason)
    this.enabled = false
    for (const timer of this.idleTimers.values()) clearTimeout(timer)
    this.idleTimers.clear()
    await this.watcher.stop()
    await this.server.stop()
    this.notifyStatusChanged()
  }

  async dispose(): Promise<void> {
    await this.disable('APP_EXITED')
    this.unsubscribeContract()
    this.unsubscribeWorkspace()
  }

  status(): ObservationStatus {
    const hooksInstalled = this.installer?.isInstalled() ?? false
    return {
      enabled: this.enabled,
      hooksInstalled,
      hookHealth: this.hookHealth(),
      hookConfigPath: hooksInstalled && this.hookSettingsPathValue ? basename(this.hookSettingsPathValue) : null,
      activeSessions: this.sessionsForPush().filter((s) => s.status !== 'ended'),
      lastError: this.lastError,
      autoVerify: this.autoVerifier.getSettings(),
      auditHealth: this.autoVerifier.getAuditHealth(),
      watchedDirs: {
        claudeProjects: this.toTilde(this.watchedClaudeValue),
        codexSessions: this.toTilde(this.watchedCodexValue)
      }
    }
  }

  installHooksPreview(): HookPreviewResult {
    if (!this.installer) return { ok: false, backupPath: null, reason: 'observation is disabled' }
    const p = this.installer.preview()
    return { ok: p.ok, backupPath: p.backupPath, reason: p.reason, previewJson: p.displayJson, targetPath: p.targetPath }
  }

  confirmInstallHooks(): { ok: boolean; backupPath: string | null; reason?: string } {
    if (!this.installer) return { ok: false, backupPath: null, reason: 'observation is disabled' }
    const result = this.installer.install()
    this.notifyStatusChanged()
    return { ...result, backupPath: result.backupPath ? basename(result.backupPath) : null }
  }

  uninstallHooks(): { ok: boolean; restored: boolean } {
    if (!this.installer) return { ok: false, restored: false }
    const result = this.installer.uninstall()
    this.notifyStatusChanged()
    return result
  }

  setAutoVerify(settings: AutoVerifySettings): void {
    if (settings.autoVerifyEnabled) {
      if (!this.enabled) throw new Error('Enable Observation before authorizing auto verification')
      this.autoVerifier.enable(settings)
    } else {
      this.autoVerifier.disable('USER_DISABLED')
    }
  }

  getLastReceipt(): unknown {
    return this.autoVerifier.getLastReceipt()
  }

  private async handleEvent(event: ObservedAgentEventInternal): Promise<void> {
    if (!this.enabled) return
    // Only the display-safe projection ever reaches the renderer.
    this.deps.onEvent(toPublicEvent(event))
    this.updateSession(event)
    try {
      await this.autoVerifier.handleEvent(event)
    } catch {
      /* swallow */
    }
  }

  private hookHealth(): HookHealth {
    if (this.failureKind === 'server') {
      return { state: 'SERVER_UNAVAILABLE', reason: 'Observation server could not start', action: 'RESTART_OBSERVATION' }
    }
    if (this.failureKind === 'watcher') {
      return { state: 'WATCHER_ERROR', reason: 'Transcript watcher could not start', action: 'RESTART_OBSERVATION' }
    }
    const inspection = this.installer?.inspectEndpoint()
    if (!inspection?.installed) return { state: 'NOT_INSTALLED', reason: null, action: 'INSTALL' }
    if (!this.server.isRunning()) {
      return { state: 'SERVER_UNAVAILABLE', reason: 'Observation server is not running', action: 'RESTART_OBSERVATION' }
    }
    if (!inspection.matchesActiveEndpoint) {
      return { state: 'INSTALLED_DRIFTED', reason: 'Installed Hook endpoint does not match the active Observation server', action: 'REPAIR' }
    }
    return { state: 'INSTALLED_HEALTHY', reason: null, action: 'NONE' }
  }

  private notifyStatusChanged(): void {
    this.deps.onStatusChanged?.(this.status())
  }

  private updateSession(event: ObservedAgentEventInternal): void {
    const k = this.key(event)
    const existing = this.sessions.get(k)
    const now = event.timestamp
    const session: InternalSession = existing
      ? { ...existing, lastEventAt: now, eventCount: existing.eventCount + 1, status: STATUS_BY_EVENT[event.event] ?? existing.status }
      : {
          agentKind: event.agentKind,
          sessionId: event.sessionId,
          cwd: event.cwd,
          displayPath: displayPath(event.cwd),
          status: STATUS_BY_EVENT[event.event] ?? 'idle',
          startedAt: now,
          lastEventAt: now,
          eventCount: 1
        }
    this.sessions.set(k, session)
    this.resetIdle(k, session)
    this.deps.onSessionsChanged(this.sessionsForPush())
  }

  private sessionsForPush(): ObservedSession[] {
    return [...this.sessions.values()]
      .map(({ cwd: _cwd, ...pub }) => pub)
      .sort((a, b) => b.lastEventAt - a.lastEventAt)
      .slice(0, 50)
  }

  private toTilde(p: string): string {
    const home = this.homeValue
    if (home && p.startsWith(home)) return '~' + p.slice(home.length)
    return p
  }

  private resetIdle(k: string, session: InternalSession): void {
    const existing = this.idleTimers.get(k)
    if (existing) clearTimeout(existing)
    if (session.status === 'ended') return
    const timer = setTimeout(() => {
      const cur = this.sessions.get(k)
      if (cur && cur.status !== 'ended') {
        this.sessions.set(k, { ...cur, status: 'sleeping' })
        this.deps.onSessionsChanged(this.sessionsForPush())
      }
      this.idleTimers.delete(k)
    }, IDLE_MS)
    timer.unref?.()
    this.idleTimers.set(k, timer)
  }
}
