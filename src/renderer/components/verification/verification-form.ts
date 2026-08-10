// Renderer-side contract/test-method validation for the DEFINE stage.
// These helpers mirror the real R2 validation rules (normalizeVerificationPath /
// validateTestPath in src/shared) so the form can surface errors before the
// backend rejects a preview/confirm. The backend remains the enforcement point.
//
// Pure module: no React, no Electron, no Node.

import type { VerificationContract } from '../../../shared/verification-types'

export interface VerificationCompleteness {
  goal: boolean
  scope: boolean
  criteria: boolean
  method: boolean
  risks: boolean
}

export interface VerificationFieldErrors {
  title?: string
  goal?: string
  allowedPaths?: string
  forbiddenPaths?: string
  acceptanceCriteria?: string
  knownRisks?: string
  testPath?: string
}

// ASCII control characters U+0000..U+001F and U+007F. Built via fromCharCode so
// the source file contains no literal control bytes.
const CONTROL_RE = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']'
)
const DRIVE_RE = /^[A-Za-z]:/
const UNC_OR_DEVICE_RE = /^(?:\\\\|\/\/|\\[?.]\\)/
const ALLOWED_TEST_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])

/** Mirrors normalizeVerificationPath. Returns a Chinese display message or undefined when valid. */
export function validateVerificationPathLine(value: string): string | undefined {
  const input = value.trim()
  if (!input) return '路径不能为空'
  if (input.startsWith('/') || input.endsWith('/') || input.endsWith('\\')) {
    return '路径必须为工作区相对路径，且不能以分隔符结尾'
  }
  if (DRIVE_RE.test(input) || UNC_OR_DEVICE_RE.test(input)) {
    return '路径必须为工作区相对路径（不能是绝对路径或 UNC）'
  }
  const parts = input.split(/[\\/]/)
  if (parts.some(part => !part || part === '.' || part === '..' || CONTROL_RE.test(part))) {
    return '路径不能包含空段、. 或 .. 段或控制字符'
  }
  const normalized = parts.join('/')
  if (normalized.length > 240) return '路径过长'
  return undefined
}

/** Validates a path list (one per line). allowEmpty mirrors forbiddenPaths semantics. */
export function validatePathList(lines: string[], allowEmpty: boolean): string | undefined {
  const nonEmpty = lines.filter(line => line.trim())
  if (!nonEmpty.length && !allowEmpty) return '至少填写一条路径'
  const seen = new Set<string>()
  for (const line of nonEmpty) {
    const error = validateVerificationPathLine(line)
    if (error) return error
    const folded = line.trim().toLocaleLowerCase('en-US')
    if (seen.has(folded)) return `包含重复路径「${line.trim()}」`
    seen.add(folded)
  }
  return undefined
}

/** Mirrors validateTestPath in verification-recipe-types. */
export function validateTestMethodPath(path: string): string | undefined {
  const input = path.trim()
  if (!input) return '必填'
  if (CONTROL_RE.test(input)) return '包含控制字符'
  if (input.startsWith('/') || input.startsWith('\\')) return '必须为工作区相对路径'
  if (input.endsWith('/') || input.endsWith('\\')) return '不能以分隔符结尾'
  if (DRIVE_RE.test(input) || UNC_OR_DEVICE_RE.test(input)) return '必须为工作区相对路径'
  const segments = input.split(/[\\/]/)
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    return '不能包含空段、. 或 .. 段'
  }
  const normalized = segments.join('/')
  const last = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  const ext = dot > 0 ? last.slice(dot).toLocaleLowerCase('en-US') : ''
  if (!ALLOWED_TEST_EXTENSIONS.has(ext)) return '测试文件扩展名必须为 .js / .mjs / .cjs'
  return undefined
}

/** Mirrors textList: each item must be non-empty. */
export function validateTextItems(items: string[], min: number): string | undefined {
  if (items.length < min) return `至少需要 ${min} 条`
  if (items.some(item => !item.trim())) return '存在空项'
  return undefined
}

export function computeCompleteness(contract: VerificationContract, testPath: string): VerificationCompleteness {
  return {
    goal: Boolean(contract.title.trim() && contract.goal.trim()),
    scope: contract.allowedPaths.some(path => path.trim()),
    criteria: contract.acceptanceCriteria.length > 0,
    method: Boolean(testPath.trim()),
    risks: contract.knownRisks.length > 0
  }
}

export function validateContract(contract: VerificationContract, testPath: string): VerificationFieldErrors {
  const errors: VerificationFieldErrors = {}
  if (!contract.title.trim()) errors.title = '必填'
  else if (contract.title.trim().length > 120) errors.title = '不能超过 120 字符'
  if (!contract.goal.trim()) errors.goal = '必填'
  else if (contract.goal.trim().length > 2000) errors.goal = '不能超过 2000 字符'
  const allowed = validatePathList(contract.allowedPaths, false)
  if (allowed) errors.allowedPaths = allowed
  const forbidden = validatePathList(contract.forbiddenPaths, true)
  if (forbidden) errors.forbiddenPaths = forbidden
  const criteria = validateTextItems(contract.acceptanceCriteria, 1)
  if (criteria) errors.acceptanceCriteria = criteria
  const risks = validateTextItems(contract.knownRisks, 1)
  if (risks) errors.knownRisks = risks
  const method = validateTestMethodPath(testPath)
  if (method) errors.testPath = method
  return errors
}
