import type {
  PlainVerificationReceipt,
  VerificationContract,
  VerificationInspectRequest,
  VerificationPathClassification
} from './verification-types'

const CONTROL_RE = /[\u0000-\u001f\u007f]/
const DRIVE_RE = /^[A-Za-z]:/
const DEVICE_OR_UNC_RE = /^(?:\\\\|\/\/|\\[?.]\\)/
const SECRET_SHAPE_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/-]{8,})\b/i

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function onlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} contains forbidden field: ${key}`)
  }
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const text = value.trim()
  if (!text || text.length > max || CONTROL_RE.test(text)) throw new Error(`${label} is invalid`)
  if (SECRET_SHAPE_RE.test(text)) throw new Error(`${label} contains credential-shaped content`)
  return text
}

export function normalizeVerificationPath(value: unknown): string {
  if (typeof value !== 'string') throw new Error('verification path must be a string')
  const input = value.trim()
  if (!input || input.startsWith('/') || input.endsWith('/') || input.endsWith('\\') || DRIVE_RE.test(input) || DEVICE_OR_UNC_RE.test(input)) {
    throw new Error('verification path must be workspace-relative')
  }
  const parts = input.split(/[\\/]/)
  if (parts.some(part => !part || part === '.' || part === '..' || CONTROL_RE.test(part))) {
    throw new Error('verification path contains an empty, dot, traversal, or control segment')
  }
  const normalized = parts.join('/')
  if (normalized.length > 240) throw new Error('verification path is too long')
  return normalized
}

function pathList(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 64) {
    throw new Error(`${label} must contain ${allowEmpty ? '0-64' : '1-64'} paths`)
  }
  const normalized = value.map(normalizeVerificationPath)
  const seen = new Set<string>()
  for (const path of normalized) {
    const folded = path.toLocaleLowerCase('en-US')
    if (seen.has(folded)) throw new Error(`${label} contains duplicate Windows paths`)
    seen.add(folded)
  }
  return normalized
}

function textList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) throw new Error(`${label} must contain 1-32 items`)
  return value.map((item, index) => boundedText(item, `${label}[${index}]`, 500))
}

export function validateVerificationContract(value: unknown): VerificationContract {
  const record = objectRecord(value, 'verification contract')
  onlyKeys(record, ['title', 'goal', 'allowedPaths', 'forbiddenPaths', 'acceptanceCriteria', 'knownRisks'], 'verification contract')
  return {
    title: boundedText(record.title, 'title', 120),
    goal: boundedText(record.goal, 'goal', 2_000),
    allowedPaths: pathList(record.allowedPaths, 'allowedPaths', false),
    forbiddenPaths: pathList(record.forbiddenPaths, 'forbiddenPaths', true),
    acceptanceCriteria: textList(record.acceptanceCriteria, 'acceptanceCriteria'),
    knownRisks: textList(record.knownRisks, 'knownRisks')
  }
}

export function validateVerificationInspectRequest(value: unknown): VerificationInspectRequest {
  const record = objectRecord(value, 'verification.inspect')
  onlyKeys(record, ['contract'], 'verification.inspect')
  return { contract: validateVerificationContract(record.contract) }
}

function pathRuleMatches(path: string, rule: string): boolean {
  const candidate = path.toLocaleLowerCase('en-US')
  const boundary = rule.toLocaleLowerCase('en-US')
  return candidate === boundary || candidate.startsWith(`${boundary}/`)
}

export function classifyVerificationPath(path: string, contract: VerificationContract): VerificationPathClassification {
  const normalized = normalizeVerificationPath(path)
  if (contract.forbiddenPaths.some(rule => pathRuleMatches(normalized, rule))) return 'forbidden'
  if (contract.allowedPaths.some(rule => pathRuleMatches(normalized, rule))) return 'allowed'
  return 'outsideScope'
}

export function buildPlainLanguageReceipt(input: {
  gitRead: boolean
  scopeCompliant: boolean
  changedCount: number
  forbiddenCount: number
  outsideScopeCount: number
  truncated: boolean
}): PlainVerificationReceipt {
  const scopeProblem = input.forbiddenCount > 0 || input.outsideScopeCount > 0
  const confirmed = input.gitRead
    ? `已读取 Git 修改状态并检查 ${input.changedCount} 个修改路径。${input.scopeCompliant ? '当前修改范围符合契约。' : `发现 ${input.forbiddenCount} 个禁止范围路径和 ${input.outsideScopeCount} 个范围外路径。`}${input.truncated ? ' Diff 摘要已截断，界面没有接收原始 Patch。' : ''}`
    : 'Git 修改尚未成功读取。'
  return {
    functionalVerificationPerformed: false,
    sections: [
      { id: 'result', title: '结果', content: '还不能确认任务已经完成' },
      {
        id: 'handoff', title: '现在能不能交接',
        content: scopeProblem
          ? '不能作为已完成结果交接；需要先处理禁止范围或范围外修改。'
          : '可以交给验证人员继续检查，但不能作为已完成结果交付。'
      },
      {
        id: 'why', title: '为什么',
        content: input.gitRead
          ? `${input.scopeCompliant ? '文件修改范围已经检查。' : '文件修改范围存在问题。'}尚未运行功能验证命令。`
          : 'Git 修改未能读取，而且尚未运行功能验证命令。'
      },
      { id: 'confirmed', title: '已经确认了什么', content: confirmed },
      { id: 'unconfirmed', title: '还有什么没确认', content: '代码功能是否正确、验收标准是否满足、测试是否通过，均未确认。' },
      { id: 'next', title: '下一步做什么', content: scopeProblem ? '先审查并处理范围问题，再准备受控验证命令。' : '审查当前修改，再准备并运行一条受控验证命令。' }
    ]
  }
}
