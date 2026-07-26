import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { IPC_CHANNELS, type TranscriptMeta } from '../../shared/ipc-types'
import { getProjectsDir } from '../utils/paths'

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, async () => {
    const projectsDir = getProjectsDir()
    const transcripts: TranscriptMeta[] = []

    try {
      const userDirs = readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory())

      for (const userDir of userDirs) {
        const userPath = join(projectsDir, userDir.name)
        const files = readdirSync(userPath)

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const filePath = join(userPath, file)
          try {
            const stats = statSync(filePath)
            const sessionId = basename(file, '.jsonl')
            transcripts.push({
              sessionId,
              filePath,
              fileSize: stats.size,
              lastModified: stats.mtime.toISOString()
            })
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }

    // Sort by last modified, newest first
    return transcripts.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_SEARCH, async (_event, { query }: { query: string }) => {
    // Placeholder - Phase 6 will implement full transcript search
    return []
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_READ_TRANSCRIPT, async (_event, { filePath }: { filePath: string }) => {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    return lines.map((line, index) => {
      try {
        const parsed = JSON.parse(line)
        return {
          type: parsed.type || 'system',
          timestamp: parsed.timestamp || '',
          content: parsed.content ? (typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content)) : '',
          role: parsed.role,
          error: parsed.error,
          uuid: parsed.uuid,
          parentUuid: parsed.parentUuid,
          raw: parsed
        }
      } catch {
        return {
          type: 'system' as const,
          timestamp: '',
          content: line,
          raw: { raw: line }
        }
      }
    })
  })
}
