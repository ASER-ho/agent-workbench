import { join, isAbsolute, resolve } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

export interface WorkspacePathOverrides {
  workspaceRoot?: string
  settingsGlobalPath?: string
  projectRoot?: string
  backupDir?: string
  shareOutputDir?: string
}

export interface ResolvedWorkspacePaths {
  workspaceRoot: string
  settingsGlobalPath: string
  projectRoot: string
  backupDir: string
  shareOutputDir: string
  claudeProcessCwd: string
  packageRoot: string
  memoryDir: string
  skillsDir: string
  projectsDir: string
  claudeMdPath: string
  settingsLocalPath: string
}

export interface DisplayPath {
  full: string
  basename: string
  dirname: string
}

type ConfiguredWorkspacePaths = Required<WorkspacePathOverrides>

let configuredRuntimePaths: ConfiguredWorkspacePaths | undefined

function normalizeAbsolutePath(value: string | undefined, label: string): string {
  const candidate = value?.trim()
  if (!candidate) throw new Error(`Workspace path configuration missing: ${label}`)
  if (!isAbsolute(candidate)) throw new Error(`Workspace path configuration must be absolute: ${label}`)
  if (candidate.split(/[\\/]+/).includes('..')) {
    throw new Error(`Workspace path configuration contains traversal: ${label}`)
  }
  return resolve(candidate)
}

function normalizePathConfiguration(overrides: WorkspacePathOverrides): ConfiguredWorkspacePaths {
  return {
    workspaceRoot: normalizeAbsolutePath(overrides.workspaceRoot, 'workspaceRoot'),
    settingsGlobalPath: normalizeAbsolutePath(overrides.settingsGlobalPath, 'settingsGlobalPath'),
    projectRoot: normalizeAbsolutePath(overrides.projectRoot, 'projectRoot'),
    backupDir: normalizeAbsolutePath(overrides.backupDir, 'backupDir'),
    shareOutputDir: normalizeAbsolutePath(overrides.shareOutputDir, 'shareOutputDir')
  }
}

export function configureWorkspacePaths(overrides: WorkspacePathOverrides): void {
  configuredRuntimePaths = normalizePathConfiguration(overrides)
}

export function setSelectedWorkspaceRoot(workspaceRoot: string): void {
  if (!configuredRuntimePaths) throw new Error('Workspace paths are not configured')
  configuredRuntimePaths = {
    ...configuredRuntimePaths,
    workspaceRoot: normalizeAbsolutePath(workspaceRoot, 'workspaceRoot')
  }
}

function getE2EPathOverrides(): ConfiguredWorkspacePaths | undefined {
  if (process.env['AGENT_WORKBENCH_E2E'] !== '1') return undefined

  const fixtureRoot = process.env['AGENT_WORKBENCH_FIXTURE_ROOT']?.trim()
  if (!fixtureRoot || !isAbsolute(fixtureRoot)) return undefined
  if (fixtureRoot.split(/[\\/]+/).includes('..')) return undefined

  const root = resolve(fixtureRoot)
  return {
    workspaceRoot: join(root, 'workspace'),
    settingsGlobalPath: join(root, 'settings', 'settings.json'),
    projectRoot: join(root, 'project'),
    backupDir: join(root, 'backups'),
    shareOutputDir: join(root, 'exports')
  }
}

function activeOverrides(overrides?: WorkspacePathOverrides): ConfiguredWorkspacePaths {
  const base = getE2EPathOverrides() ?? configuredRuntimePaths
  if (overrides) return normalizePathConfiguration({ ...base, ...overrides })
  if (base) return base
  throw new Error('Workspace paths are not configured')
}

export function getWorkspaceRoot(): string {
  return activeOverrides().workspaceRoot
}

export function getMemoryDir(): string {
  return join(getWorkspaceRoot(), 'memory')
}

export function getSkillsDir(): string {
  return join(getWorkspaceRoot(), 'skills')
}

export function getProjectsDir(): string {
  return join(getWorkspaceRoot(), 'projects')
}

export function getClaudeMdPath(): string {
  return join(getWorkspaceRoot(), 'CLAUDE.md')
}

export function getSettingsLocalPath(): string {
  return join(getWorkspaceRoot(), '.claude', 'settings.local.json')
}

export function getSettingsGlobalPath(): string {
  return activeOverrides().settingsGlobalPath
}

export function getClaudeExePath(): string {
  // Try common install locations
  const candidates = [
    join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    join(homedir(), 'AppData', 'Local', 'anthropic', 'claude', 'claude.exe'),
    'claude' // fallback: rely on PATH
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0] // return first candidate as default
}

export function getWorkspaceInfo() {
  return {
    root: getWorkspaceRoot(),
    memoryDir: getMemoryDir(),
    skillsDir: getSkillsDir(),
    projectsDir: getProjectsDir(),
    settingsLocalPath: getSettingsLocalPath(),
    settingsGlobalPath: getSettingsGlobalPath(),
    claudeMdPath: getClaudeMdPath()
  }
}

export function getProjectRoot(overrides?: WorkspacePathOverrides): string {
  return activeOverrides(overrides).projectRoot
}

export function getBackupDir(overrides?: WorkspacePathOverrides): string {
  return activeOverrides(overrides).backupDir
}

export function getClaudeProcessCwd(overrides?: WorkspacePathOverrides): string {
  return activeOverrides(overrides).workspaceRoot
}

export function getPackageRoot(overrides?: WorkspacePathOverrides): string {
  return activeOverrides(overrides).projectRoot
}

export function getShareOutputDir(overrides?: WorkspacePathOverrides): string {
  return activeOverrides(overrides).shareOutputDir
}

export function getDisplayPath(absPath: string): DisplayPath {
  if (!absPath) return { full: '', basename: '', dirname: '' }
  const segments = absPath.replace(/\\/g, '/')
  return {
    full: absPath,
    basename: segments.split('/').pop() || '',
    dirname: segments.substring(0, segments.lastIndexOf('/'))
  }
}

export function resolveWorkspacePaths(overrides?: WorkspacePathOverrides): ResolvedWorkspacePaths {
  const resolvedOverrides = activeOverrides(overrides)
  const workspaceRoot = resolvedOverrides.workspaceRoot
  const settingsGlobalPath = resolvedOverrides.settingsGlobalPath
  return {
    workspaceRoot,
    settingsGlobalPath,
    projectRoot: resolvedOverrides.projectRoot,
    backupDir: resolvedOverrides.backupDir,
    shareOutputDir: resolvedOverrides.shareOutputDir,
    claudeProcessCwd: workspaceRoot,
    packageRoot: resolvedOverrides.projectRoot,
    memoryDir: join(workspaceRoot, 'memory'),
    skillsDir: join(workspaceRoot, 'skills'),
    projectsDir: join(workspaceRoot, 'projects'),
    claudeMdPath: join(workspaceRoot, 'CLAUDE.md'),
    settingsLocalPath: join(workspaceRoot, '.claude', 'settings.local.json')
  }
}
