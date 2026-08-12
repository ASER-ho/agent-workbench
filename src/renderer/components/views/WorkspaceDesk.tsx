import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import { evaluateReadiness, type ReadinessResult } from '../../lib/readiness-rules'
import { useLocale } from '../../contexts/LocaleContext'
import { useView } from '../../contexts/ViewContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'

type WorkspaceStatus = Awaited<ReturnType<typeof window.api.workspaceSelection.getStatus>>
type CapsuleLoadResult = Awaited<ReturnType<typeof window.api.capsule.load>>

/** Display-safe basename of a path — never expose a full path. */
function pathBasename(root: string): string {
  if (!root) return ''
  return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

/**
 * Project Desk — the workspace home view for the 0.1.2-A.2 Workspace surface.
 *
 * Shows ONLY real data:
 *   - project identity: workspace basename + optional saved capsule name
 *   - environment summary: Node.js version + Git availability from diagnostics
 *   - verification readiness: derived from evaluateReadiness(diagnostics, …)
 *   - primary actions: New Verification
 *
 * No fake KPIs, no fake history, no recent-result persistence.
 */
export default function WorkspaceDesk() {
  const { t, locale } = useLocale()
  const { navigate } = useView()
  const { root } = useWorkspace()

  // Inline zh/en fallback for strings not yet covered by LocaleContext keys.
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  // Prefer a registered locale key (workspace.* / files.*) and fall back to
  // inline zh/en until the locale owner lands those namespaces.
  const tx = (key: string, zh: string, en: string) => {
    const v = t(key)
    return v && v !== key ? v : (locale === 'zh' ? zh : en)
  }

  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)
  const [diag, setDiag] = useState<DiagnosticReport | null>(null)
  const [capsule, setCapsule] = useState<CapsuleLoadResult | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const run = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const [ws, dg, cap] = await Promise.all([
        window.api.workspaceSelection.getStatus(),
        window.api.diagnostics.run(),
        window.api.capsule.load()
      ])
      setWorkspace(ws)
      setDiag(dg)
      setCapsule(cap)
      setReadiness(evaluateReadiness(dg, cap.capsule, cap.source))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { void run() }, [run])

  // ── Project identity ──────────────────────────────────────────────
  const projectLabel = workspace?.selected && workspace.displayName
    ? workspace.displayName
    : pathBasename(root)
  const hasProjectLabel = Boolean(projectLabel)
  const capsuleName = capsule?.source === 'saved' ? capsule.capsule.projectName : null

  // ── Environment summary — real diagnostics items only ─────────────
  const nodeItem = diag?.items.find(i => i.id === 'node-version')
  const nodeText = nodeItem && nodeItem.status !== 'error'
    ? (nodeItem.displaySummary || nodeItem.summary || '').trim()
    : null
  // Diagnostics currently reports no git item; show the real status (not reported).
  const gitItem = diag?.items.find(i => i.id.startsWith('git'))
  const gitText = gitItem
    ? gitItem.status === 'ok'
      ? tx('workspace.available', '可用', 'Available')
      : tx('workspace.unavailable', '不可用', 'Unavailable')
    : tr('诊断未检查', 'Not reported by diagnostics')

  // ── Verification readiness verdict ────────────────────────────────
  const verdictText = readiness
    ? readiness.verdict === 'ready'
      ? 'var(--verified)'
      : readiness.verdict === 'almost-ready'
        ? 'var(--warn)'
        : readiness.verdict === 'not-ready'
          ? 'var(--failed)'
          : 'var(--text-secondary)'
    : 'var(--text-secondary)'
  const verdictLabel = readiness
    ? readiness.verdict === 'ready'
      ? t('readiness.ready')
      : readiness.verdict === 'almost-ready'
        ? t('readiness.almostReady')
        : readiness.verdict === 'not-ready'
          ? t('readiness.notReady')
          : t('readiness.checking')
    : ''

  const controlBtn = {
    height: 'var(--control-h)',
    borderRadius: 'var(--radius)'
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-[1100px] space-y-5">
        {loading ? (
          <div className="animate-pulse space-y-5">
            <div className="h-6 w-44 rounded" style={{ background: 'var(--bg-secondary)' }} />
            <div className="h-24 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-28 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} />
              <div className="h-28 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--failed)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--failed)' }}>
              <span>{'⚠'}</span>
              <span>{tr('无法加载工作区数据。', 'Failed to load workspace data.')}</span>
            </div>
            <button
              type="button"
              onClick={run}
              className="mt-3 rounded-md px-3 py-1.5 text-xs transition-colors hover:opacity-90"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              {tr('重试', 'Retry')}
            </button>
          </div>
        ) : (
          <>
            {/* Header: title + primary actions */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {tr('项目工作台', 'Project Desk')}
                </h1>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  {tr('工作区首页 — 仅显示真实的环境与就绪状态。', 'Workspace home — shows real environment and readiness only.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('verification')}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90"
                  style={{ ...controlBtn, background: 'var(--accent)', color: '#fff' }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 2.5v11M2.5 8h11" />
                  </svg>
                  {tr('新建验证', 'New Verification')}
                </button>
              </div>
            </div>

            {/* Project identity section */}
            <section className="border-t py-5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr('项目', 'Project')}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="truncate text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                  {hasProjectLabel ? projectLabel : tr('未选择工作区', 'No workspace selected')}
                </span>
                {capsuleName && (
                  <span className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {capsuleName}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: workspace?.selected ? 'var(--verified)' : 'var(--text-tertiary)' }} />
                  {workspace?.selected
                    ? tr('工作区已选择', 'Workspace selected')
                    : tr('未选择工作区', 'No workspace selected')}
                </span>
                {capsule?.source === 'saved' && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--border-color)', color: 'var(--text-tertiary)' }}>
                    {tr('项目概览已恢复', 'Capsule restored')}
                  </span>
                )}
              </div>
            </section>

            {/* Environment + readiness grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <section className="border-t py-5" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {tr('环境', 'Environment')}
                </h2>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt style={{ color: 'var(--text-tertiary)' }}>{tr('Node.js', 'Node.js')}</dt>
                    <dd className="truncate" style={{ color: nodeText ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {nodeText ?? tr('未找到', 'Not found')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt style={{ color: 'var(--text-tertiary)' }}>{tr('Git', 'Git')}</dt>
                    <dd className="truncate" style={{ color: 'var(--text-secondary)' }}>{gitText}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t py-5" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {tr('验证就绪', 'Verification Readiness')}
                </h2>
                {readiness ? (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-base font-semibold" style={{ color: verdictText }}>
                        {readiness.verdict === 'ready' ? '✓' : readiness.verdict === 'almost-ready' ? '⚠' : readiness.verdict === 'not-ready' ? '✗' : '—'}
                      </span>
                      <span className="text-sm font-medium" style={{ color: verdictText }}>{verdictLabel}</span>
                    </div>
                    <div className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {readiness.okCount} {t('readiness.okCount')}
                      {' · '}
                      {readiness.warnCount} {t('readiness.warnCount')}
                      {' · '}
                      {readiness.errorCount} {t('readiness.errCount')}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {tr('暂无就绪数据。', 'No readiness data available.')}
                  </p>
                )}
              </section>
            </div>

            {/* VERIFIED ≠ ACCEPTED / PROCESS_BOUNDARY_ONLY disclosure */}
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {tr(
                '验证通过 (VERIFIED) 不等于验收通过 (ACCEPTED)。验证执行仅为进程边界隔离 (PROCESS_BOUNDARY_ONLY)，并非操作系统级沙箱。',
                'A VERIFIED verdict is not acceptance. Verification execution is PROCESS_BOUNDARY_ONLY, not an OS-level sandbox.'
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
