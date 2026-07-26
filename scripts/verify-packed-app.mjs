import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { listPackage } from '@electron/asar'
import { _electron as electron } from 'playwright'

const executablePath = resolve(process.argv[2] || 'dist/win-unpacked/Agent Workbench.exe')
if (!existsSync(executablePath)) throw new Error(`packed executable missing: ${basename(executablePath)}`)
const asarPath = join(dirname(executablePath), 'resources', 'app.asar')
if (!existsSync(asarPath)) throw new Error('packed app.asar is missing')
const asarEntries = await listPackage(asarPath)
const forbiddenEntry = asarEntries.find(entry =>
  /\.map$/i.test(entry) || /(?:^|[\\/])(?:test-results|playwright-report|\.ai|\.planning|\.claude|memory|skills|projects)(?:[\\/]|$)/i.test(entry)
)
if (forbiddenEntry) throw new Error(`packed app contains forbidden entry: ${forbiddenEntry}`)
console.log(`packed-asar-sweep=PASS entries=${asarEntries.length}`)

const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-workbench-packed-'))
for (const directory of [
  'workspace/memory', 'workspace/skills', 'workspace/projects', 'workspace/.claude',
  'settings', 'project', 'backups', 'user-data', 'temp', 'app-data', 'local-app-data'
]) {
  mkdirSync(join(fixtureRoot, directory), { recursive: true })
}

const now = new Date().toISOString()
writeFileSync(join(fixtureRoot, 'workspace', 'CLAUDE.md'), '# Packed fixture\n', 'utf8')
writeFileSync(join(fixtureRoot, 'settings', 'settings.json'), '{}\n', 'utf8')
writeFileSync(join(fixtureRoot, 'workspace', 'memory', 'project-capsule.json'), JSON.stringify({
  capsuleVersion: 1,
  projectName: 'Packed Fixture',
  workspaceLabel: 'fixture-project',
  safePathLabel: 'fixture-project',
  lastOpenedAt: now,
  safetyState: {
    providerStatus: 'default', secretsSafe: true, pathsSafe: true, releaseBlocked: true,
    buildStatus: 'pass', packStatus: 'pass', phaseStatus: 'phase-1-active', workspaceSelected: true
  },
  notes: '', createdAt: now, updatedAt: now
}, null, 2), 'utf8')

let app
try {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${join(fixtureRoot, 'user-data')}`],
    cwd: dirname(executablePath),
    env: {
      ...process.env,
      AGENT_WORKBENCH_E2E: '1',
      AGENT_WORKBENCH_FIXTURE_ROOT: fixtureRoot,
      AGENT_WORKBENCH_STUB_TIMEOUT_MS: '180',
      USERPROFILE: fixtureRoot,
      APPDATA: join(fixtureRoot, 'app-data'),
      LOCALAPPDATA: join(fixtureRoot, 'local-app-data'),
      TEMP: join(fixtureRoot, 'temp'),
      TMP: join(fixtureRoot, 'temp'),
      SystemRoot: systemRoot,
      WINDIR: systemRoot
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const body = await page.locator('body').innerText()
  if (!body.includes('Agent Workbench')) throw new Error('packed renderer did not reach the workspace shell')
  if (body.includes(fixtureRoot)) throw new Error('packed renderer leaked the fixture absolute path')
  if (/sk-[A-Za-z0-9_-]{16,}/.test(body)) throw new Error('packed renderer exposed credential-like text')
  const launchButtons = await page.getByRole('button', { name: /Review & Launch|检查并启动/ }).count()
  if (launchButtons !== 1) throw new Error('packed renderer did not expose the gated stub launch control')
  console.log('packed-app-launch=PASS')
} finally {
  if (app) await app.close().catch(() => {})
  rmSync(fixtureRoot, { recursive: true, force: true })
}
