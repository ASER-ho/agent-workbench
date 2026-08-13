import { execFileSync } from 'node:child_process'
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
const workspace = join(fixtureRoot, 'workspace')
for (const directory of [
  'workspace/src', 'workspace/test', 'workspace/docs', 'workspace/memory', 'workspace/skills',
  'workspace/projects', 'workspace/.claude', 'settings', 'project', 'backups', 'exports',
  'user-data', 'temp', 'app-data', 'local-app-data'
]) {
  mkdirSync(join(fixtureRoot, directory), { recursive: true })
}

const now = new Date().toISOString()
writeFileSync(join(workspace, 'CLAUDE.md'), '# Packed fixture\n', 'utf8')
writeFileSync(join(workspace, 'src', 'fixture.txt'), 'fixture\n', 'utf8')
writeFileSync(join(workspace, 'test', 'verify.spec.mjs'), "import test from 'node:test'; test('packed fixture', () => {})\n", 'utf8')
writeFileSync(join(fixtureRoot, 'settings', 'settings.json'), '{}\n', 'utf8')
writeFileSync(join(workspace, 'memory', 'project-capsule.json'), JSON.stringify({
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

const bundledGit = resolve(dirname(process.execPath), '..', '..', 'native', 'git', 'cmd', 'git.exe')
const gitExecutable = process.env.AGENT_WORKBENCH_E2E_GIT_EXECUTABLE || bundledGit
if (!existsSync(gitExecutable)) throw new Error('packed smoke requires a trusted git.exe')
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.name', 'Packed Smoke'],
  ['config', 'user.email', 'packed-smoke@localhost.invalid'],
  ['add', '--all'],
  ['commit', '-m', 'fixture']
]) {
  execFileSync(gitExecutable, args, { cwd: workspace, stdio: 'pipe', windowsHide: true })
}

const CONTRACT = {
  title: 'Packed smoke verification',
  goal: 'Verify the packaged fixture',
  allowedPaths: ['src', 'test'],
  forbiddenPaths: ['.git'],
  acceptanceCriteria: ['The fixture test passes'],
  knownRisks: ['Fixture-only execution']
}

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
      AGENT_WORKBENCH_E2E_GIT_EXECUTABLE: gitExecutable,
      AGENT_WORKBENCH_NODE_EXECUTABLE: process.execPath,
      AGENT_WORKBENCH_E2E_EXPORT_DIR: join(fixtureRoot, 'exports'),
      USERPROFILE: fixtureRoot,
      APPDATA: join(fixtureRoot, 'app-data'),
      LOCALAPPDATA: join(fixtureRoot, 'local-app-data'),
      TEMP: join(fixtureRoot, 'temp'),
      TMP: join(fixtureRoot, 'temp'),
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      ComSpec: process.env.ComSpec || join(systemRoot, 'System32', 'cmd.exe'),
      PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })

  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  await page.getByTitle('English').click()

  const body = await page.locator('body').innerText()
  if (!body.includes('Agent Workbench')) throw new Error('packed renderer did not reach the workspace shell')
  if (body.includes(fixtureRoot)) throw new Error('packed renderer leaked the fixture absolute path')
  if (/sk-[A-Za-z0-9_-]{16,}/.test(body)) throw new Error('packed renderer exposed credential-like text')

  const rail = page.getByRole('navigation', { name: 'Primary' })
  await page.getByRole('heading', { name: 'Project Desk' }).waitFor()
  console.log('packed-workspace=PASS')

  const railWidth = async () => (await rail.boundingBox())?.width || 0
  if (await railWidth() <= 100) throw new Error('packed rail was not expanded initially')
  await page.keyboard.press('Control+B')
  await page.waitForTimeout(250)
  if (await railWidth() >= 80) throw new Error('Ctrl+B did not collapse the packed rail')
  await page.keyboard.press('Control+B')
  await page.waitForTimeout(250)
  if (await railWidth() <= 100) throw new Error('Ctrl+B did not restore the packed rail')

  await page.keyboard.press('Control+K')
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  console.log('packed-shortcuts=PASS ctrlK=true ctrlB=true')

  await rail.getByRole('button', { name: 'Environment' }).click()
  await page.getByRole('heading', { name: 'Environment Readiness' }).waitFor()
  await page.getByText('Passive Observation').waitFor()
  await page.getByText('Hooks not installed').waitFor()
  await page.getByRole('button', { name: 'Enable observation' }).waitFor()
  console.log('packed-environment=PASS observationDefaultOff=true hookHealth=NOT_INSTALLED')

  await page.getByRole('button', { name: 'Enable observation' }).click()
  await page.getByRole('button', { name: 'Disable observation' }).waitFor()
  await page.evaluate(async ({ contract }) => {
    await window.api.controlledVerification.preview({ testPath: 'test/verify.spec.mjs', contract })
  }, { contract: CONTRACT })
  await page.getByRole('button', { name: 'Authorize once' }).click()
  await page.getByText('Authorized (single use)').waitFor()
  const observationBody = await page.locator('body').innerText()
  if (/[?&]token=[a-f0-9]{32}/i.test(observationBody)) throw new Error('packed observation UI exposed a full Hook token')
  console.log('packed-observation=PASS enabled=true authorization=AUTHORIZED_SINGLE_USE')

  await rail.getByRole('button', { name: 'Verification' }).click()
  await page.getByRole('heading', { name: 'Read-only Verification' }).waitFor()
  const verification = page.getByRole('region', { name: 'Read-only Verification' })
  await verification.getByLabel('Task title').fill(CONTRACT.title)
  await verification.getByLabel('Goal').fill(CONTRACT.goal)
  await verification.getByLabel('Allowed paths').fill(CONTRACT.allowedPaths.join('\n'))
  await verification.getByLabel('Forbidden paths').fill(CONTRACT.forbiddenPaths.join('\n'))
  await verification.getByRole('group', { name: 'Acceptance criteria' }).getByLabel('Acceptance criteria 1').fill(CONTRACT.acceptanceCriteria[0])
  await verification.getByRole('group', { name: 'Known risks' }).getByLabel('Known risks 1').fill(CONTRACT.knownRisks[0])
  await verification.getByLabel('Verification method').fill('test/verify.spec.mjs')
  await verification.getByRole('button', { name: 'Confirm & continue' }).click()
  const review = page.getByRole('region', { name: 'Execution preview' })
  await review.getByText('Fixed command', { exact: true }).waitFor({ timeout: 20_000 })
  await review.getByRole('button', { name: 'Confirm once & execute' }).click()
  await page.getByRole('region', { name: 'Verification result work surface' }).waitFor({ timeout: 60_000 })
  console.log('packed-verification-and-result=PASS')

  await rail.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Appearance' }).waitFor()
  console.log('packed-settings=PASS')

  const finalBody = await page.locator('body').innerText()
  if (finalBody.includes(fixtureRoot)) throw new Error('packed renderer leaked the fixture absolute path after navigation')
  console.log('packed-app-smoke=PASS')
} finally {
  if (app) await app.close().catch(() => {})
  rmSync(fixtureRoot, { recursive: true, force: true })
}
