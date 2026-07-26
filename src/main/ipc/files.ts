import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync, renameSync, rmSync } from 'fs'
import { join, relative, basename } from 'path'
import { IPC_CHANNELS, type FileEntry, type FrontmatterDoc } from '../../shared/ipc-types'
import { getWorkspaceInfo, getWorkspaceRoot, getMemoryDir, getSkillsDir, getProjectsDir, getClaudeMdPath, getSettingsLocalPath } from '../utils/paths'

/** Normalize a path for boundary comparison: forward slashes, lowercase, no trailing slash. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function resolveRealPathSync(p: string): string {
  try {
    const { realpathSync } = require('fs')
    return normalizePath(realpathSync(p))
  } catch {
    return normalizePath(p)
  }
}

/** Validate that a path is within the allowed workspace boundary.
 *  Rejects paths that escape via traversal, absolute paths outside workspace,
 *  symlinks pointing outside workspace, system directories, and protected paths. */
function validateWorkspacePath(targetPath: string): string {
  const normalized = normalizePath(targetPath)
  const wsRoot = normalizePath(getWorkspaceRoot())

  // Deny empty input
  if (!normalized) {
    throw new Error('Empty path rejected')
  }

  // Deny traversal attempts
  if (normalized.includes('..')) {
    throw new Error(`Path traversal rejected: ${basename(targetPath)}`)
  }

  // Resolve symlinks/junctions to real path; fall back to normalized input
  const real = resolveRealPathSync(targetPath)

  // Workspace boundary check: must be exactly root or under root/
  // Use '/' suffix to prevent workspace vs workspace-evil prefix collision
  const within = real === wsRoot || real.startsWith(wsRoot + '/')
  if (!within) {
    throw new Error(`Path outside workspace rejected: ${basename(targetPath)}`)
  }

  // Deny protected system paths
  const denylist = ['/windows/', '/system32/', '/etc/', '/boot/']
  if (denylist.some(d => real.includes(d))) {
    throw new Error(`System path rejected: ${basename(targetPath)}`)
  }

  return normalized
}

function parseFrontmatter(raw: string): FrontmatterDoc {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: raw, raw }
  }

  const endIndex = lines.indexOf('---', 1)
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw, raw }
  }

  const fmLines = lines.slice(1, endIndex)
  const body = lines.slice(endIndex + 1).join('\n').trim()

  const frontmatter: Record<string, unknown> = {}
  for (const line of fmLines) {
    const sepIndex = line.indexOf(':')
    if (sepIndex === -1) continue
    const key = line.slice(0, sepIndex).trim()
    const value = line.slice(sepIndex + 1).trim()
    frontmatter[key] = parseFrontmatterValue(value)
  }

  return { frontmatter, body, raw }
}

function parseFrontmatterValue(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (!isNaN(Number(value)) && value.length > 0) return Number(value)
  // Remove quotes if present
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${serializeValue(v)}`)
  return ['---', ...fmLines, '---', '', body].join('\n')
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value.includes(' ') ? `"${value}"` : value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null) return '~'
  return String(value)
}

function readDirectoryRecursive(dirPath: string, basePath: string): FileEntry[] {
  const entries: FileEntry[] = []
  try {
    const items = readdirSync(dirPath)
    for (const item of items) {
      const fullPath = join(dirPath, item)
      try {
        const stats = statSync(fullPath)
        if (stats.isDirectory()) {
          entries.push({
            name: item,
            path: fullPath,
            isDirectory: true,
            size: 0,
            mtime: stats.mtime.toISOString()
          })
        } else {
          entries.push({
            name: item,
            path: fullPath,
            isDirectory: false,
            size: stats.size,
            mtime: stats.mtime.toISOString()
          })
        }
      } catch { /* skip unreadable items */ }
    }
  } catch { /* skip unreadable dirs */ }
  return entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_event, path: string) => {
    validateWorkspacePath(path)
    if (statSync(path).isDirectory()) throw new Error(`路径是目录，不是文件: ${basename(path)}`)
    const content = readFileSync(path, 'utf-8')
    const stats = statSync(path)
    return { content, mtime: stats.mtime.toISOString() }
  })

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (_event, options: { path: string; content: string }) => {
    validateWorkspacePath(options.path)
    const dir = options.path.split('\\').slice(0, -1).join('\\')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(options.path, options.content, 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.FS_READ_FRONTMATTER, async (_event, path: string) => {
    validateWorkspacePath(path)
    if (statSync(path).isDirectory()) throw new Error(`路径是目录，不是文件: ${basename(path)}`)
    const raw = readFileSync(path, 'utf-8')
    return parseFrontmatter(raw)
  })

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FRONTMATTER, async (_event, options: { path: string; frontmatter: Record<string, unknown>; body: string }) => {
    validateWorkspacePath(options.path)
    const content = serializeFrontmatter(options.frontmatter, options.body)
    writeFileSync(options.path, content, 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIRECTORY, async (_event, path: string) => {
    validateWorkspacePath(path)
    return readDirectoryRecursive(path, path)
  })

  ipcMain.handle(IPC_CHANNELS.FS_CREATE_FILE, async (_event, { parentDir, name }: { parentDir: string; name: string }) => {
    validateWorkspacePath(parentDir)
    if (name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error(`文件名无效: ${name}`)
    const filePath = join(parentDir, name)
    if (existsSync(filePath)) throw new Error(`文件已存在: ${name}`)
    writeFileSync(filePath, '', 'utf-8')
    return filePath
  })

  ipcMain.handle(IPC_CHANNELS.FS_CREATE_DIRECTORY, async (_event, { parentDir, name }: { parentDir: string; name: string }) => {
    validateWorkspacePath(parentDir)
    if (name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error(`目录名无效: ${name}`)
    const dirPath = join(parentDir, name)
    if (existsSync(dirPath)) throw new Error(`目录已存在: ${name}`)
    mkdirSync(dirPath, { recursive: true })
    return dirPath
  })

  ipcMain.handle(IPC_CHANNELS.FS_DELETE, async (_event, { path }: { path: string }) => {
    validateWorkspacePath(path)
    // Deny deletion of core workspace files
    const basenameLower = basename(path).toLowerCase()
    const protectedFiles = ['claude.md', 'package.json', 'settings.local.json']
    if (protectedFiles.includes(basenameLower)) throw new Error(`受保护文件不可删除: ${basename(path)}`)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      rmSync(path, { recursive: true, force: true })
    } else {
      unlinkSync(path)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_RENAME, async (_event, { oldPath, newName }: { oldPath: string; newName: string }) => {
    validateWorkspacePath(oldPath)
    if (newName.includes('..') || newName.includes('/') || newName.includes('\\')) throw new Error(`文件名无效: ${newName}`)
    const dir = oldPath.split('\\').slice(0, -1).join('\\')
    const newPath = join(dir, newName)
    validateWorkspacePath(newPath)
    if (existsSync(newPath)) throw new Error(`目标已存在: ${newName}`)
    renameSync(oldPath, newPath)
    return newPath
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_INFO, async () => {
    return getWorkspaceInfo()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_REFRESH_TREE, async () => {
    const info = getWorkspaceInfo()
    return {
      root: info.root,
      sections: [
        { name: 'Memory', path: info.memoryDir, items: readDirectoryRecursive(info.memoryDir, info.memoryDir) },
        { name: 'Skills', path: info.skillsDir, items: readDirectoryRecursive(info.skillsDir, info.skillsDir) },
        { name: 'Projects', path: info.projectsDir, items: readDirectoryRecursive(info.projectsDir, info.projectsDir) },
        { name: 'Config', path: info.root, items: readDirectoryRecursive(info.root, info.root).filter(
            f => f.name === 'CLAUDE.md' || f.name === '.claude'
          )
        }
      ]
    }
  })
}
