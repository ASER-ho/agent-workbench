import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  isManagedSnapshotName,
  resolveManagedSnapshotPath,
  validateManagedSnapshotTarget
} from '../../src/main/utils/model-snapshot.ts'

function fixture(): {
  root: string
  backupDir: string
  validName: string
  validPath: string
  cleanup: () => void
} {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-model-rollback-'))
  const backupDir = join(root, 'backups')
  const validName = 'settings.json.backup.20260725-120000'
  const validPath = join(backupDir, validName)
  mkdirSync(backupDir, { recursive: true })
  writeFileSync(validPath, '{"model":"safe"}', 'utf8')
  return { root, backupDir, validName, validPath, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('managed snapshot names accept only app-generated formats', () => {
  assert.equal(isManagedSnapshotName('settings.json.backup.20260725-120000'), true)
  assert.equal(isManagedSnapshotName('settings.json.backup.pre-rollback-20260725-120000'), true)
  assert.equal(isManagedSnapshotName('settings.json.backup.20260725-120000.json'), false)
  assert.equal(isManagedSnapshotName('../settings.json.backup.20260725-120000'), false)
  assert.equal(isManagedSnapshotName('..\\settings.json.backup.20260725-120000'), false)
  assert.equal(isManagedSnapshotName('SETTINGS.JSON.BACKUP.20260725-120000'), false)
})

test('valid temporary managed snapshot resolves inside the backup directory', () => {
  const fx = fixture()
  try {
    assert.equal(resolveManagedSnapshotPath(fx.backupDir, fx.validName), realpathSync(fx.validPath))
    if (process.platform === 'win32') {
      assert.equal(
        resolveManagedSnapshotPath(fx.backupDir.toUpperCase(), fx.validName),
        realpathSync(fx.validPath)
      )
    }
  } finally {
    fx.cleanup()
  }
})

test('absolute paths, traversal, separators, and sibling-prefix paths are rejected', () => {
  const fx = fixture()
  try {
    const sibling = join(dirname(fx.backupDir), 'backups-evil', fx.validName)
    mkdirSync(dirname(sibling), { recursive: true })
    writeFileSync(sibling, '{"model":"outside"}', 'utf8')

    for (const candidate of [
      fx.validPath,
      `../${fx.validName}`,
      `..\\${fx.validName}`,
      `nested/${fx.validName}`,
      `nested\\${fx.validName}`,
      sibling
    ]) {
      assert.throws(() => resolveManagedSnapshotPath(fx.backupDir, candidate), /snapshot/i)
    }
  } finally {
    fx.cleanup()
  }
})

test('missing files and directories masquerading as snapshots are rejected', () => {
  const fx = fixture()
  try {
    assert.throws(
      () => resolveManagedSnapshotPath(fx.backupDir, 'settings.json.backup.20260725-120001'),
      /snapshot/i
    )
    const directoryName = 'settings.json.backup.20260725-120002'
    mkdirSync(join(fx.backupDir, directoryName))
    assert.throws(() => resolveManagedSnapshotPath(fx.backupDir, directoryName), /snapshot/i)
  } finally {
    fx.cleanup()
  }
})

test('symbolic links and realpath escapes are rejected deterministically', () => {
  const fx = fixture()
  try {
    assert.throws(
      () => validateManagedSnapshotTarget(
        realpathSync(fx.backupDir),
        realpathSync(fx.validPath),
        { isFile: () => true, isSymbolicLink: () => true }
      ),
      /snapshot/i
    )
    assert.throws(
      () => validateManagedSnapshotTarget(
        realpathSync(fx.backupDir),
        join(fx.root, 'outside.json'),
        { isFile: () => true, isSymbolicLink: () => false }
      ),
      /outside/i
    )
  } finally {
    fx.cleanup()
  }
})

test('IPC contract exposes only managed snapshot names to the renderer', () => {
  const apiSource = readFileSync(join(process.cwd(), 'src/main/ipc/api.ts'), 'utf8')
  const preloadSource = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
  assert.match(apiSource, /resolveManagedSnapshotPath\(getBackupDir\(\), payload\?\.snapshotName\)/)
  assert.doesNotMatch(apiSource, /path:\s*fullPath/)
  assert.doesNotMatch(apiSource, /readFileSync\(payload/)
  assert.doesNotMatch(preloadSource, /snapshotPath/)
  assert.match(preloadSource, /MODEL_ROLLBACK, \{ snapshotName \}/)
})
