import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProjectCapsule as CapsuleData } from '../../../shared/capsule-types'
import { useLocale } from '../../contexts/LocaleContext'

// Patterns that look like full paths — client-side pre-check before IPC
const SUSPECT_PATH_RE = /(^[A-Za-z]:[\\/])|(^\/Users\/)|(^\/home\/)|(^\\\\[^\\]+\\\\)|(^\/[^/]+\/[^/]+\/)|(^~[\\/])|([\\/]\.\.[\\/])|(%[A-Z]+%[\\/])/

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status, label, detail }: { status: 'pass' | 'blocked' | 'unknown' | 'active'; label: string; detail?: string }) {
  const colors: Record<string, string> = {
    pass: 'bg-green-900/40 text-green-300 border-green-800/50',
    blocked: 'bg-red-900/40 text-red-300 border-red-800/50',
    unknown: 'bg-gray-800 text-gray-400 border-gray-700/50',
    active: 'bg-blue-900/40 text-blue-300 border-blue-800/50'
  }
  const icons: Record<string, string> = { pass: '✓', blocked: '✗', unknown: '—', active: '▶' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors[status] ?? colors.unknown}`} title={detail}>
      <span>{icons[status] ?? '?'}</span>
      {label}
    </span>
  )
}

function SafetyBadge({ safe, label }: { safe: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${safe ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'}`}>
      <span>{safe ? '✓' : '⚠'}</span>
      {label}
    </span>
  )
}

function CapsuleField({ label, value, onChange, placeholder, warning }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; warning?: string
}) {
  return (
    <div className="text-xs">
      <span className="text-gray-600">{label}</span>
      <input
        aria-label={label}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 mt-0.5 focus:outline-none focus:border-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
      />
      {warning && (
        <p className="text-[10px] text-yellow-400 mt-0.5">{'⚠'} {warning}</p>
      )}
    </div>
  )
}

export default function ProjectCapsule() {
  const { t } = useLocale()
  const [capsule, setCapsule] = useState<CapsuleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadSource, setLoadSource] = useState<'saved' | 'default' | 'fallback'>('default')

  const [editing, setEditing] = useState(false)
  const [editProjectName, setEditProjectName] = useState('')
  const [editWorkspaceLabel, setEditWorkspaceLabel] = useState('')
  const [editSafePathLabel, setEditSafePathLabel] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveWarning, setSaveWarning] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pathWarning = SUSPECT_PATH_RE.test(editSafePathLabel)
    ? t('capsule.locationWarning')
    : undefined
  const localizedWorkspaceLabel = capsule?.workspaceLabel === 'Current Workspace'
    ? t('sidebar.currentWorkspace')
    : capsule?.workspaceLabel

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const result = await window.api.capsule.load()
      setCapsule(result.capsule)
      setLoadSource(result.source)
      if (result.loadError) setLoadError(true)
    } catch {
      setLoadError(true)
      setLoadSource('fallback')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePickWorkspace = async () => {
    try {
      const result = await window.api.capsule.pickWorkspaceLabel()
      if (result.cancelled) return
      if (result.projectName) setEditProjectName(result.projectName)
      if (result.workspaceLabel) setEditWorkspaceLabel(result.workspaceLabel)
      if (result.safePathLabel) setEditSafePathLabel(result.safePathLabel)
    } catch { /* folder picker unavailable */ }
  }

  const startEditing = () => {
    if (!capsule) return
    setEditProjectName(capsule.projectName)
    setEditWorkspaceLabel(capsule.workspaceLabel)
    setEditSafePathLabel(capsule.safePathLabel)
    setEditNotes(capsule.notes ?? '')
    setSaveError(false)
    setSaveWarning(false)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setSaveError(false)
    setSaveWarning(false)
  }

  const handleSave = async () => {
    if (!capsule) return
    setSaving(true)
    setSaveError(false)
    setSaveWarning(false)
    setSaveSuccess(false)
    try {
      const updated: CapsuleData = { ...capsule, projectName: editProjectName, workspaceLabel: editWorkspaceLabel, safePathLabel: editSafePathLabel, notes: editNotes, updatedAt: new Date().toISOString() }
      const result = await window.api.capsule.save(updated)
      if (result.success) {
        const refreshed = await window.api.capsule.load()
        setCapsule(refreshed.capsule)
        setLoadSource(refreshed.source)
        window.dispatchEvent(new Event('agent-workbench:capsule-updated'))
        setEditing(false)
        setSaveSuccess(true)
        if (result.warning) setSaveWarning(true)
        if (successTimer.current) clearTimeout(successTimer.current)
        successTimer.current = setTimeout(() => { setSaveSuccess(false); setSaveWarning(false) }, 4000)
      } else {
        setSaveError(true)
      }
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-800 rounded w-1/2 mb-3" />
        <div className="flex gap-2">
          <div className="h-5 bg-gray-800 rounded-full w-16" />
          <div className="h-5 bg-gray-800 rounded-full w-16" />
        </div>
      </div>
    )
  }

  if (loadError && !capsule) {
    return (
      <div className="bg-gray-900/60 border border-yellow-900/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-yellow-400 text-sm">{'⚠'}</span>
          <p className="text-xs text-yellow-300">{t('capsule.loadFailed')}</p>
        </div>
        <button onClick={load} className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{t('editor.retry')}</button>
      </div>
    )
  }

  if (!capsule) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-500">{t('capsule.title')} {t('common.loading')}</p>
      </div>
    )
  }

  const { safetyState } = capsule
  const capsuleSourceLabel = loadSource === 'saved' ? t('capsule.sourceSaved') : loadSource === 'fallback' ? t('capsule.sourceFallback') : t('capsule.sourceDefault')
  const capsuleSourceIcon = loadSource === 'saved' ? '↩' : loadSource === 'fallback' ? '⚠' : '📄'
  const capsuleSourceColor = loadSource === 'saved' ? 'text-blue-400/70' : loadSource === 'fallback' ? 'text-yellow-400/70' : 'text-gray-500'

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{'📦'}</span>
          <h3 className="text-sm font-semibold text-gray-200">{t('capsule.title')}</h3>
          <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{t('capsule.mvp')}</span>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && <span className="text-[10px] text-green-400 animate-pulse">{t('capsule.saved')}</span>}
          {!editing && (
            <button onClick={startEditing} className="text-[10px] text-indigo-400 hover:text-indigo-300">{t('capsule.editCapsule')}</button>
          )}
          <span className="text-[10px] text-gray-600">{formatDate(capsule.lastOpenedAt)}</span>
        </div>
      </div>

      <div className={`px-4 py-1 border-b ${loadSource === 'saved' ? 'bg-blue-950/20 border-blue-900/20' : loadSource === 'fallback' ? 'bg-yellow-950/20 border-yellow-900/20' : 'bg-gray-950/20 border-gray-800'}`}>
        <p className={`text-[10px] ${capsuleSourceColor}`}>{capsuleSourceIcon} {capsuleSourceLabel}。{t('capsule.restoreHint')}</p>
      </div>

      {loadError && (
        <div className="px-4 py-1.5 bg-yellow-950/30 border-b border-yellow-900/30">
          <p className="text-[10px] text-yellow-400">{t('capsule.loadFailed')}</p>
        </div>
      )}

      {saveWarning && (
        <div className="px-4 py-1.5 bg-yellow-950/30 border-b border-yellow-900/30">
          <p className="text-[10px] text-yellow-400">{t('capsule.pathSanitized')}</p>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {editing ? (
          <>
            <CapsuleField label={t('capsule.project')} value={editProjectName} onChange={setEditProjectName} placeholder={t('capsule.projectPlaceholder')} />
            <CapsuleField label={t('capsule.workspace')} value={editWorkspaceLabel} onChange={setEditWorkspaceLabel} placeholder={t('capsule.workspacePlaceholder')} />
            <CapsuleField label={t('capsule.location')} value={editSafePathLabel} onChange={setEditSafePathLabel} placeholder={t('capsule.locationPlaceholder')} warning={pathWarning} />
            <div className="border-t border-gray-800 pt-2">
              <button onClick={handlePickWorkspace} className="text-[10px] px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1.5">
                <span>{'📂'}</span>{t('capsule.pickFolder')}
              </button>
              <p className="text-[9px] text-gray-600 mt-1">{t('capsule.pickFolderHint')}</p>
            </div>
            <div className="text-xs">
              <span className="text-gray-600">{t('capsule.notes')}</span>
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 resize-none focus:outline-none focus:border-indigo-500 mt-0.5" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder={t('capsule.notesPlaceholder')} maxLength={2000} />
            </div>
            {saveError && <p className="text-[10px] text-red-400">{t('capsule.saveFailed')}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="text-[10px] px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors">
                {saving ? t('capsule.saving') : t('capsule.saveCapsule')}
              </button>
              <button onClick={cancelEditing} className="text-[10px] px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{t('capsule.cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-600">{t('capsule.project')}</span><p className="text-gray-300 font-medium">{capsule.projectName}</p></div>
              <div><span className="text-gray-600">{t('capsule.workspace')}</span><p className="text-gray-300 font-medium">{localizedWorkspaceLabel}</p></div>
            </div>
            <div className="text-xs"><span className="text-gray-600">{t('capsule.location')}</span><p className="text-gray-400 font-mono text-[11px]">{capsule.safePathLabel === '(not set)' ? t('capsule.notSet') : capsule.safePathLabel}</p></div>

            <div className="flex flex-wrap gap-1.5">
              <SafetyBadge safe={safetyState.secretsSafe} label={t('capsule.secretsSafe')} />
              <SafetyBadge safe={safetyState.pathsSafe} label={t('capsule.pathsSafe')} />
              <StatusBadge status={safetyState.buildStatus === 'pass' ? 'pass' : 'unknown'} label={t('capsule.build')} detail={safetyState.buildStatus === 'pass' ? t('capsule.buildVerified') : t('capsule.buildUnknown')} />
              <StatusBadge status={safetyState.packStatus === 'blocked' ? 'blocked' : safetyState.packStatus === 'pass' ? 'pass' : 'unknown'} label={safetyState.packStatus === 'blocked' ? t('capsule.packBlocked') : safetyState.packStatus === 'pass' ? t('capsule.packReady') : t('capsule.packUnknown')} detail={safetyState.packStatus === 'blocked' ? t('capsule.packToolchainHint') : undefined} />
              <StatusBadge status={safetyState.phaseStatus === 'phase-1-active' ? 'active' : 'unknown'} label={t('capsule.phaseActive')} detail={t('capsule.phaseDetail')} />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400">{t('capsule.provider')}: {t(`capsule.provider.${safetyState.providerStatus}`)}</span>
            </div>

            {safetyState.releaseBlocked && (
              <div className="border-t border-gray-800 pt-2 text-[10px] text-gray-500 space-y-0.5">
                <p className="text-yellow-400/80 font-medium">{'⚠'} {t('capsule.releaseBlocked')}</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>{t('capsule.releaseBuildAvailable')}</li>
                  {safetyState.packStatus === 'blocked' && <li>{t('capsule.releasePackBlocked')}</li>}
                  <li>{t('capsule.releaseNotBlockPhase')}</li>
                  <li>{t('capsule.releaseTagPaused')}</li>
                </ul>
              </div>
            )}

            <div className="border-t border-gray-800 pt-2">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{'🛡'} {t('capsule.summaryTitle')}</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                <div className="col-span-2 mb-0.5"><span className="text-gray-500 font-medium">{t('capsule.summaryStores')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✓'}</span><span className="text-gray-400">{t('capsule.summaryStoresLabels')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✓'}</span><span className="text-gray-400">{t('capsule.summaryStoresMeta')}</span></div>
                <div className="col-span-2 mt-1 mb-0.5"><span className="text-gray-500 font-medium">{t('capsule.summaryNotStore')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoKeys')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoPaths')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoEnv')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoSecretStore')}</span></div>
                <div className="col-span-2 mt-1 mb-0.5"><span className="text-gray-500 font-medium">{t('capsule.summaryNotDo')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoLaunch')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoSystem')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoScan')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">{'✗'}</span><span className="text-gray-500">{t('capsule.summaryNoPush')}</span></div>
                <div className="col-span-2 mt-1 mb-0.5"><span className="text-gray-500 font-medium">{t('capsule.summaryStatus')}</span></div>
                <div className="flex items-center gap-1.5"><span className={safetyState.buildStatus === 'pass' ? 'text-green-400' : 'text-gray-600'}>{safetyState.buildStatus === 'pass' ? '✓' : '—'}</span><span className="text-gray-400">{t('capsule.summaryBuildStatus')}{safetyState.buildStatus === 'pass' ? t('capsule.buildVerified') : t('capsule.buildUnknown')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-red-400">{'✗'}</span><span className="text-gray-400">{t('capsule.summaryPackStatus')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-yellow-400">{'⏸'}</span><span className="text-gray-400">{t('capsule.summaryReleaseStatus')}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-blue-400">{'▶'}</span><span className="text-gray-400">{t('capsule.summaryPhaseStatus')}</span></div>
                <div className="flex items-center gap-1.5"><span className={loadSource === 'saved' ? 'text-blue-400' : loadSource === 'fallback' ? 'text-yellow-400' : 'text-gray-600'}>{capsuleSourceIcon}</span><span className="text-gray-400">{capsuleSourceLabel}</span></div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-2">
              <span className="text-[10px] text-gray-600">{t('capsule.notes')}</span>
              <p className="text-xs text-gray-500 italic min-h-[1.5rem] mt-0.5">{capsule.notes || t('capsule.noNotes')}</p>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-2 bg-gray-950/60 border-t border-gray-800">
        <p className="text-[9px] text-gray-600 leading-relaxed">{t('capsule.footer')}</p>
      </div>
    </div>
  )
}
