// Technical Details — the bottom of the Result structure.
// Command, execution status, stdout/stderr (truncation flags are real), the real
// decision trace, and subject digests. Compact; never a dashboard of cards.

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'
import type { ResultLocale } from './result-types'
import { COMMAND_STATUS_LABEL, formatIso, tr, truncateMiddle } from './result-shared'

interface TechnicalDetailsProps {
  result: ControlledVerificationResult
  locale?: ResultLocale
  receipt?: VerificationReceipt | null
}

export default function TechnicalDetails({ result, locale, receipt }: TechnicalDetailsProps) {
  if (result.state !== 'executed') {
    return (
      <details aria-label={tr(locale, '技术详情', 'Technical details')}>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '技术详情', 'Technical details')}
        </summary>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '执行未完成，无技术详情。', 'Execution did not complete; no technical details.')}
        </p>
      </details>
    )
  }

  const statusLabel = COMMAND_STATUS_LABEL[result.commandStatus] ?? { zh: result.commandStatus, en: result.commandStatus }

  return (
    <details aria-label={tr(locale, '技术详情', 'Technical details')}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {tr(locale, '技术详情', 'Technical details')}
      </summary>

      <dl className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '命令', 'Command')}</dt>
          <dd className="min-w-0 truncate text-right font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }} title={result.commandPreview}>
            {result.commandPreview}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '测试路径', 'Test path')}</dt>
          <dd className="min-w-0 truncate text-right font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }} title={result.testPath}>
            {result.testPath}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '执行状态', 'Execution status')}</dt>
          <dd style={{ color: 'var(--text-secondary)' }}>
            {tr(locale, statusLabel.zh, statusLabel.en)} · {tr(locale, '退出码', 'exit')} {result.exitCode ?? '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '超时', 'Timeout')}</dt>
          <dd style={{ color: 'var(--text-secondary)' }}>{Math.round(result.timeoutMs / 1000)}s</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '隔离等级', 'Isolation')}</dt>
          <dd className="min-w-0 truncate text-right text-[11px]" style={{ color: 'var(--text-secondary)' }} title={result.isolationLevels.join(', ')}>
            {result.isolationLevels.join(', ')}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '起止时间', 'Start / end')}</dt>
          <dd className="text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {formatIso(result.startedAt)} → {formatIso(result.endedAt)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, 'Subject 稳定性', 'Subject stability')}</dt>
          <dd style={{ color: result.subjectStable ? 'var(--verified)' : 'var(--warn)' }}>
            {result.subjectStable ? tr(locale, '稳定', 'Stable') : tr(locale, '已变化', 'Changed')}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '验证前 Subject', 'Subject before')}</dt>
          <dd className="min-w-0">
            <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={result.subjectBeforeDigest}>
              {truncateMiddle(result.subjectBeforeDigest, 24, 10)}
            </code>
          </dd>
        </div>
        {result.subjectAfterDigest && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '验证后 Subject', 'Subject after')}</dt>
            <dd className="min-w-0">
              <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={result.subjectAfterDigest}>
                {truncateMiddle(result.subjectAfterDigest, 24, 10)}
              </code>
            </dd>
          </div>
        )}
        {receipt && receipt.unresolvedItems.length > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '未解决项', 'Unresolved')}</dt>
            <dd className="text-right text-[11px]" style={{ color: 'var(--warn)' }}>
              {receipt.unresolvedItems.join(', ')}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '标准输出', 'Stdout')}{result.stdoutTruncated ? ` ${tr(locale, '(已截断)', '(truncated)')}` : ''}
          </div>
          <pre className="max-h-40 overflow-auto rounded border p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            {result.stdout || tr(locale, '(空)', '(empty)')}
          </pre>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '标准错误', 'Stderr')}{result.stderrTruncated ? ` ${tr(locale, '(已截断)', '(truncated)')}` : ''}
          </div>
          <pre className="max-h-40 overflow-auto rounded border p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            {result.stderr || tr(locale, '(空)', '(empty)')}
          </pre>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '决策轨迹', 'Decision trace')}
        </div>
        <pre className="max-h-40 overflow-auto rounded border p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {result.criterion.decisionTrace.join('\n')}
        </pre>
      </div>
    </details>
  )
}
