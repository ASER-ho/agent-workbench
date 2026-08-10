// VERIFY — running state for controlled verification execution.
//
// The backend has no streaming progress, so this surface is HONESTLY
// indeterminate: a spinner, elapsed time, the current operation description,
// and a cancel action. It never fabricates a percentage or "2/3 criteria".

import { useTr } from './verification-i18n'
import { controlBtn, mono } from './verification-styles'

export interface VerifyRunningSectionProps {
  testPath: string
  commandPreview: string
  elapsedSeconds: number
  onCancel: () => void
}

export default function VerifyRunningSection({
  testPath,
  commandPreview,
  elapsedSeconds,
  onCancel
}: VerifyRunningSectionProps) {
  const { tr } = useTr()

  return (
    <section role="region" aria-label={tr('验证执行中', 'Verification running')} className="space-y-5" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="rounded-lg border p-6" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <div className="flex items-start gap-4">
          <div className="loading-spinner mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
              {tr('正在执行受控验证', 'Running controlled verification')}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {tr('当前操作：', 'Current operation: ')}
              <code className="break-all" style={mono}>{commandPreview || `node --test ${testPath}`}</code>
            </p>
            <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {tr('已用时：', 'Elapsed: ')}<span className="font-mono">{elapsedSeconds}s</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {tr(
                '此版本不提供进度百分比；执行完成后立即显示真实结果。',
                'This version reports no progress percentage; real results appear as soon as execution finishes.'
              )}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90"
            style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            {tr('取消执行', 'Cancel execution')}
          </button>
        </div>
      </div>
    </section>
  )
}
