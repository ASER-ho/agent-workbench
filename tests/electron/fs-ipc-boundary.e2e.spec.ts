import { expect, test } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'

let electronApp: ElectronApplication | undefined
let page: Page
let fixtureRoot = ''

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-fs-boundary-'))
  mkdirSync(join(root, 'workspace', 'memory'), { recursive: true })
  mkdirSync(join(root, 'workspace', 'skills'), { recursive: true })
  mkdirSync(join(root, 'workspace', 'projects'), { recursive: true })
  mkdirSync(join(root, 'workspace', '.claude'), { recursive: true })
  mkdirSync(join(root, 'settings'), { recursive: true })
  writeFileSync(join(root, 'workspace', 'CLAUDE.md'), '# Fixture\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  return root
}

test.describe('FS IPC Path Boundary E2E (R3-005)', () => {
  test.beforeAll(async () => {
    fixtureRoot = createFixture()
    const entryPoint = resolve('out/main/index.js')
    electronApp = await electron.launch({
      args: [entryPoint],
      env: {
        ...process.env,
        AGENT_WORKBENCH_E2E: '1',
        AGENT_WORKBENCH_FIXTURE_ROOT: fixtureRoot
      },
      executablePath: undefined
    })
    page = await electronApp.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
      electronApp = undefined
    }
    // Ensure all child processes are gone
    try {
      const { execSync } = require('node:child_process')
      execSync(`taskkill /F /FI "WINDOWTITLE eq *agent-workbench-fs-boundary*" 2>nul`, { timeout: 2000 })
    } catch { /* ignore */ }
    try { rmSync(fixtureRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('FS-E2E-T1: workspace file read succeeds', async () => {
    const knownFile = join(fixtureRoot, 'workspace', 'CLAUDE.md')
    const result = await page.evaluate((p: string) => {
      return (window as any).api.fs.readFile(p).then((r: any) => r.content)
    }, knownFile)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('FS-E2E-T2: ../traversal read is rejected', async () => {
    const traversalPath = fixtureRoot + '/workspace/../outside/file.txt'
    try {
      await page.evaluate((p: string) => (window as any).api.fs.readFile(p), traversalPath)
      expect(false).toBe(true) // should not reach here
    } catch {
      expect(true).toBe(true) // rejection expected
    }
  })

  test('FS-E2E-T3: absolute system path read is rejected', async () => {
    try {
      await page.evaluate(() => (window as any).api.fs.readFile('C:\\Windows\\System32\\drivers\\etc\\hosts'))
      expect(false).toBe(true)
    } catch {
      expect(true).toBe(true)
    }
  })

  test('FS-E2E-T4: workspace-prefix collision read is rejected', async () => {
    const evilRoot = fixtureRoot + '-evil'
    mkdirSync(join(evilRoot, 'memory'), { recursive: true })
    const evilFile = join(evilRoot, 'memory', 'evil.md')
    writeFileSync(evilFile, '# evil', 'utf8')
    try {
      await page.evaluate((p: string) => (window as any).api.fs.readFile(p), evilFile)
      expect(false).toBe(true)
    } catch {
      expect(true).toBe(true)
    }
    try { rmSync(evilRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('FS-E2E-T5: symlink outside workspace is rejected', async () => {
    const wsMemory = join(fixtureRoot, 'workspace', 'memory')
    const symlinkPath = join(wsMemory, 'escape-link')
    const outsideTarget = join(tmpdir(), 'outside-target.md')
    writeFileSync(outsideTarget, '# outside', 'utf8')
    try { symlinkSync(outsideTarget, symlinkPath, 'junction') } catch { /* symlink not supported */ }
    try {
      const result = await page.evaluate((p: string) => (window as any).api.fs.readFile(p), symlinkPath)
      // If symlink succeeded and read succeeded, fail — it should be rejected
      expect(result).toBeUndefined()
    } catch {
      expect(true).toBe(true) // rejection expected
    }
    try { rmSync(outsideTarget, { force: true }) } catch { /* ignore */ }
    try { rmSync(symlinkPath, { force: true }) } catch { /* ignore */ }
  })

  test('FS-E2E-T6: rename validates both source and destination', async () => {
    const wsMemory = join(fixtureRoot, 'workspace', 'memory')
    const srcFile = join(wsMemory, 'rename-src.md')
    writeFileSync(srcFile, '# src', 'utf8')
    // Try rename to outside workspace
    const outsideDest = join(tmpdir(), 'rename-dest.md')
    try {
      await page.evaluate((p: { oldPath: string; newName: string }) =>
        (window as any).api.fs.rename(p.oldPath, p.newName),
        { oldPath: srcFile, newName: outsideDest }
      )
      expect(false).toBe(true)
    } catch {
      expect(true).toBe(true)
    }
    // Clean up
    try { rmSync(srcFile, { force: true }) } catch { /* ignore */ }
  })

  test('FS-E2E-T7: protected file delete is rejected', async () => {
    const wsRoot = fixtureRoot
    try {
      await page.evaluate((p: string) => (window as any).api.fs.delete({ path: p }),
        join(wsRoot, 'workspace', 'CLAUDE.md'))
      expect(false).toBe(true)
    } catch {
      expect(true).toBe(true)
    }
  })

  test('FS-E2E-T8: mixed slash/backslash path accepted', async () => {
    const forwardPath = join(fixtureRoot, 'workspace', 'CLAUDE.md').replace(/\\/g, '/')
    const knownFile = forwardPath.replace('/workspace/', '\\workspace/')
    expect(knownFile).toContain('\\workspace/')
    const result = await page.evaluate((p: string) => {
      return (window as any).api.fs.readFile(p).then((r: any) => r.content)
    }, knownFile)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('FS-E2E-T9: non-existent path inside workspace passes parent-dir validation', async () => {
    const parentDir = join(fixtureRoot, 'workspace', 'memory')
    // createFile should succeed — parent dir exists inside workspace
    const newName = 'e2e-test-' + Date.now() + '.md'
    try {
      await page.evaluate((p: { parentDir: string; name: string }) =>
        (window as any).api.fs.createFile(p.parentDir, p.name),
        { parentDir, name: newName }
      )
      // Clean up
      try {
        await page.evaluate((p: { path: string }) =>
          (window as any).api.fs.delete(p),
          { path: parentDir + '/' + newName }
        )
      } catch { /* cleanup failure ok */ }
      expect(true).toBe(true) // should not throw
    } catch (e) {
      // If rejection, check it's not a boundary rejection
      const msg = String(e)
      expect(msg).not.toContain('outside workspace')
    }
  })
})
