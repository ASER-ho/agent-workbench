import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export interface ExternalCommandResult {
  ok: boolean
  val: string
}

export function runExecutable(
  executable: string,
  args: readonly string[],
  timeout = 5000
): ExternalCommandResult {
  try {
    const val = execFileSync(executable, [...args], {
      encoding: 'utf8',
      timeout,
      windowsHide: true
    }).trim()
    return { ok: true, val: val || '(empty)' }
  } catch {
    return { ok: false, val: '' }
  }
}

export function locateExecutable(command: string): ExternalCommandResult {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) {
    return { ok: false, val: '' }
  }

  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  return runExecutable(locator, [command])
}

export function readExecutableVersion(executable: string): ExternalCommandResult {
  if (
    !isAbsolute(executable) ||
    !existsSync(executable) ||
    /\.(?:cmd|bat)$/i.test(executable)
  ) {
    return { ok: false, val: '' }
  }

  return runExecutable(executable, ['--version'])
}

export function registryValueExists(root: string, value: string): boolean {
  if (process.platform !== 'win32') return false
  return runExecutable('reg.exe', ['query', root, '/v', value], 3000).ok
}
