import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  GitVerificationService,
  parsePorcelainV1Z,
  resolveTrustedGitExecutable,
  sanitizeGitError
} from '../../src/main/services/git-verification.ts'

function gitPath(): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const output = execFileSync(join(systemRoot, 'System32', 'where.exe'), ['git.exe'], { encoding: 'utf8' })
  return resolveTrustedGitExecutable(output.split(/\r?\n/).filter(Boolean))
}

function runGit(git: string, root: string, args: string[]): string {
  return execFileSync(git, args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

function fixture(): { root: string; git: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'aw-r2a1-git-'))
  const git = gitPath()
  runGit(git, root, ['init', '-b', 'main'])
  runGit(git, root, ['config', 'user.name', 'R2A1 Test'])
  runGit(git, root, ['config', 'user.email', 'r2a1@localhost.invalid'])
  mkdirSync(join(root, 'src', 'app', 'private'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src', 'app', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'src', 'app', 'delete me.txt'), 'delete\n', 'utf8')
  writeFileSync(join(root, 'src', 'app', 'old name.txt'), 'rename\n', 'utf8')
  writeFileSync(join(root, 'src', 'app', 'private', 'blocked.txt'), 'private\n', 'utf8')
  writeFileSync(join(root, 'docs', 'outside.txt'), 'docs\n', 'utf8')
  runGit(git, root, ['add', '--all'])
  runGit(git, root, ['commit', '-m', 'baseline'])
  return { root, git, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const contract = {
  title: 'Inspect fixture', goal: 'Classify every changed path.',
  allowedPaths: ['src/app'], forbiddenPaths: ['src/app/private'],
  acceptanceCriteria: ['All paths are reported.'], knownRisks: ['No command is executed.']
}

test('porcelain v1 -z parser preserves rename old and new paths, spaces, and Unicode', () => {
  const parsed = parsePorcelainV1Z('R  src/app/新 名称.txt\0src/app/old name.txt\0?? docs/空 格.txt\0')
  assert.deepEqual(parsed[0], { index: 'R', worktree: ' ', path: 'src/app/新 名称.txt', oldPath: 'src/app/old name.txt' })
  assert.equal(parsed[1].path, 'docs/空 格.txt')
})

test('Git verification reads staged, unstaged, untracked, deleted, renamed, spaces and Unicode without raw diff leakage', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'src', 'app', 'allowed.txt'), 'SECRET_PATCH_CONTENT\n', 'utf8')
    writeFileSync(join(fx.root, 'src', 'app', 'staged.txt'), 'staged\n', 'utf8')
    runGit(fx.git, fx.root, ['add', 'src/app/staged.txt'])
    unlinkSync(join(fx.root, 'src', 'app', 'delete me.txt'))
    runGit(fx.git, fx.root, ['mv', 'src/app/old name.txt', 'docs/新 名称.txt'])
    writeFileSync(join(fx.root, 'src', 'app', 'private', 'blocked.txt'), 'changed\n', 'utf8')
    writeFileSync(join(fx.root, 'docs', '空 格.txt'), 'outside\n', 'utf8')

    const result = await new GitVerificationService({ gitExecutable: fx.git }).inspect(fx.root, contract)
    assert.equal(result.gitRead, true)
    assert.ok(result.changes.some(change => change.states.includes('staged')))
    assert.ok(result.changes.some(change => change.states.includes('unstaged')))
    assert.ok(result.changes.some(change => change.states.includes('untracked')))
    assert.ok(result.changes.some(change => change.changeType === 'deleted'))
    const renamed = result.changes.find(change => change.changeType === 'renamed')
    assert.equal(renamed?.oldPath, 'src/app/old name.txt')
    assert.equal(renamed?.newPath, 'docs/新 名称.txt')
    assert.equal(renamed?.classification, 'outsideScope')
    assert.ok(result.changes.some(change => change.classification === 'forbidden'))
    assert.ok(result.changes.some(change => change.classification === 'outsideScope'))
    assert.equal(result.scopeCompliant, false)
    assert.match(result.diffDigest, /^[A-F0-9]{64}$/)
    assert.equal(JSON.stringify(result).includes('SECRET_PATCH_CONTENT'), false)
    assert.equal(JSON.stringify(result).includes(fx.root), false)
    assert.equal('rawDiff' in result, false)
  } finally { fx.cleanup() }
})

test('Git verification accepts only the selected Git root and rejects non-repositories and subdirectories', async () => {
  const fx = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'aw-r2a1-not-git-'))
  try {
    const service = new GitVerificationService({ gitExecutable: fx.git })
    await assert.rejects(service.inspect(join(fx.root, 'src'), contract), /Git root|repository root/i)
    await assert.rejects(service.inspect(outside, contract), /Git repository/i)
  } finally { fx.cleanup(); rmSync(outside, { recursive: true, force: true }) }
})

test('Git verification marks safe summary truncation and sanitizes Git errors', async () => {
  const fx = fixture()
  try {
    writeFileSync(join(fx.root, 'src', 'app', 'allowed.txt'), 'x'.repeat(8_000), 'utf8')
    const result = await new GitVerificationService({ gitExecutable: fx.git, diffLimitBytes: 64 }).inspect(fx.root, contract)
    assert.equal(result.truncated, true)
    const fakeSecret = ['sk', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    const unsafe = `fatal at ${join(fx.root, 'private.txt')} token=${fakeSecret}`
    const safe = sanitizeGitError(unsafe)
    assert.equal(safe.includes(fx.root), false)
    assert.equal(safe.includes(fakeSecret), false)
  } finally { fx.cleanup() }
})
