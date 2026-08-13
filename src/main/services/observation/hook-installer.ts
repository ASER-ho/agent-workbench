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
  displayJson: string
  reason?: string
}

export interface HookEndpointInspection {
  installed: boolean
  matchesActiveEndpoint: boolean
  reason: 'NOT_INSTALLED' | 'CONFIG_UNREADABLE' | 'ENDPOINT_MISMATCH' | 'INCOMPLETE_INSTALLATION' | null
}

export interface InstalledHookEndpoint {
  port: number
  token: string
}

/** Main-only recovery of a previously installed loopback endpoint. */
export function readInstalledHookEndpoint(settingsPath: string): InstalledHookEndpoint | null {
  if (!existsSync(settingsPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const match = JSON.stringify(parsed).match(/http:\/\/127\.0\.0\.1:(\d+)\/state\?token=([a-f0-9]{32})&src=agent-workbench/i)
    if (!match) return null
    const port = Number(match[1])
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return { port, token: match[2] }
  } catch {
    return null
  }
}

export class HookInstaller {
  private readonly opts: HookInstallerOptions

  constructor(opts: HookInstallerOptions) {
    this.opts = opts
  }

  isInstalled(): boolean {
    return this.inspectEndpoint().installed
  }

  inspectEndpoint(): HookEndpointInspection {
    const settings = this.read()
    if (settings === null) return { installed: false, matchesActiveEndpoint: false, reason: 'CONFIG_UNREADABLE' }
    const serialized = JSON.stringify(settings)
    if (!serialized.includes(MARKER)) return { installed: false, matchesActiveEndpoint: false, reason: 'NOT_INSTALLED' }
    const hooks = settings['hooks'] && typeof settings['hooks'] === 'object' && !Array.isArray(settings['hooks'])
      ? settings['hooks'] as Record<string, unknown>
      : {}
    const expected = this.hookUrl()
    const expectedEvents = [...SIMPLE_EVENTS, ...TOOL_EVENTS]
    for (const event of expectedEvents) {
      const groups = Array.isArray(hooks[event]) ? hooks[event] as HookGroup[] : []
      const entries = groups.flatMap((group) => Array.isArray(group.hooks) ? group.hooks : [])
      const awEntries = entries.filter((entry) => JSON.stringify(entry).includes(MARKER))
      if (awEntries.length === 0) return { installed: true, matchesActiveEndpoint: false, reason: 'INCOMPLETE_INSTALLATION' }
      if (awEntries.some((entry) => entry['type'] !== 'http' || entry['url'] !== expected)) {
        return { installed: true, matchesActiveEndpoint: false, reason: 'ENDPOINT_MISMATCH' }
      }
    }
    return { installed: true, matchesActiveEndpoint: true, reason: null }
  }

  preview(): HookPreview {
    const base = this.read()
    if (base === null) {
      return { ok: false, targetPath: basename(this.opts.settingsPath), backupPath: basename(this.opts.backupPath), mergedJson: '', displayJson: '', reason: 'settings.json is malformed; not overwriting' }
    }
    const merged = this.merge(base)
    const mergedJson = JSON.stringify(merged, null, 2)
    const displayJson = mergedJson.replace(/([?&]token=)[^&"\\]+/gi, '$1[REDACTED]')
    return { ok: true, targetPath: basename(this.opts.settingsPath), backupPath: basename(this.opts.backupPath), mergedJson, displayJson }
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
    // Strip only our previous entries first. This makes both reinstall and
    // confirmed repair update stale endpoints without touching user hooks.
    const cleaned = this.stripMarker(base)
    const hooks = (cleaned['hooks'] && typeof cleaned['hooks'] === 'object' && !Array.isArray(cleaned['hooks']))
      ? { ...(cleaned['hooks'] as Record<string, unknown>) }
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
    return { ...cleaned, hooks }
  }

  private stripMarker(base: SettingsFile): SettingsFile {
    const hooks = (base['hooks'] && typeof base['hooks'] === 'object' && !Array.isArray(base['hooks']))
      ? { ...(base['hooks'] as Record<string, unknown>) }
      : {}
    for (const key of Object.keys(hooks)) {
      const groups = Array.isArray(hooks[key]) ? (hooks[key] as HookGroup[]) : []
      const kept = groups
        .map((group) => ({
          ...group,
          hooks: (Array.isArray(group.hooks) ? group.hooks : [])
            .filter((entry) => !JSON.stringify(entry).includes(MARKER))
        }))
        .filter((group) => group.hooks.length > 0)
      if (kept.length === 0) delete hooks[key]
      else hooks[key] = kept
    }
    return { ...base, hooks }
  }
}
