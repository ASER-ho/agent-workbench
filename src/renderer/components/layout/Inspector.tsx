import { useEffect, useState } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import VerificationInspectorContent from '../verification/VerificationInspectorContent'
import ResultInspectorContent from '../result/ResultInspectorContent'
import {
  getVerificationInspector,
  subscribeVerificationInspector,
  type VerificationInspectorSnapshot
} from '../verification/verification-inspector-bridge'

/** Display-safe basename of a path — never expose a full path. */
function workspaceBasename(root: string): string {
  if (!root) return ''
  return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

interface InspectorProps {
  /** When true, render as a right-side overlay drawer (used below ~1180px). */
  overlay?: boolean
}

/**
 * Context Inspector shell for 0.1.2. The right panel is a live, contextual
 * surface: for the Verification view it renders the Verification / Result
 * inspector content driven by the workbench's published snapshot; for other
 * views it shows the view's basic context summary.
 */
export default function Inspector({ overlay = false }: InspectorProps) {
  const { t, locale } = useLocale()
  const { currentView, setInspectorOpen } = useView()
  const { root } = useWorkspace()

  // Live snapshot published by the Verification Workbench (module-scoped bridge).
  const [inspector, setInspector] = useState<VerificationInspectorSnapshot>(() => getVerificationInspector())
  useEffect(() => subscribeVerificationInspector(setInspector), [])

  const renderBody = () => {
    if (currentView === 'verification') {
      // RESULT stage → Agent C's Result inspector (criterion / evidence / verdict).
      // Selection is shared with the Result Workbench via the bridge, so the
      // Inspector mirrors whichever Criterion / Evidence is selected there.
      if (inspector.context === 'result' && inspector.result) {
        return (
          <ResultInspectorContent
            result={inspector.result}
            locale={locale}
            selectedCriterionId={inspector.selectedCriterionId}
            selectedEvidenceId={inspector.selectedEvidenceId}
          />
        )
      }
      // DEFINE / REVIEW / VERIFY → Agent B's Verification inspector.
      const verifContext = inspector.context === 'result' ? 'contract' : inspector.context
      return (
        <VerificationInspectorContent
          context={verifContext}
          contract={inspector.contract}
          testPath={inspector.testPath}
          workspace={inspector.workspace}
          inspection={inspector.inspection}
          preview={inspector.preview}
          previewBusy={inspector.previewBusy}
          previewError={inspector.previewError}
          executing={inspector.executing}
          elapsedSeconds={inspector.elapsedSeconds}
          commandStatus={inspector.commandStatus}
        />
      )
    }

    switch (currentView) {
      case 'workspace': {
        const base = workspaceBasename(root)
        return (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {t('inspector.workspace')}
            </div>
            <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {base || t('common.none')}
            </div>
          </div>
        )
      }
      case 'environment':
        return (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('inspector.environmentHint')}
          </p>
        )
      case 'settings':
        return (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('inspector.settingsHint')}
          </p>
        )
      default:
        return null
    }
  }

  return (
    <aside
      className={`${overlay ? 'h-full' : 'flex-shrink-0'} flex flex-col overflow-hidden`}
      style={{
        width: 'var(--inspector-width, 300px)',
        background: 'var(--bg-tertiary)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: overlay ? '-10px 0 24px rgba(0, 0, 0, 0.25)' : undefined
      }}
      aria-label={t('inspector.title')}
    >
      <header
        className="flex-shrink-0 flex items-center justify-between px-3 h-10"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {t('inspector.title')}
        </span>
        <button
          type="button"
          onClick={() => setInspectorOpen(false)}
          title={t('inspector.close')}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-gray-800"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {renderBody()}
      </div>
    </aside>
  )
}
