import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  isUnsafeGitPath,
  validateStatusPaths,
  VerificationSubjectSnapshotService,
  type VerificationSubjectSnapshotOptions
} from '../../src/main/services/verification-subject-snapshot.ts'
import { resolveWhereGitExecutable } from '../../src/main/services/git-verification.ts'
import type { VerificationSubjectSnapshot } from '../../src/shared/controlled-verification-types.ts'

let cachedGit: string | null = null
function gitPath(): string {
  if (cachedGit) return cachedGit
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('Test requires a trusted git.exe')
  cachedGit = resolved
  return resolved
}

function runGit(git: string, root: string, args: string[]): string {
  return execFileSync(git, args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

function capture(root: string, options: VerificationSubjectSnapshotOptions = {}): Promise<VerificationSubjectSnapshot> {
  return new VerificationSubjectSnapshotService({ gitExecutable: gitPath(), ...options }).capture(root)
}

function fixture(): { root: string; git: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'aw-r2c-subject-'))
  const git = gitPath()
  runGit(git, root, ['init', '-b', 'main'])
  runGit(git, root, ['config', 'user.name', 'R2C Test'])
  runGit(git, root, ['config', 'user.email', 'r2c@localhost.invalid'])
  writeFileSync(join(root, 'base.txt'), 'base\n', 'utf8')
  runGit(git, root, ['add', '--all'])
  runGit(git, root, ['commit', '-m', 'baseline'])
  return { root, git, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('path safety validator rejects traversal, absolute, drive, UNC, backslash and control paths', () => {
  assert.equal(isUnsafeGitPath('../escape'), true)
  assert.equal(isUnsafeGitPath('a/../../up'), true)
  assert.equal(isUnsafeGitPath('sub/..'), true)
  assert.equal(isUnsafeGitPath('/abs'), true)
  assert.equal(isUnsafeGitPath('C:/drive'), true)
  assert.equal(isUnsafeGitPath('//unc/share'), true)
  assert.equal(isUnsafeGitPath('sub\\backslash'), true)
  assert.equal(isUnsafeGitPath('bad\u0000char'), true)
  assert.equal(isUnsafeGitPath('normal/dir/file.txt'), false)
  assert.equal(isUnsafeGitPath('新 目录/文件.txt'), false)
})

test('clean workspace produces a complete and stable subject snapshot', async () => {
  const fx = fixture()
  try {
    const a = await capture(fx.root)
    const b = await capture(fx.root)
    assert.equal(a.complete, true)
    assert.equal(b.complete, true)
    assert.equal(a.exclusion, undefined)
    assert.equal(a.subjectDigest, b.subjectDigest)
    assert.match(a.subjectDigest, /^[0-9a-f]{64}$/)
    assert.match(a.headOid ?? '', /^[0-9a-f]{40,64}$/)
    assert.match(a.repositoryIdentityDigest, /^[0-9a-f]{64}$/)
    assert.match(a.stagedDiffDigest, /^[0-9a-f]{64}$/)
    assert.match(a.unstagedDiffDigest, /^[0-9a-f]{64}$/)
    assert.match(a.untrackedContentDigest, /^[0-9a-f]{64}$/)
  } finally { fx.cleanup() }
})

test('staged, unstaged and untracked changes are each reflected in the digests', async () => {
  const fx = fixture()
  try {
    const clean = await capture(fx.root)
    writeFileSync(join(fx.root, 'staged.txt'), 'staged\n', 'utf8')
    runGit(fx.git, fx.root, ['add', 'staged.txt'])
    writeFileSync(join(fx.root, 'base.txt'), 'unstaged edit\n', 'utf8')
    writeFileSync(join(fx.root, 'untracked.txt'), 'untracked\n', 'utf8')

    const s = await capture(fx.root)
    assert.equal(s.complete, true)
    assert.notEqual(s.stagedDiffDigest, clean.stagedDiffDigest)
    assert.notEqual(s.unstagedDiffDigest, clean.unstagedDiffDigest)
    assert.notEqual(s.untrackedContentDigest, clean.untrackedContentDigest)
    assert.notEqual(s.subjectDigest, clean.subjectDigest)
  } finally { fx.cleanup() }
})

test('two captures of the same state produce an identical subject snapshot', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'x.txt'), 'hello\n', 'utf8')
    runGit(fx.git, fx.root, ['add', 'x.txt'])
    writeFileSync(join(fx.root, 'y.txt'), 'world\n', 'utf8')

    const a = await capture(fx.root)
    const b = await capture(fx.root)
    assert.equal(a.complete, true)
    assert.deepEqual(a, b)
  } finally { fx.cleanup() }
})

test('changing content changes the untracked digest and the subjectDigest', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'untracked.txt'), 'one\n', 'utf8')
    const a = await capture(fx.root)
    writeFileSync(join(fx.root, 'untracked.txt'), 'two\n', 'utf8')
    const b = await capture(fx.root)
    assert.equal(a.complete, true)
    assert.equal(b.complete, true)
    assert.notEqual(a.untrackedContentDigest, b.untrackedContentDigest)
    assert.notEqual(a.subjectDigest, b.subjectDigest)
  } finally { fx.cleanup() }
})

test('a new commit changes headOid and therefore subjectDigest', async () => {
  const fx = fixture()
  try {
    const a = await capture(fx.root)
    writeFileSync(join(fx.root, 'commit-me.txt'), 'v1\n', 'utf8')
    runGit(fx.git, fx.root, ['add', 'commit-me.txt'])
    runGit(fx.git, fx.root, ['commit', '-m', 'second'])
    const b = await capture(fx.root)
    assert.equal(a.complete, true)
    assert.equal(b.complete, true)
    assert.notEqual(a.headOid, b.headOid)
    assert.notEqual(a.subjectDigest, b.subjectDigest)
  } finally { fx.cleanup() }
})

test('a path escape fails closed with PATH_ESCAPE', async () => {
  const fx = fixture()
  try {
    const s = await capture(fx.root, { statusOverride: Buffer.from('?? ../escape.txt\0', 'utf8') })
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'PATH_ESCAPE')
    assert.equal(s.subjectDigest, '')
    assert.equal(validateStatusPaths([{ path: '../escape.txt' }]), 'PATH_ESCAPE')
    assert.equal(validateStatusPaths([{ path: 'ok.txt', oldPath: '/abs/old' }]), 'PATH_ESCAPE')
  } finally { fx.cleanup() }
})

test('too many untracked files fails closed with UNTRACKED_LIMIT_EXCEEDED', async () => {
  const fx = fixture()
  try {
    const dir = join(fx.root, 'many')
    mkdirSync(dir)
    for (let i = 0; i < 501; i += 1) writeFileSync(join(dir, `f${String(i).padStart(3, '0')}.txt`), 'x\n', 'utf8')
    const s = await capture(fx.root)
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'UNTRACKED_LIMIT_EXCEEDED')
  } finally { fx.cleanup() }
})

test('a file changing during capture fails closed with FILE_CHANGED_DURING_CAPTURE', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'racer.txt'), 'before\n', 'utf8')
    const s = await capture(fx.root, {
      beforeRecheck: () => { writeFileSync(join(fx.root, 'racer.txt'), 'after\n', 'utf8') }
    })
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'FILE_CHANGED_DURING_CAPTURE')
  } finally { fx.cleanup() }
})

test('a non-Git directory fails closed with SNAPSHOT_INCOMPLETE', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'aw-r2c-not-git-'))
  try {
    const s = await capture(outside)
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'SNAPSHOT_INCOMPLETE')
  } finally { rmSync(outside, { recursive: true, force: true }) }
})

test('an untracked reparse point fails closed with UNSAFE_SYMLINK_OR_REPARSE', async () => {
  const fx = fixture()
  try {
    mkdirSync(join(fx.root, 'real-target'))
    writeFileSync(join(fx.root, 'real-target', 'inner.txt'), 'data\n', 'utf8')
    execFileSync('cmd', ['/c', 'mklink', '/J', join(fx.root, 'junc'), join(fx.root, 'real-target')], { stdio: 'pipe' })
    const s = await capture(fx.root)
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'UNSAFE_SYMLINK_OR_REPARSE')
  } finally {
    try { rmdirSync(join(fx.root, 'junc')) } catch { /* junction link may already be gone */ }
    fx.cleanup()
  }
})

test('a diff exceeding the capture limit fails closed with DIFF_LIMIT_EXCEEDED', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'base.txt'), 'x'.repeat(80_000), 'utf8')
    const s = await capture(fx.root, { diffLimitBytes: 64 })
    assert.equal(s.complete, false)
    assert.equal(s.exclusion, 'DIFF_LIMIT_EXCEEDED')
  } finally { fx.cleanup() }
})

test('an unborn HEAD (no commits) yields a complete snapshot with headOid null', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-r2c-unborn-'))
  const git = gitPath()
  try {
    runGit(git, root, ['init', '-b', 'main'])
    runGit(git, root, ['config', 'user.name', 'R2C Test'])
    runGit(git, root, ['config', 'user.email', 'r2c@localhost.invalid'])
    writeFileSync(join(root, 'new.txt'), 'x\n', 'utf8')
    const s = await capture(root)
    assert.equal(s.complete, true)
    assert.equal(s.headOid, null)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
