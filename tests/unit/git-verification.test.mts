import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  decodeWhereOutputCandidates,
  GitVerificationService,
  parsePorcelainV1Z,
  resolveTrustedGitExecutable,
  resolveWhereGitExecutable,
  sanitizeGitError
} from '../../src/main/services/git-verification.ts'

function gitPath(): string {
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('Test requires a trusted git.exe')
  return resolved
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

test('decodeWhereOutputCandidates recovers non-ASCII git.exe path from fixed GBK bytes', () => {
  // "F:\GW\GW下载\Git\cmd\git.exe\r\n" 的 GBK 字节：下载 = cf c2 d4 d8
  const gbk = Buffer.from('463a5c47575c4757cfc2d4d85c4769745c636d645c6769742e6578650d0a', 'hex')
  const candidates = decodeWhereOutputCandidates(gbk)
  assert.ok(candidates.includes('F:\\GW\\GW下载\\Git\\cmd\\git.exe'), JSON.stringify(candidates))
})

test('decodeWhereOutputCandidates keeps strict UTF-8 paths and drops blank lines and duplicates', () => {
  const utf8 = Buffer.from('C:\\Program Files\\Git\\cmd\\git.exe\r\n\r\nC:\\Program Files\\Git\\cmd\\git.exe\r\n', 'utf8')
  const candidates = decodeWhereOutputCandidates(utf8)
  assert.deepEqual(candidates, ['C:\\Program Files\\Git\\cmd\\git.exe'])
})

test('decodeWhereOutputCandidates yields nothing for bytes invalid in both strict decoders', () => {
  // 0xF0 单独不是合法 GBK（首字节范围 0x81-0xFE 但缺尾字节），也不是合法 UTF-8 前缀
  const bad = Buffer.from([0xf0])
  assert.deepEqual(decodeWhereOutputCandidates(bad), [])
})
