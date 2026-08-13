import { homedir } from 'os'
import { join, basename } from 'path'
import { TranscriptWatcher } from './transcript-watcher.ts'
import { HttpObservationEventServer } from './event-server.ts'
import { HookInstaller, type HookPreview } from './hook-installer.ts'
import { AutoVerifier } from './auto-verifier.ts'
import { displayPath, toPublicEvent, type ObservedAgentEventInternal } from './agent-events.ts'
import type {
  AutoVerifySettings, HookPreviewResult, ObservedAgentEvent, ObservedEventName, ObservedSession,
  ObservedSessionStatus, ObservationStatus, VerificationCompletedPayload
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

  constructor(deps: ObservationManagerDeps) {
    this.deps = deps
    this.autoVerifier = new AutoVerifier({
      onCompleted: (r) => this.deps.onVerificationCompleted({ trigger: 'auto:session-end', receipt: r }),
      auditPath: deps.auditPath ?? null
    })
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
    try {
      const { port, token } = await this.server.start()
      const home = this.homeValue
      const settingsPath = this.deps.hookSettingsPath ?? join(home, '.claude', 'settings.json')
      const backupPath = this.deps.hookBackupPath ?? join(home, '.claude', 'agent-workbench-hooks.backup.json')
      const claudeProjects = this.deps.claudeProjectsDir ?? join(home, '.claude', 'projects')
      const codexSessions = this.deps.codexSessionsDir ?? join(home, '.codex', 'sessions')
      this.watchedClaudeValue = claudeProjects
      this.watchedCodexValue = codexSessions
      this.hookSettingsPathValue = settingsPath
      this.installer = new HookInstaller({
        settingsPath,
        backupPath,
        baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`,
        port,
        token
      })
      await this.watcher.start({ claudeProjects, codexSessions })
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.enabled = false
    }
  }

  async disable(): Promise<void> {
    this.enabled = false
    for (const timer of this.idleTimers.values()) clearTimeout(timer)
    this.idleTimers.clear()
    await this.watcher.stop()
    await this.server.stop()
  }

  status(): ObservationStatus {
    const hooksInstalled = this.installer?.isInstalled() ?? false
    return {
      enabled: this.enabled,
      hooksInstalled,
      hookConfigPath: hooksInstalled && this.hookSettingsPathValue ? basename(this.hookSettingsPathValue) : null,
      activeSessions: this.sessionsForPush().filter((s) => s.status !== 'ended'),
      lastError: this.lastError,
      autoVerify: this.autoVerifier.getSettings(),
      watchedDirs: {
        claudeProjects: this.toTilde(this.watchedClaudeValue),
        codexSessions: this.toTilde(this.watchedCodexValue)
      }
    }
  }

  installHooksPreview(): HookPreviewResult {
    if (!this.installer) return { ok: false, backupPath: null, reason: 'observation is disabled' }
    const p = this.installer.preview()
    return { ok: p.ok, backupPath: p.backupPath, reason: p.reason, previewJson: p.mergedJson, targetPath: p.targetPath }
  }

  confirmInstallHooks(): { ok: boolean; backupPath: string | null; reason?: string } {
    if (!this.installer) return { ok: false, backupPath: null, reason: 'observation is disabled' }
    return this.installer.install()
  }

  uninstallHooks(): { ok: boolean; restored: boolean } {
    if (!this.installer) return { ok: false, restored: false }
    return this.installer.uninstall()
  }

  setAutoVerify(settings: AutoVerifySettings): void {
    if (settings.autoVerifyEnabled) this.autoVerifier.enable(settings)
    else this.autoVerifier.disable()
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
