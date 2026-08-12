import { watch, type FSWatcher } from 'chokidar'
import { openSync, readSync, closeSync, statSync, mkdirSync } from 'fs'
import { normalizeTranscriptLine } from './agent-events.ts'
import type { AgentKind, ObservedAgentEvent } from '../../../shared/observation-types.ts'

/** How many trailing bytes of a pre-existing transcript to read on first sight. */
const TAIL_BYTES = 256 * 1024

export interface TranscriptWatchDirs {
  claudeProjects: string
  codexSessions: string
}

interface TrackedFile {
  /** Next byte offset to read from. */
  offset: number
  agentKind: AgentKind
}

/**
 * Passive, read-only JSONL transcript poller. Tails Claude Code and Codex
 * session transcripts incrementally and emits normalized events. Never
 * executes anything and never reads more than needed.
 */
export class TranscriptWatcher {
  private watcher: FSWatcher | null = null
  private files = new Map<string, TrackedFile>()
  private handler: ((e: ObservedAgentEvent) => void) | null = null
  private started = false

  onEvent(handler: (e: ObservedAgentEvent) => void): void {
    this.handler = handler
  }

  async start(dirs: TranscriptWatchDirs): Promise<void> {
    if (this.started) return
    this.started = true
    mkdirSync(dirs.claudeProjects, { recursive: true })
    mkdirSync(dirs.codexSessions, { recursive: true })
    const watcher = watch([dirs.claudeProjects, dirs.codexSessions], {
      ignoreInitial: false,
      depth: 8
    })
    this.watcher = watcher
    watcher.on('add', (path) => this.ensureFile(path, dirs))
    watcher.on('change', (path) => this.tail(path))
    watcher.on('unlink', (path) => this.files.delete(path))
  }

  async stop(): Promise<void> {
    if (this.watcher) await this.watcher.close()
    this.watcher = null
    this.files.clear()
    this.started = false
  }

  private kindOf(path: string, dirs: TranscriptWatchDirs): AgentKind | null {
    if (!path.endsWith('.jsonl')) return null
    if (path.startsWith(dirs.codexSessions)) return 'codex'
    if (path.startsWith(dirs.claudeProjects)) return 'claude-code'
    return null
  }

  private ensureFile(path: string, dirs: TranscriptWatchDirs): void {
    const agentKind = this.kindOf(path, dirs)
    if (!agentKind) return
    try {
      const size = statSync(path).size
      const offset = Math.max(0, size - TAIL_BYTES)
      this.files.set(path, { offset, agentKind })
      this.tail(path)
    } catch {
      /* file vanished before stat; ignore */
    }
  }

  private tail(path: string): void {
    const entry = this.files.get(path)
    if (!entry) return
    try {
      const stat = statSync(path)
      const start = Math.min(entry.offset, stat.size)
      const len = stat.size - start
      if (len <= 0) {
        entry.offset = stat.size
        return
      }
      const buf = Buffer.alloc(len)
      const fd = openSync(path, 'r')
      try {
        readSync(fd, buf, 0, len, start)
      } finally {
        closeSync(fd)
      }
      const text = buf.toString('utf8')
      const lines = text.split('\n')
      // The final element is '' when the file ends with a newline, otherwise a
      // partial line that must stay unconsumed until the next append.
      const completeLines = lines.slice(0, -1)
      for (const rawLine of completeLines) {
        if (!rawLine.trim()) continue
        const event = normalizeTranscriptLine(rawLine, entry.agentKind)
        if (event) this.handler?.(event)
      }
      const consumed = completeLines.length === 0 ? 0 : Buffer.byteLength(completeLines.join('\n') + '\n')
      entry.offset = start + consumed
    } catch {
      /* file may have been removed mid-read; ignore */
    }
  }
}
