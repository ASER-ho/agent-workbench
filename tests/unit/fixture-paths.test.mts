import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import test from 'node:test'

const E2E_FLAG = 'AGENT_WORKBENCH_E2E'
const FIXTURE_ROOT = 'AGENT_WORKBENCH_FIXTURE_ROOT'

function restoreEnvironment(flag: string | undefined, root: string | undefined): void {
  if (flag === undefined) delete process.env[E2E_FLAG]
  else process.env[E2E_FLAG] = flag
  if (root === undefined) delete process.env[FIXTURE_ROOT]
  else process.env[FIXTURE_ROOT] = root
}

test('E2E fixture root isolates every workspace path in a temporary directory', async () => {
  const originalFlag = process.env[E2E_FLAG]
  const originalRoot = process.env[FIXTURE_ROOT]
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-workbench-e2e-'))

  try {
    process.env[E2E_FLAG] = '1'
    process.env[FIXTURE_ROOT] = fixtureRoot

    const paths = await import(`../../src/main/utils/paths.ts?fixture=${Date.now()}`)
    const workspaceRoot = join(fixtureRoot, 'workspace')

    assert.equal(paths.getWorkspaceRoot(), workspaceRoot)
    assert.equal(paths.getMemoryDir(), join(workspaceRoot, 'memory'))
    assert.equal(paths.getSkillsDir(), join(workspaceRoot, 'skills'))
    assert.equal(paths.getProjectsDir(), join(workspaceRoot, 'projects'))
    assert.equal(paths.getClaudeMdPath(), join(workspaceRoot, 'CLAUDE.md'))
    assert.equal(paths.getSettingsLocalPath(), join(workspaceRoot, '.claude', 'settings.local.json'))
    assert.equal(paths.getSettingsGlobalPath(), join(fixtureRoot, 'settings', 'settings.json'))
    assert.equal(paths.getProjectRoot(), join(fixtureRoot, 'project'))
    assert.equal(paths.getBackupDir(), join(fixtureRoot, 'backups'))
    assert.equal(paths.getShareOutputDir(), join(fixtureRoot, 'exports'))
    assert.equal(paths.getClaudeProcessCwd(), workspaceRoot)
    assert.equal(paths.getPackageRoot(), join(fixtureRoot, 'project'))
    assert.equal(paths.getWorkspaceInfo().root, workspaceRoot)
    assert.equal(isAbsolute(paths.getWorkspaceRoot()), true)
  } finally {
    restoreEnvironment(originalFlag, originalRoot)
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('no configuration fails explicitly instead of accessing a developer path', async () => {
  const originalFlag = process.env[E2E_FLAG]
  const originalRoot = process.env[FIXTURE_ROOT]

  try {
    delete process.env[E2E_FLAG]
    delete process.env[FIXTURE_ROOT]
    const paths = await import(`../../src/main/utils/paths.ts?unconfigured=${Date.now()}`)
    assert.throws(() => paths.getWorkspaceRoot(), /not configured/i)
  } finally {
    restoreEnvironment(originalFlag, originalRoot)
  }
})

test('runtime configuration accepts absolute temporary paths and selected workspace updates', async () => {
  const originalFlag = process.env[E2E_FLAG]
  const originalRoot = process.env[FIXTURE_ROOT]
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-runtime-paths-'))

  try {
    delete process.env[E2E_FLAG]
    delete process.env[FIXTURE_ROOT]
    const paths = await import(`../../src/main/utils/paths.ts?runtime=${Date.now()}`)
    const configuredWorkspace = join(root, 'workspace')
    const selectedWorkspace = join(root, 'selected-workspace')

    paths.configureWorkspacePaths({
      workspaceRoot: configuredWorkspace,
      settingsGlobalPath: join(root, 'settings', 'settings.json'),
      projectRoot: join(root, 'app'),
      backupDir: join(root, 'backups'),
      shareOutputDir: join(root, 'exports')
    })
    assert.equal(paths.getWorkspaceRoot(), configuredWorkspace)
    paths.setSelectedWorkspaceRoot(selectedWorkspace)
    assert.equal(paths.getWorkspaceRoot(), selectedWorkspace)
    assert.equal(paths.getClaudeProcessCwd(), selectedWorkspace)
  } finally {
    restoreEnvironment(originalFlag, originalRoot)
    rmSync(root, { recursive: true, force: true })
  }
})

test('relative fixture and runtime paths are rejected', async () => {
  const originalFlag = process.env[E2E_FLAG]
  const originalRoot = process.env[FIXTURE_ROOT]
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-invalid-paths-'))

  try {
    process.env[E2E_FLAG] = '1'
    process.env[FIXTURE_ROOT] = '..\\relative-fixture'
    const fixturePaths = await import(`../../src/main/utils/paths.ts?invalid-fixture=${Date.now()}`)
    assert.throws(() => fixturePaths.getWorkspaceRoot(), /not configured/i)

    delete process.env[E2E_FLAG]
    delete process.env[FIXTURE_ROOT]
    const runtimePaths = await import(`../../src/main/utils/paths.ts?invalid-runtime=${Date.now()}`)
    assert.throws(() => runtimePaths.configureWorkspacePaths({
      workspaceRoot: 'relative-workspace',
      settingsGlobalPath: join(root, 'settings.json'),
      projectRoot: join(root, 'app'),
      backupDir: join(root, 'backups'),
      shareOutputDir: join(root, 'exports')
    }), /must be absolute/i)
  } finally {
    restoreEnvironment(originalFlag, originalRoot)
    rmSync(root, { recursive: true, force: true })
  }
})
