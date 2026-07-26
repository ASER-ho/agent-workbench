import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let electronApp: ElectronApplication | undefined
let page: Page
let fixtureRoot = ''

const validSnapshotName = 'settings.json.backup.20260725-120000'

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-model-rollback-e2e-'))
  for (const directory of [
    'workspace/memory',
    'workspace/skills',
    'workspace/projects',
    'workspace/.claude',
    'settings',
    'project',
    'backups',
    'exports'
  ]) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  writeFileSync(join(root, 'workspace', 'CLAUDE.md'), '# Fixture\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{"model":"before"}\n', 'utf8')
  writeFileSync(join(root, 'backups', validSnapshotName), '{"model":"restored"}\n', 'utf8')
  writeFileSync(join(root, 'backups', 'not-a-managed-snapshot.json'), '{"model":"ignored"}\n', 'utf8')
  writeFileSync(join(root, 'outside.json'), '{"model":"outside"}\n', 'utf8')
  return root
}

test.describe('MODEL_ROLLBACK managed snapshot boundary', () => {
  test.beforeAll(async () => {
    fixtureRoot = createFixture()
    electronApp = await electron.launch({
      args: [resolve('out/main/index.js')],
      env: {
        ...process.env,
        AGENT_WORKBENCH_E2E: '1',
        AGENT_WORKBENCH_FIXTURE_ROOT: fixtureRoot
      }
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close()
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  test('snapshot listing returns managed names without local paths', async () => {
    const result = await page.evaluate(() => (window as any).api.model.listSnapshots())
    expect(result.success).toBe(true)
    expect(result.snapshots).toHaveLength(1)
    expect(result.snapshots[0].name).toBe(validSnapshotName)
    expect(Object.hasOwn(result.snapshots[0], 'path')).toBe(false)
  })

  test('absolute outside path and traversal are rejected without changing settings', async () => {
    const outsidePath = join(fixtureRoot, 'outside.json')
    const absoluteResult = await page.evaluate(
      (value: string) => (window as any).api.model.rollback(value),
      outsidePath
    )
    const traversalResult = await page.evaluate(
      (value: string) => (window as any).api.model.rollback(value),
      `../${validSnapshotName}`
    )
    expect(absoluteResult.success).toBe(false)
    expect(traversalResult.success).toBe(false)
    expect(readFileSync(join(fixtureRoot, 'settings', 'settings.json'), 'utf8')).toContain('"before"')
  })

  test('managed snapshot restores settings and returns only its name', async () => {
    const result = await page.evaluate(
      (value: string) => (window as any).api.model.rollback(value),
      validSnapshotName
    )
    expect(result).toEqual({ success: true, restoredFrom: validSnapshotName })
    expect(readFileSync(join(fixtureRoot, 'settings', 'settings.json'), 'utf8')).toContain('"restored"')
  })
})
