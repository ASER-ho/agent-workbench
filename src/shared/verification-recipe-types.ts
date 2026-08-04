// Node test recipe type and validation.
// Pure TypeScript module: no Node, fs, network, Electron, or LLM access, so it
// can also be bundled into the renderer if needed. First version only allows a
// single node-test-v1 recipe that runs one .js/.mjs/.cjs test file with a
// trusted external node.exe. Explicitly NOT supported yet: .ts/.mts test files,
// npm scripts, Python/Cargo/PowerShell/shell commands, multiple commands, and
// user-supplied argument arrays.

export interface NodeTestRecipe {
  recipeType: 'node-test-v1'
  testPath: string
  timeoutMs: number
  expectedWorkspaceMutation: false
}

export type NodeTestRecipeValidationResult =
  | { ok: true; recipe: NodeTestRecipe }
  | { ok: false; reason: string }

// Matches ASCII control characters (U+0000..U+001F and U+007F). Built via
// String.fromCharCode so the source file contains no literal control bytes.
const CONTROL_RE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`
)
const DRIVE_RE = /^[A-Za-z]:/
const UNC_OR_DEVICE_RE = /^(?:\\\\|\/\/|\\[?.]\\)/
const ALLOWED_TEST_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 60_000

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateTestPath(value: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: 'testPath must be a non-empty relative path' }
  }
  const input = value.trim()
  if (CONTROL_RE.test(input)) return { ok: false, reason: 'testPath contains control characters' }
  if (input.startsWith('/') || input.startsWith('\\')) return { ok: false, reason: 'testPath must be relative' }
  if (input.endsWith('/') || input.endsWith('\\')) return { ok: false, reason: 'testPath must not end with a separator' }
  if (DRIVE_RE.test(input) || UNC_OR_DEVICE_RE.test(input)) return { ok: false, reason: 'testPath must be workspace-relative' }
  const segments = input.split(/[\\/]/)
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    return { ok: false, reason: 'testPath contains an empty, dot, or traversal segment' }
  }
  const normalized = segments.join('/')
  const lastSegment = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = lastSegment.lastIndexOf('.')
  const extension = dot > 0 ? lastSegment.slice(dot) : ''
  if (!ALLOWED_TEST_EXTENSIONS.has(extension.toLocaleLowerCase('en-US'))) {
    return { ok: false, reason: 'testPath extension must be one of .js, .mjs, .cjs' }
  }
  return { ok: true, value: normalized }
}

function validateTimeoutMs(value: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true, value: DEFAULT_TIMEOUT_MS }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return { ok: false, reason: 'timeoutMs must be a positive integer' }
  }
  if (value > MAX_TIMEOUT_MS) return { ok: false, reason: 'timeoutMs must be at most 60000' }
  return { ok: true, value }
}

export function validateNodeTestRecipe(input: unknown): NodeTestRecipeValidationResult {
  if (!isPlainRecord(input)) return { ok: false, reason: 'recipe must be an object' }
  if (input['recipeType'] !== 'node-test-v1') return { ok: false, reason: 'recipeType must be exactly "node-test-v1"' }
  if (input['expectedWorkspaceMutation'] !== false) {
    return { ok: false, reason: 'expectedWorkspaceMutation must be exactly false' }
  }
  const testPath = validateTestPath(input['testPath'])
  if (!testPath.ok) return testPath
  const timeoutMs = validateTimeoutMs(input['timeoutMs'])
  if (!timeoutMs.ok) return timeoutMs
  return {
    ok: true,
    recipe: {
      recipeType: 'node-test-v1',
      testPath: testPath.value,
      timeoutMs: timeoutMs.value,
      expectedWorkspaceMutation: false
    }
  }
}
