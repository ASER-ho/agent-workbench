// REVIEW — the real Execution Preview.
//
// The user must see at a glance: what will be verified, the Subject, the test
// path, executable, arguments, cwd, timeout, boundary, the confirmation
// requirement, and why it can / cannot be executed right now. Everything shown
// here is real data from the actual preview/IPC — nothing is fabricated.

import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import type { ControlledVerificationPreview } from '../../../shared/controlled-verification-execution-types'
import { useTr } from './verification-i18n'
import { controlBtn, mono } from './verification-styles'

type WorkspaceStatus = { selected: boolean; displayName: string; displayId: string | null }

export interface ReviewSectionProps {
  workspace: WorkspaceStatus | null
  contract: VerificationContract
  testPath: string
  inspection: VerificationInspection | null
  inspectionError: string
  preview: ControlledVerificationPreview | null
  previewBusy: boolean
  previewError: string
  confirmBusy: boolean
  confirmError?: string
  onBackToDefine: () => void
  onRegenerate: () => void
  onConfirm: () => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </h3>
  )
}

function InfoRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: React.CSSProperties }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <span className="shrink-0 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="min-w-0 break-all text-right text-sm" style={{ color: 'var(--ink)', ...valueClass }}>{value}</span>
    </div>
  )
}

const classificationMeta: Record<string, { labelZh: string; labelEn: string; color: string }> = {
  allowed: { labelZh: '允许', labelEn: 'Allowed', color: 'var(--verified)' },
  forbidden: { labelZh: '禁止', labelEn: 'Forbidden', color: 'var(--failed)' },
  outsideScope: { labelZh: '范围外', labelEn: 'Outside scope', color: 'var(--warn)' }
}

export default function ReviewSection({
  workspace,
  inspection,
  inspectionError,
  preview,
  previewBusy,
  previewError,
  confirmBusy,
  confirmError,
  onBackToDefine,
  onRegenerate,
  onConfirm
}: ReviewSectionProps) {
  const { tr } = useTr()

  const canExecute = Boolean(preview && !previewError && !confirmError && workspace?.selected)

  const changed = inspection?.changes ?? []
  const shownChanged = changed.slice(0, 8)

  return (
    <section role="region" aria-label={tr('执行预览', 'Execution preview')} className="space-y-5" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {tr('执行预览', 'Execution preview')}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {tr(
            '确认前请核对：将验证什么、以什么命令验证、在什么边界内执行。一次确认后执行，不可重放。',
            'Review what will be verified, the exact command, and the execution boundary. Confirmation is single-use.'
          )}
        </p>
        {confirmError && (
          <p role="alert" className="mt-2 rounded-md border px-3 py-2 text-[13px]" style={{ color: 'var(--failed)', borderColor: 'var(--failed)' }}>
            {confirmError}
          </p>
        )}
      </div>

      {/* Subject / Observation */}
      <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <SectionTitle>{tr('将验证什么 — Subject / 观察', 'What will be verified — Subject / Observation')}</SectionTitle>
        {inspectionError && (
          <p role="alert" className="text-[13px]" style={{ color: 'var(--failed)' }}>{inspectionError}</p>
        )}
        {!inspection && !inspectionError && (
          <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            {tr('正在检查 Git 修改…', 'Checking Git changes…')}
          </p>
        )}
        {inspection && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-medium"
                style={{
                  borderColor: inspection.scopeCompliant ? 'var(--verified)' : 'var(--warn)',
                  color: inspection.scopeCompliant ? 'var(--verified)' : 'var(--warn)'
                }}
              >
                <span aria-hidden="true">{inspection.scopeCompliant ? '✓' : '✗'}</span>
                {inspection.scopeCompliant ? tr('范围检查：合规', 'Scope: compliant') : tr('范围检查：发现范围外修改', 'Scope: outside-scope changes found')}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {tr('修改', 'changed')} {inspection.changedCount} · {tr('禁止', 'forbidden')} {inspection.forbiddenCount} · {tr('范围外', 'outside')} {inspection.outsideScopeCount}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {tr(
                '范围检查不等于功能验证：还不能确认任务已经完成。尚未运行功能验证命令。',
                'Scope checking is not functional verification: completion is not yet confirmed, and no functional verification command has been run.'
              )}
            </p>
            {changed.length > 0 ? (
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th className="px-3 py-1.5 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{tr('路径', 'Path')}</th>
                      <th className="px-3 py-1.5 text-right text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{tr('分类', 'Class')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownChanged.map((change, index) => {
                      const meta = classificationMeta[change.classification] ?? { labelZh: change.classification, labelEn: change.classification, color: 'var(--ink-2)' }
                      return (
                        <tr key={`${change.path}-${index}`} style={{ borderTop: '1px solid var(--line)' }}>
                          <td className="px-3 py-1.5" style={mono}>
                            <span className="text-[13px]" style={{ color: 'var(--ink)' }}>{change.path}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium" style={{ color: meta.color }}>{tr(meta.labelZh, meta.labelEn)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {changed.length > shownChanged.length && (
                  <p className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {tr(`还有 ${changed.length - shownChanged.length} 条未显示`, `+${changed.length - shownChanged.length} more not shown`)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{tr('没有检测到 Git 修改。', 'No Git changes detected.')}</p>
            )}
          </div>
        )}
      </div>

      {/* Execution preview */}
      <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <SectionTitle>{tr('执行预览', 'Execution preview')}</SectionTitle>
        {previewBusy && !preview && (
          <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            {tr('正在生成执行预览…', 'Generating execution preview…')}
          </p>
        )}
        {previewError && !preview && (
          <div className="space-y-2">
            <p role="alert" className="text-[13px]" style={{ color: 'var(--failed)' }}>
              {tr('无法生成执行预览：', 'Could not generate the execution preview: ')}{previewError}
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {tr(
                '下一步：检查测试文件是否存在于工作区、验证方法是否为 .js/.mjs/.cjs 相对路径、是否已选择项目，然后重新生成预览。',
                'Next: verify the test file exists in the workspace, the method is a .js/.mjs/.cjs relative path, and a project is selected; then regenerate the preview.'
              )}
            </p>
          </div>
        )}
        {preview && (
          <div>
            <div className="mb-3 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)' }}>
              <div className="px-4 py-1.5" style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr('固定命令', 'Fixed command')}
                </span>
              </div>
              <div className="px-4 py-3">
                <code className="block break-all text-sm" style={{ ...mono, color: 'var(--ink)' }}>{preview.commandPreview}</code>
              </div>
            </div>
            <div className="rounded-lg border px-4" style={{ borderColor: 'var(--line)' }}>
              <InfoRow label={tr('测试路径', 'Test path')} value={<code style={mono}>{preview.testPath}</code>} />
              <InfoRow
                label={tr('可执行文件', 'Executable')}
                value={tr('可信 node.exe', 'Trusted node.exe')}
              />
              <InfoRow label={tr('参数', 'Arguments')} value={<code style={mono}>{preview.args.join(' ')}</code>} />
              <InfoRow
                label={tr('工作目录', 'Working directory')}
                value={workspace?.selected ? workspace.displayName : tr('（未选择）', '(not selected)')}
                valueClass={{ color: 'var(--ink-2)' }}
              />
              <InfoRow label={tr('超时', 'Timeout')} value={`${preview.timeoutMs / 1000}s`} />
              <InfoRow label={tr('环境配置', 'Environment')} value={preview.environmentProfile} />
              <InfoRow label={tr('过期时间', 'Expiration')} value={new Date(preview.expiration).toLocaleString()} valueClass={{ color: 'var(--ink-2)' }} />
            </div>

            {/* Boundary */}
            <div className="mt-3">
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr('实际隔离边界', 'Actual isolation boundary')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {preview.isolationLevels.map(level => (
                  <span key={level} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                    {level}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {tr(
                  '仅为进程边界隔离（PROCESS_BOUNDARY_ONLY），不是操作系统级沙箱；环境为白名单 allowlist-v1。',
                  'This is PROCESS_BOUNDARY_ONLY, not an OS-level sandbox; the environment is the allowlist-v1 profile.'
                )}
              </p>
            </div>

            {/* Confirmation requirement */}
            <div className="mt-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr('确认要求', 'Confirmation requirement')}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {tr(
                  '本预览绑定固定命令、Subject 快照与 5 分钟过期时间。一次确认后执行；确认不可重放。代码或工作区变化会使确认失效。',
                  'This preview binds a fixed command, the Subject snapshot, and a 5-minute expiry. Confirmation executes once and is not replayable. Code or workspace changes invalidate it.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Why can / cannot execute */}
      <div
        className="rounded-lg border px-4 py-3"
        style={{
          borderColor: canExecute ? 'var(--verified)' : 'var(--warn)',
          background: canExecute ? 'var(--verified-soft)' : 'var(--warn-soft)'
        }}
      >
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-sm" style={{ color: canExecute ? 'var(--verified)' : 'var(--warn)' }}>
            {canExecute ? '✓' : '✗'}
          </span>
          <div>
            <div className="text-sm font-medium" style={{ color: canExecute ? 'var(--verified)' : 'var(--warn)' }}>
              {canExecute ? tr('可以执行', 'Ready to execute') : tr('当前无法执行', 'Cannot execute right now')}
            </div>
            <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {canExecute
                ? tr(
                    '预览已生成并绑定当前 Subject。确认将执行固定命令；前端无法更改命令、超时或隔离边界。',
                    'The preview is ready and bound to the current Subject. Confirmation runs the fixed command; command, timeout, and isolation cannot be changed from the UI.'
                  )
                : previewError
                  ? tr('执行预览生成失败：', 'Preview generation failed: ') + previewError
                  : !workspace?.selected
                    ? tr('未选择项目工作区。下一步：返回编辑合同并选择项目。', 'No project workspace selected. Next: return to the contract and choose a project.')
                    : tr('执行预览尚未就绪。下一步：重新生成预览。', 'The execution preview is not ready. Next: regenerate the preview.')}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToDefine}
            disabled={confirmBusy}
            className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            {tr('返回编辑合同', 'Back to contract')}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={confirmBusy}
            className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            {tr('重新生成预览', 'Regenerate preview')}
          </button>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canExecute || confirmBusy}
          className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ ...controlBtn, background: 'var(--indigo)' }}
        >
          {confirmBusy ? tr('执行中…', 'Executing…') : tr('一次确认并执行', 'Confirm once & execute')}
        </button>
      </div>
    </section>
  )
}
