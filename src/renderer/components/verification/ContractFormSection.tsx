// DEFINE — Verification Contract work surface.
//
// Production work-surface principles applied here:
// - Content main width ~840-920px (the parent centers the ~880px column).
// - Body text 14px; auxiliary 12-13px; metadata 11-12px. No 9-10px body text.
// - Required state is explicit on every field.
// - Criteria 1-4 expand by default; 5+ collapse behind a summary toggle.
// - Bottom sticky action area shows contract completeness + primary submit.
// - Dirty state is surfaced; leaving/discarding never silently drops input.

import { useState } from 'react'
import type { VerificationContract } from '../../../shared/verification-types'
import { useTr } from './verification-i18n'
import type { VerificationCompleteness, VerificationFieldErrors } from './verification-form'
import { accentText, controlBtn, inputErrorStyle, inputStyle } from './verification-styles'

type WorkspaceStatus = { selected: boolean; displayName: string; displayId: string | null }

export interface ContractFormSectionProps {
  workspace: WorkspaceStatus | null
  contract: VerificationContract
  testPath: string
  dirty: boolean
  showErrors: boolean
  fieldErrors: VerificationFieldErrors
  completeness: VerificationCompleteness
  canContinue: boolean
  chooseBusy: boolean
  onChooseWorkspace: () => void
  onChange: (contract: VerificationContract, testPath: string) => void
  onCancel: () => void
  onContinue: () => void
  discardOpen: boolean
  onDiscardClose: () => void
  onDiscardConfirm: () => void
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

function lineValue(value: string[]): string {
  return value.join('\n')
}

interface TextListEditorProps {
  ariaLabel: string
  items: string[]
  error?: string
  showError: boolean
  collapseAfter?: number
  onChange: (next: string[]) => void
}

function TextListEditor({ ariaLabel, items, error, showError, collapseAfter = 0, onChange }: TextListEditorProps) {
  const { tr } = useTr()
  const [expanded, setExpanded] = useState(false)
  const count = items.length
  const collapsible = collapseAfter > 0 && count > collapseAfter
  const visible = collapsible && !expanded ? items.slice(0, collapseAfter) : items
  const hiddenCount = collapsible && !expanded ? count - collapseAfter : 0

  return (
    <div className="space-y-1.5" role="group" aria-label={ariaLabel}>
      {visible.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-right text-xs" style={{ color: 'var(--text-tertiary)' }}>{index + 1}.</span>
          <textarea
            aria-label={`${ariaLabel} ${index + 1}`}
            value={item}
            rows={2}
            style={item.trim() ? inputStyle : { ...inputErrorStyle, border: '1px solid var(--warn)' }}
            onChange={event => {
              const next = [...items]
              next[index] = event.target.value
              onChange(next)
            }}
          />
          <button
            type="button"
            aria-label={`${tr('删除', 'Remove')} ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-1.5 shrink-0 rounded px-1.5 py-0.5 text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--text-tertiary)', border: '1px solid var(--line)' }}
          >
            ×
          </button>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between gap-2 pl-7">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {tr(`另有 ${hiddenCount} 条未展开`, `+${hiddenCount} collapsed`)}
          </span>
          <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium" style={{ ...accentText, cursor: 'pointer' }}>
            {tr('展开全部', 'Expand all')}
          </button>
        </div>
      )}
      {collapsible && expanded && (
        <div className="pl-7">
          <button type="button" onClick={() => setExpanded(false)} className="text-xs font-medium" style={{ ...accentText, cursor: 'pointer' }}>
            {tr('收起（只显示前几条）', 'Collapse')}
          </button>
        </div>
      )}
      <div className="pl-7">
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="text-xs font-medium"
          style={{ ...accentText, cursor: 'pointer' }}
        >
          {tr('+ 添加一项', '+ Add item')}
        </button>
      </div>
      {showError && error && (
        <p role="alert" className="text-xs" style={{ color: 'var(--failed)' }}>{error}</p>
      )}
    </div>
  )
}

interface FieldLabelProps {
  label: string
  required?: boolean
  helper?: string
}

function FieldLabel({ label, required, helper }: FieldLabelProps) {
  const { tr } = useTr()
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{label}</span>
      {required && (
        <span className="text-[12px]" style={{ color: 'var(--failed)' }}>
          {tr('（必填）', '(required)')}
        </span>
      )}
      {helper && <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{helper}</span>}
    </div>
  )
}

function CompletenessChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
      style={{
        borderColor: ok ? 'var(--verified)' : 'var(--warn)',
        color: ok ? 'var(--verified)' : 'var(--warn)'
      }}
    >
      <span aria-hidden="true">{ok ? '✓' : '○'}</span>
      {label}
    </span>
  )
}

export default function ContractFormSection({
  workspace,
  contract,
  testPath,
  dirty,
  showErrors,
  fieldErrors,
  completeness,
  canContinue,
  chooseBusy,
  onChooseWorkspace,
  onChange,
  onCancel,
  onContinue,
  discardOpen,
  onDiscardClose,
  onDiscardConfirm
}: ContractFormSectionProps) {
  const { tr } = useTr()

  const setContractField = <K extends keyof VerificationContract>(key: K, value: VerificationContract[K]) => {
    onChange({ ...contract, [key]: value }, testPath)
  }

  const showFieldError = (key: keyof VerificationFieldErrors, hasContent: boolean): boolean =>
    Boolean(fieldErrors[key] && (showErrors || hasContent))

  const missing: string[] = []
  if (!completeness.goal) missing.push(tr('目标', 'goal'))
  if (!completeness.scope) missing.push(tr('范围', 'scope'))
  if (!completeness.criteria) missing.push(tr('Criteria', 'Criteria'))
  if (!completeness.method) missing.push(tr('验证方法', 'method'))

  return (
    <div className="relative">
      <section
        role="region"
        aria-label={tr('定义验证合同', 'Define verification contract')}
        className="space-y-5"
        style={{ maxWidth: 880, margin: '0 auto' }}
      >
        {/* Workspace selector */}
        <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {tr('验证对象所在项目', 'Subject workspace')}
            </div>
            <div className="mt-0.5 truncate text-sm" style={{ color: 'var(--ink)' }}>
              {workspace?.selected ? workspace.displayName : tr('尚未选择 Git 项目', 'No Git project selected')}
            </div>
          </div>
          <button
            type="button"
            onClick={onChooseWorkspace}
            disabled={chooseBusy}
            className="shrink-0 rounded-md border px-3 text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            {chooseBusy ? tr('选择中…', 'Choosing…') : tr('选择项目', 'Choose project')}
          </button>
        </div>

        {/* Task title */}
        <div>
          <FieldLabel label={tr('任务标题', 'Task title')} required />
          <input
            aria-label={tr('任务标题', 'Task title')}
            value={contract.title}
            placeholder={tr('例如：R2D 闭环验收', 'e.g. R2D closed-loop acceptance')}
            style={showFieldError('title', Boolean(contract.title.trim())) ? inputErrorStyle : inputStyle}
            onChange={event => setContractField('title', event.target.value)}
          />
          {showFieldError('title', Boolean(contract.title.trim())) && (
            <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--failed)' }}>{fieldErrors.title}</p>
          )}
        </div>

        {/* Goal */}
        <div>
          <FieldLabel label={tr('目标', 'Goal')} required />
          <textarea
            aria-label={tr('目标', 'Goal')}
            value={contract.goal}
            rows={3}
            placeholder={tr('确认固定 node --test 通过并导出回执。', 'Confirm the fixed node --test passes and export the receipt.')}
            style={showFieldError('goal', Boolean(contract.goal.trim())) ? inputErrorStyle : inputStyle}
            onChange={event => setContractField('goal', event.target.value)}
          />
          {showFieldError('goal', Boolean(contract.goal.trim())) && (
            <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--failed)' }}>{fieldErrors.goal}</p>
          )}
        </div>

        {/* Allowed / forbidden paths */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label={tr('允许路径', 'Allowed paths')} required helper={tr('（每行一条）', '(one per line)')} />
            <textarea
              aria-label={tr('允许路径', 'Allowed paths')}
              value={lineValue(contract.allowedPaths)}
              rows={4}
              placeholder={'src\ntest'}
              style={showFieldError('allowedPaths', contract.allowedPaths.some(p => p.trim())) ? inputErrorStyle : inputStyle}
              onChange={event => setContractField('allowedPaths', lines(event.target.value))}
            />
            {showFieldError('allowedPaths', contract.allowedPaths.some(p => p.trim())) && (
              <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--failed)' }}>{fieldErrors.allowedPaths}</p>
            )}
          </div>
          <div>
            <FieldLabel label={tr('禁止路径', 'Forbidden paths')} helper={tr('（每行一条，可空）', '(one per line, optional)')} />
            <textarea
              aria-label={tr('禁止路径', 'Forbidden paths')}
              value={lineValue(contract.forbiddenPaths)}
              rows={4}
              placeholder={'.git'}
              style={showFieldError('forbiddenPaths', contract.forbiddenPaths.some(p => p.trim())) ? inputErrorStyle : inputStyle}
              onChange={event => setContractField('forbiddenPaths', lines(event.target.value))}
            />
            {showFieldError('forbiddenPaths', contract.forbiddenPaths.some(p => p.trim())) && (
              <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--failed)' }}>{fieldErrors.forbiddenPaths}</p>
            )}
          </div>
        </div>

        {/* Acceptance criteria */}
        <div>
          <FieldLabel label={tr('验收标准', 'Acceptance criteria')} required helper={tr('（1-4 条展开，更多折叠）', '(1-4 shown; more collapsed)')} />
          <TextListEditor
            ariaLabel={tr('验收标准', 'Acceptance criteria')}
            items={contract.acceptanceCriteria}
            error={fieldErrors.acceptanceCriteria}
            showError={showFieldError('acceptanceCriteria', contract.acceptanceCriteria.length > 0)}
            collapseAfter={4}
            onChange={next => setContractField('acceptanceCriteria', next)}
          />
        </div>

        {/* Known risks */}
        <div>
          <FieldLabel label={tr('已知风险', 'Known risks')} required helper={tr('（至少 1 条）', '(at least 1)')} />
          <TextListEditor
            ariaLabel={tr('已知风险', 'Known risks')}
            items={contract.knownRisks}
            error={fieldErrors.knownRisks}
            showError={showFieldError('knownRisks', contract.knownRisks.length > 0)}
            onChange={next => setContractField('knownRisks', next)}
          />
        </div>

        {/* Verification method */}
        <div>
          <FieldLabel label={tr('验证方法', 'Verification method')} required helper={tr('（测试文件相对路径，.js/.mjs/.cjs）', '(test file relative path, .js/.mjs/.cjs)')} />
          <input
            aria-label={tr('验证方法', 'Verification method')}
            value={testPath}
            placeholder="test/example.test.mjs"
            style={showFieldError('testPath', Boolean(testPath.trim())) ? inputErrorStyle : inputStyle}
            onChange={event => onChange(contract, event.target.value)}
          />
          {showFieldError('testPath', Boolean(testPath.trim())) && (
            <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--failed)' }}>{fieldErrors.testPath}</p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {tr(
              '此方法将以固定 node --test 命令执行，不使用 shell，不读取密钥。',
              'This method runs a fixed node --test command: no shell, no secret access.'
            )}
          </p>
        </div>

        {/* Dirty banner */}
        {dirty && (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
            <span className="text-[13px] font-medium" style={{ color: 'var(--warn)' }}>
              {tr('有未保存的编辑', 'You have unsaved edits')}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="text-[13px] font-medium underline"
              style={{ color: 'var(--warn)', cursor: 'pointer' }}
            >
              {tr('放弃更改…', 'Discard…')}
            </button>
          </div>
        )}

        {/* Bottom sticky action area */}
        <div className="sticky bottom-0 border-t py-3" style={{ background: 'var(--bg-primary)', borderColor: 'var(--line)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{tr('合同完整性', 'Contract completeness')}:</span>
              <CompletenessChip ok={completeness.goal} label={tr('目标', 'goal')} />
              <CompletenessChip ok={completeness.scope} label={tr('范围', 'scope')} />
              <CompletenessChip ok={completeness.criteria} label="Criteria" />
              <CompletenessChip ok={completeness.method} label={tr('验证方法', 'method')} />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={!dirty}
                className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
              >
                {tr('取消', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ ...controlBtn, background: 'var(--indigo)' }}
              >
                {tr('确认并继续', 'Confirm & continue')}
              </button>
            </div>
          </div>
          {!canContinue && (
            <p className="mt-2 text-xs" style={{ color: 'var(--warn)' }}>
              {missing.length > 0
                ? tr(`还需填写：${missing.join('、')}`, `Missing: ${missing.join(', ')}`)
                : tr('完成全部必填项后即可继续。', 'Complete all required fields to continue.')}
            </p>
          )}
        </div>
      </section>

      {/* Discard confirmation overlay */}
      {discardOpen && (
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-16" role="presentation">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onDiscardClose} />
          <div
            className="relative w-[440px] max-w-[90%] rounded-xl border p-5 shadow-2xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
            role="alertdialog"
            aria-modal="true"
            aria-label={tr('放弃未保存的编辑', 'Discard unsaved edits?')}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {tr('放弃未保存的编辑？', 'Discard unsaved edits?')}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {tr(
                '当前合同与验证方法有未保存的修改。放弃后将恢复到上次确认的状态。',
                'The contract and verification method have unsaved changes. Discarding restores the last confirmed state.'
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onDiscardClose}
                className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90"
                style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
              >
                {tr('继续编辑', 'Keep editing')}
              </button>
              <button
                type="button"
                onClick={onDiscardConfirm}
                className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ ...controlBtn, background: 'var(--failed)' }}
              >
                {tr('放弃更改', 'Discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
