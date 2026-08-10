// Inspector content for the 0.1.2-B Verification Workbench.
//
// This is a PRESENTATIONAL component only — it is NOT mounted by the workbench.
// The integration agent wires it into src/renderer/components/layout/Inspector.tsx
// for the 'verification' view. Each context must state which verification action
// the current selection affects (not just list metadata), so the user always
// knows the consequence of editing/confirming in the current context.
//
// Visual style mirrors Inspector.tsx: text-xs body, uppercase section headers,
// and the graphite/indigo design tokens.

import { useEffect, useState } from 'react'
import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import type {
  ControlledVerificationCommandStatus,
  ControlledVerificationPreview
} from '../../../shared/controlled-verification-execution-types'
import { useTr } from './verification-i18n'
import {
  getVerificationInspector,
  subscribeVerificationInspector,
  type VerificationInspectorSnapshot
} from './verification-inspector-bridge'

export interface VerificationInspectorContentProps {
  context: 'contract' | 'subject' | 'execution' | 'running'
  contract?: VerificationContract
  testPath?: string
  workspace?: { selected: boolean; displayName: string; displayId: string | null } | null
  inspection?: VerificationInspection | null
  preview?: ControlledVerificationPreview | null
  previewBusy?: boolean
  previewError?: string
  executing?: boolean
  elapsedSeconds?: number
  commandStatus?: ControlledVerificationCommandStatus
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle?: React.CSSProperties }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs leading-relaxed">
      <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="min-w-0 truncate text-right" style={{ color: 'var(--text-primary)', ...valueStyle }}>{value}</span>
    </div>
  )
}

export default function VerificationInspectorContent({
  context,
  contract,
  testPath,
  workspace,
  inspection,
  preview,
  previewBusy,
  previewError,
  executing,
  elapsedSeconds,
  commandStatus
}: VerificationInspectorContentProps) {
  const { tr } = useTr()

  const workspaceLabel = workspace?.selected ? workspace.displayName : tr('未选择工作区', 'No workspace selected')
  const changedCount = inspection?.changedCount ?? 0

  switch (context) {
    case 'contract':
      return (
        <div className="space-y-3">
          <Section title={tr('验证合同', 'Verification Contract')}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(
                '当前选中：验证合同。编辑合同会立即失效旧的执行预览与结果；确认以当前合同摘要为准。',
                'Current selection: verification contract. Editing the contract immediately invalidates the execution preview and result; confirmation binds the current contract digest.'
              )}
            </p>
            <Row label={tr('标题', 'Title')} value={contract?.title?.trim() ? contract.title.trim() : tr('（未填）', '(empty)')} />
            <Row label={tr('目标', 'Goal')} value={contract?.goal?.trim() ? contract.goal.trim() : tr('（未填）', '(empty)')} />
            <Row label={tr('允许路径', 'Allowed paths')} value={String(contract?.allowedPaths?.length ?? 0)} />
            <Row label={tr('验收标准', 'Criteria')} value={String(contract?.acceptanceCriteria?.length ?? 0)} />
            <Row label={tr('验证方法', 'Method')} value={testPath?.trim() || tr('（未填）', '(empty)')} />
          </Section>
        </div>
      )
    case 'subject':
      return (
        <div className="space-y-3">
          <Section title={tr('验证对象 / 观察', 'Subject / Observation')}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(
                '当前选中：验证对象（Git 修改范围）。对象摘要绑定到预览与确认；代码或工作区变化会使确认失效。',
                'Current selection: the subject (Git change scope). The subject digest binds to the preview and confirmation; code or workspace changes invalidate the confirmation.'
              )}
            </p>
            <Row label={tr('工作区', 'Workspace')} value={workspaceLabel} />
            <Row label={tr('修改数量', 'Changed files')} value={String(changedCount)} />
            <Row label={tr('范围合规', 'Scope compliant')} value={inspection ? (inspection.scopeCompliant ? tr('合规', 'Compliant') : tr('存在问题', 'Problem')) : tr('—', '—')} />
            <Row
              label={tr('对象摘要', 'Subject digest')}
              value={preview?.subjectDigest ? preview.subjectDigest.slice(0, 12) + '…' : tr('（未捕获）', '(not captured)')}
              valueStyle={{ fontFamily: 'monospace' }}
            />
          </Section>
        </div>
      )
    case 'execution':
      return (
        <div className="space-y-3">
          <Section title={tr('执行预览', 'Execution Preview')}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(
                '当前选中：执行预览。固定命令、超时、隔离边界在预览时锁定，前端不可更改。一次确认后执行，不可重放。',
                'Current selection: execution preview. The fixed command, timeout, and isolation boundaries are locked at preview time and cannot be changed from the UI. Confirmation is single-use.'
              )}
            </p>
            {preview ? (
              <>
                <Row label={tr('命令', 'Command')} value={preview.commandPreview} valueStyle={{ fontFamily: 'monospace' }} />
                <Row label={tr('测试路径', 'Test path')} value={preview.testPath} />
                <Row label={tr('超时', 'Timeout')} value={`${preview.timeoutMs / 1000}s`} />
                <Row label={tr('环境配置', 'Environment')} value={preview.environmentProfile} />
                <Row label={tr('过期时间', 'Expiration')} value={new Date(preview.expiration).toLocaleString()} />
              </>
            ) : previewBusy ? (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {tr('正在生成执行预览…', 'Generating execution preview…')}
              </p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {previewError || tr('暂无执行预览。', 'No execution preview yet.')}
              </p>
            )}
          </Section>
        </div>
      )
    case 'running':
      return (
        <div className="space-y-3">
          <Section title={tr('执行中', 'Executing')}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(
                '当前选中：受控验证执行。此版本不提供进度百分比；执行完成后立即显示真实结果。可随时取消。',
                'Current selection: controlled verification execution. This version reports no progress percentage; real results appear as soon as execution finishes. You can cancel at any time.'
              )}
            </p>
            {executing && (
              <>
                <Row label={tr('命令', 'Command')} value={preview?.commandPreview ?? tr('—', '—')} valueStyle={{ fontFamily: 'monospace' }} />
                <Row label={tr('已用时', 'Elapsed')} value={`${elapsedSeconds ?? 0}s`} />
                <Row label={tr('命令状态', 'Status')} value={commandStatus ?? tr('执行中', 'Running')} />
              </>
            )}
          </Section>
        </div>
      )
    default:
      return null
  }
}

/**
 * Convenience hook for the integration agent: returns the latest snapshot the
 * workbench published (subscribes to the module-scoped bridge). If the
 * integration agent prefers to pass props explicitly, use the default
 * `VerificationInspectorContent` component directly instead.
 */
export function useVerificationInspector(): VerificationInspectorSnapshot {
  const [snapshot, setSnapshot] = useState<VerificationInspectorSnapshot>(() => getVerificationInspector())
  useEffect(() => {
    return subscribeVerificationInspector(setSnapshot)
  }, [])
  return snapshot
}
