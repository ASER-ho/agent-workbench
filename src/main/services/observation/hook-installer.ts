import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { basename, dirname } from 'path'

/**
 * Safe-merge installer for Claude Code hooks in `~/.claude/settings.json`.
 *
 * Properties:
 *  - never overwrites an existing hook entry that is not ours (marker-preserving);
 *  - dedups on re-install via the `agent-workbench` marker;
 *  - writes a timestamped backup before any modification;
 *  - refuses to touch a malformed settings.json;
 *  - uninstall restores the backup (or strips only our entries).
 */

const MARKER = 'agent-workbench'
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']
const SIMPLE_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure', 'SubagentStart',
  'SubagentStop', 'PreCompact', 'PostCompact', 'Notification', 'SessionEnd', 'Elicitation'
]
const TOOL_MATCHER = 'Bash|Edit|Write|Read|Glob|Grep'

type HookEntry = Record<string, unknown>
type HookGroup = { matcher?: string; hooks: HookEntry[] }
type SettingsFile = Record<string, unknown>

export interface HookInstallerOptions {
  settingsPath: string
  backupPath: string
  /** e.g. `(port, token) => `http://127.0.0.1:${port}/state?token=${token}`` */
  baseUrl: (port: number, token: string) => string
  port: number
  token: string
}

export interface HookPreview {
  ok: boolean
  targetPath: string
  backupPath: string
  mergedJson: string
  reason?: string
}

export class HookInstaller {
  private readonly opts: HookInstallerOptions

  constructor(opts: HookInstallerOptions) {
    this.opts = opts
  }

  isInstalled(): boolean {
    const settings = this.read()
    return settings !== null && JSON.stringify(settings).includes(MARKER)
  }

  preview(): HookPreview {
    const base = this.read()
    if (base === null) {
      return { ok: false, targetPath: basename(this.opts.settingsPath), backupPath: basename(this.opts.backupPath), mergedJson: '', reason: 'settings.json is malformed; not overwriting' }
    }
    const merged = this.merge(base)
    return { ok: true, targetPath: basename(this.opts.settingsPath), backupPath: basename(this.opts.backupPath), mergedJson: JSON.stringify(merged, null, 2) }
  }

  install(): { ok: boolean; backupPath: string | null; reason?: string } {
    const base = this.read()
    if (base === null) {
      return { ok: false, backupPath: null, reason: 'settings.json is malformed; refusing to overwrite' }
    }
    try {
      mkdirSync(dirname(this.opts.backupPath), { recursive: true })
      writeFileSync(this.opts.backupPath, JSON.stringify(base, null, 2), 'utf8')
    } catch (err) {
      return { ok: false, backupPath: null, reason: `backup failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    const merged = this.merge(base)
    try {
      mkdirSync(dirname(this.opts.settingsPath), { recursive: true })
      writeFileSync(this.opts.settingsPath, JSON.stringify(merged, null, 2), 'utf8')
    } catch (err) {
      return { ok: false, backupPath: this.opts.backupPath, reason: `write failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { ok: true, backupPath: this.opts.backupPath }
  }

  uninstall(): { ok: boolean; restored: boolean } {
    const current = this.read()
    if (current !== null) {
      // Precise removal from the CURRENT settings, preserving any changes the
      // user made after we installed. This is the safe default.
      try {
        const cleaned = this.stripMarker(current)
        writeFileSync(this.opts.settingsPath, JSON.stringify(cleaned, null, 2), 'utf8')
        return { ok: true, restored: false }
      } catch {
        return { ok: false, restored: false }
      }
    }
    // Current settings are malformed/unreadable -> catastrophic recovery from
    // the install-time backup. Never the default; only when we cannot operate.
    if (existsSync(this.opts.backupPath)) {
      try {
        const backup = JSON.parse(readFileSync(this.opts.backupPath, 'utf8')) as SettingsFile
        writeFileSync(this.opts.settingsPath, JSON.stringify(backup, null, 2), 'utf8')
        return { ok: true, restored: true }
      } catch {
        return { ok: false, restored: false }
      }
    }
    return { ok: false, restored: false }
  }

  private read(): SettingsFile | null {
    if (!existsSync(this.opts.settingsPath)) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.opts.settingsPath, 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as SettingsFile
    } catch {
      return null
    }
  }

  private hookUrl(): string {
    const base = this.opts.baseUrl(this.opts.port, this.opts.token)
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}src=${MARKER}`
  }

  private hookEntry(): HookEntry {
    return { type: 'http', url: this.hookUrl(), timeout: 5 }
  }

  private merge(base: SettingsFile): SettingsFile {
    const hooks = (base['hooks'] && typeof base['hooks'] === 'object' && !Array.isArray(base['hooks']))
      ? { ...(base['hooks'] as Record<string, unknown>) }
      : {}
    for (const event of SIMPLE_EVENTS) {
      const groups = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : []
      if (!JSON.stringify(groups).includes(MARKER)) {
        groups.push({ hooks: [this.hookEntry()] })
      }
      hooks[event] = groups
    }
    for (const event of TOOL_EVENTS) {
      const groups = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : []
      if (!JSON.stringify(groups).includes(MARKER)) {
        groups.push({ matcher: TOOL_MATCHER, hooks: [this.hookEntry()] })
      }
      hooks[event] = groups
    }
    return { ...base, hooks }
  }

  private stripMarker(base: SettingsFile): SettingsFile {
    const hooks = (base['hooks'] && typeof base['hooks'] === 'object' && !Array.isArray(base['hooks']))
      ? { ...(base['hooks'] as Record<string, unknown>) }
      : {}
    for (const key of Object.keys(hooks)) {
      const groups = Array.isArray(hooks[key]) ? (hooks[key] as HookGroup[]) : []
      const kept = groups.filter((g) => !JSON.stringify(g.hooks ?? []).includes(MARKER))
      if (kept.length === 0) delete hooks[key]
      else hooks[key] = kept
    }
    return { ...base, hooks }
  }
}
