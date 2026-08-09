import { useState, useEffect, useRef } from 'react'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import { useLocale } from '../../contexts/LocaleContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useDensity } from '../../contexts/DensityContext'
import DiagnosticsPanel from './DiagnosticsPanel'

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${String(mins).padStart(2, '0')}:${String(remainSecs).padStart(2, '0')}`
}

interface IntegrityResult {
  results: Array<{ file: string; status: 'ok' | 'missing' | 'empty'; size: number }>
  summary: { total: number; ok: number; missing: number; empty: number }
}
interface ClaudeDetectResult {
  paths: Array<{ path: string; exists: boolean }>
  foundPath: string | null; version: string | null; found: boolean
}
type Section = 'api' | 'language' | 'appearance' | 'integrity' | 'claude' | 'diagnostics' | 'share' | 'about'

const PROVIDERS = [
  { id: '', url: '', models: ['default'] },
  { id: 'DeepSeek', url: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'OpenAI', url: 'https://api.openai.com', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'Anthropic', url: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-3.5-sonnet', 'claude-3-haiku'] },
  { id: 'OpenRouter', url: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.0-flash'] },
  { id: 'custom', url: '', models: ['custom'] }
]

export default function SettingsEditor() {
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const { density, setDensity } = useDensity()
  const [activeSection, setActiveSection] = useState<Section>('api')
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<string | null>(null)
  const [detectResult, setDetectResult] = useState<ClaudeDetectResult | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [diagReport, setDiagReport] = useState<DiagnosticReport | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)
  const diagInFlightRef = useRef(false)
  const handleDiagRun = async () => {
    if (diagInFlightRef.current) return
    diagInFlightRef.current = true
    setDiagLoading(true)
    setDiagReport(null)
    setDiagError(null)
    try {
      const [report] = await Promise.all([
        window.api.diagnostics.run(),
        new Promise<void>(resolveDelay => setTimeout(resolveDelay, 200))
      ])
      setDiagReport(report)
    }
    catch (err) { setDiagError(t('diag.failed') + ': ' + (err instanceof Error ? err.message : t('common.unknownError'))) }
    finally { diagInFlightRef.current = false; setDiagLoading(false) }
  }
  const [packaging, setPackaging] = useState(false)
  const [packageResult, setPackageResult] = useState<{ success: boolean; path?: string; sizeMB?: string; error?: string; securityScan?: { passed: boolean; message: string } } | null>(null)
  const [packageProgress, setPackageProgress] = useState<{ stage: string; label: string; elapsedMs: number; etaLabel: string; percent?: number } | null>(null)
  const [packageNotify, setPackageNotify] = useState<'success' | 'error' | null>(null)
  const [isNotifyDismissing, setIsNotifyDismissing] = useState(false)
  const [isNotifyVisible, setIsNotifyVisible] = useState(false)
  const notifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notifyEnterFrameRef = useRef<number | null>(null)

  // API config state
  const [provider, setProvider] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyPrefix, setApiKeyPrefix] = useState('')
  const [apiKeyRef, setApiKeyRef] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [hasLegacyKey, setHasLegacyKey] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState('default')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null)
  const [balance, setBalance] = useState<Record<string, unknown> | null>(null)
  const [querying, setQuerying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Runtime / safe mode state
  const [runtimeState, setRuntimeState] = useState<Record<string, unknown> | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<Record<string, unknown> | null>(null)

  // Runtime Provider state
  const [runtimeProviderStatus, setRuntimeProviderStatus] = useState<{ mode: string; name?: string; sanitizedHost?: string } | null>(null)
  const [settingProvider, setSettingProvider] = useState(false)
  const [clearingProvider, setClearingProvider] = useState(false)
  const [providerSetResult, setProviderSetResult] = useState<{ success: boolean; message?: string } | null>(null)

  useEffect(() => {
    window.api.api.loadConfig().then(cfg => {
      const normalizedProvider = cfg.provider === '自定义' ? 'custom' : cfg.provider
      setProvider(normalizedProvider)
      setBaseUrl(cfg.baseUrl)
      setApiKeyPrefix(cfg.apiKeyPrefix)
      setApiKeyRef(cfg.apiKeyRef)
      setHasKey(cfg.hasKey)
      setHasLegacyKey(cfg.hasLegacyKey)
      // Don't set full apiKey into long-term state — only prefix is displayed
      const p = PROVIDERS.find(p => p.id === normalizedProvider)
      if (p && p.models.length > 0) setSelectedModel(p.models[0])
    })
  }, [])

  useEffect(() => { window.api.runtime.getStatus().then(s => setRuntimeProviderStatus(s)).catch(() => {}) }, [])

  const handleProviderChange = (id: string) => {
    setProvider(id)
    const p = PROVIDERS.find(x => x.id === id)
    if (p) {
      if (p.url) setBaseUrl(p.url)
      if (p.models.length > 0) setSelectedModel(p.models[0])
    }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setTestSuccess(null)
    try {
      const r = apiKey
        ? await window.api.api.testConnection(baseUrl, apiKey)
        : await window.api.api.testConnection(baseUrl, undefined, apiKeyRef)
      setTestResult(t(r.success ? 'settings.apiConnectionSuccess' : 'settings.apiConnectionFailed')); setTestSuccess(r.success)
    } catch (err) {
      setTestResult(t('settings.apiConnectionFailed')); setTestSuccess(false)
    } finally { setTesting(false) }
  }

  const handleQueryBalance = async () => {
    setQuerying(true); setBalance(null)
    try {
      const r = await window.api.api.queryBalance(baseUrl, apiKey, provider)
      setBalance(r as Record<string, unknown>)
    } catch {} finally { setQuerying(false) }
  }

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      const saveKey = (editingKey || !hasKey) ? apiKey : undefined
      const r = await window.api.api.saveConfig({ provider, baseUrl, apiKey: saveKey })
      if (r.success) {
        const cfg = await window.api.api.loadConfig()
        setApiKeyPrefix(cfg.apiKeyPrefix); setApiKeyRef(cfg.apiKeyRef)
        setHasKey(cfg.hasKey); setHasLegacyKey(cfg.hasLegacyKey)
        setApiKey(''); setEditingKey(false)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }
    } catch {} finally { setSaving(false) }
  }

  const handleGetRuntimeProviderStatus = async () => {
    try { setRuntimeProviderStatus(await window.api.runtime.getStatus()) } catch {}
  }

  const handleSetRuntimeProvider = async () => {
    if (!apiKeyRef || !baseUrl) return
    setSettingProvider(true); setProviderSetResult(null)
    try {
      const r = await window.api.runtime.setProvider({ apiKeyRef, baseUrl, name: provider || t('settings.api'), providerType: provider || undefined })
      setProviderSetResult(r)
      if (r.success) setRuntimeProviderStatus(r.status || null)
    } catch { setProviderSetResult({ success: false, message: t('settings.apiRuntimeEnableFailed') })
    } finally { setSettingProvider(false) }
  }

  const handleClearRuntimeProvider = async () => {
    setClearingProvider(true); setProviderSetResult(null)
    try {
      const r = await window.api.runtime.clearProvider()
      setProviderSetResult(r)
      if (r.success) setRuntimeProviderStatus(r.status || null)
    } catch { setProviderSetResult({ success: false, message: t('settings.apiRuntimeRestoreFailed') })
    } finally { setClearingProvider(false) }
  }

  const handleGetRuntimeState = async () => {
    try {
      const r = await window.api.model.getRuntimeState()
      setRuntimeState(r as Record<string, unknown>)
    } catch {}
  }

  const handleResetSafeMode = async () => {
    setResetting(true); setResetResult(null)
    try {
      const r = await window.api.model.resetSafeMode()
      setResetResult(r as Record<string, unknown>)
      const state = await window.api.model.getRuntimeState()
      setRuntimeState(state as Record<string, unknown>)
    } catch {} finally { setResetting(false) }
  }

  const handleCheck = async () => {
    setChecking(true); setIntegrity(null); setRepairResult(null)
    try {
      const result = await window.api.maintenance.integrityCheck()
      setIntegrity(result)
    } catch { alert(t('settings.integrityCheckFailed'))
    } finally { setChecking(false) }
  }

  const handleRepair = async () => {
    setRepairing(true); setRepairResult(null)
    try {
      const result = await window.api.maintenance.integrityRepair()
      setRepairResult(t('settings.repairCompleted').replace('{count}', String(result.count)))
      const checkResult = await window.api.maintenance.integrityCheck()
      setIntegrity(checkResult)
    } catch { setRepairResult(t('settings.repairFailed'))
    } finally { setRepairing(false) }
  }

  const packageStartRef = useRef<number>(0)

  // Live elapsed timer — ticks every second while packaging
  useEffect(() => {
    if (!packaging) return
    packageStartRef.current = Date.now()
    const timer = setInterval(() => {
      setPackageProgress((prev) => {
        if (!prev) return null
        const elapsed = Date.now() - packageStartRef.current
        return { ...prev, elapsedMs: Math.max(elapsed, prev.elapsedMs) }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [packaging])

  const dismissNotify = (jumpToShare: boolean) => {
    if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current)
    if (jumpToShare) setActiveSection('share')
    setIsNotifyDismissing(true)
    notifyTimeoutRef.current = setTimeout(() => {
      setPackageNotify(null)
      setIsNotifyDismissing(false)
      notifyTimeoutRef.current = null
    }, 200)
  }

  useEffect(() => {
    return () => {
      if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current)
      if (notifyEnterFrameRef.current !== null) cancelAnimationFrame(notifyEnterFrameRef.current)
    }
  }, [])

  // Enter animation trigger — mount hidden, then flip to visible
  useEffect(() => {
    if (!packageNotify) {
      setIsNotifyVisible(false)
      return
    }
    setIsNotifyVisible(false)
    if (notifyEnterFrameRef.current !== null) cancelAnimationFrame(notifyEnterFrameRef.current)
    notifyEnterFrameRef.current = requestAnimationFrame(() => {
      setIsNotifyVisible(true)
      notifyEnterFrameRef.current = null
    })
    return () => {
      if (notifyEnterFrameRef.current !== null) {
        cancelAnimationFrame(notifyEnterFrameRef.current)
        notifyEnterFrameRef.current = null
      }
    }
  }, [packageNotify])

  const handlePackage = async () => {
    // Map server-generated share progress labels to locale-aware strings
    const translateShareProgress = (p: { stage: string; label: string; elapsedMs: number; etaLabel?: string; percent?: number }) => {
      const { stage, label } = p
      // Extract count for copy-deps: "复制运行依赖 (10)..." → 10
      const countMatch = label.match(/\((\d+)\)/)
      const count = countMatch ? parseInt(countMatch[1], 10) : undefined
      const localeLabel = (() => {
        switch (stage) {
          case 'cleanup': return count !== undefined ? t('share.stageCleanup') : t('share.stageCleanupFiles')
          case 'prepare': return t('share.stagePrepare')
          case 'copy-out': return t('share.stageCopyOut')
          case 'copy-deps': return count !== undefined ? t('share.stageCopyDepsCount').replace('{count}', String(count)) : t('share.stageCopyDeps')
          case 'scan': return t('share.stageScan')
          case 'compress': return t('share.stageCompress')
          case 'done': return t('share.stageDone')
          case 'failed': return t('share.stageFailed')
          default: return label
        }
      })()
      setPackageProgress({ stage, label: localeLabel, elapsedMs: p.elapsedMs, etaLabel: localeLabel, percent: p.percent })
    }

    setPackaging(true); setPackageResult(null); setPackageNotify(null); setIsNotifyDismissing(false)
    if (notifyTimeoutRef.current) { clearTimeout(notifyTimeoutRef.current); notifyTimeoutRef.current = null }
    if (notifyEnterFrameRef.current !== null) { cancelAnimationFrame(notifyEnterFrameRef.current); notifyEnterFrameRef.current = null }
    setIsNotifyVisible(false); setIsNotifyDismissing(false)
    setPackageProgress({ stage: 'prepare', label: t('share.stagePrepare'), elapsedMs: 0, etaLabel: t('share.stagePrepare'), percent: 0 })
    const unsub = window.api.package.onProgress((p) => translateShareProgress(p))
    let result: { success: boolean; path?: string; sizeMB?: string; error?: string; securityScan?: { passed: boolean; message: string } } | null = null
    try {
      const created = await window.api.package.createShareZip()
      result = created
      setPackageResult(created)
    } catch (err) {
      const errorResult = { success: false, error: err instanceof Error ? err.message : t('settings.shareFailed') }
      result = errorResult
      setPackageResult(errorResult)
    } finally {
      unsub()
      setPackaging(false)
      if (result) {
        setPackageNotify(result.success ? 'success' : 'error')
      }
    }
  }

  const handleDetect = async () => {
    setDetecting(true); setDetectResult(null)
    try {
      const result = await window.api.maintenance.detectClaude()
      setDetectResult(result)
    } catch { alert(t('settings.detectFailed'))
    } finally { setDetecting(false) }
  }

  const navItem = (section: Section, label: string, icon: string) => (
    <button onClick={() => setActiveSection(section)}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left"
      style={{ background: activeSection === section ? 'var(--bg-hover)' : 'transparent',
        color: activeSection === section ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: activeSection === section ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    border: '1px solid var(--border-color)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '12px', outline: 'none',
    width: '100%', fontFamily: 'monospace'
  }
  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }

  return (
    <div className="h-full flex">
      <div style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }} className="w-48 p-3 flex flex-col gap-1">
        <h2 className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{t('settings.title')}</h2>
        {navItem('api', t('settings.api'), '🔑')}
        {navItem('language', t('settings.language'), '🌐')}
        {navItem('appearance', t('settings.appearance'), '🎨')}
        {navItem('integrity', t('settings.integrity'), '🔍')}
        {navItem('claude', t('settings.claude'), '🤖')}
        {navItem('diagnostics', t('settings.diagnostics'), '🔬')}
        {navItem('share', t('settings.share'), '📦')}
        {navItem('about', t('settings.about'), 'ℹ️')}
      </div>

      <div className="flex-1 overflow-auto p-6" style={{ background: 'var(--bg-primary)' }}>
        {/* ─── Package Completion Notification ─── */}
        {packageNotify && (
          <div onClick={() => dismissNotify(true)}
            className={`cursor-pointer text-xs rounded-lg p-3 border mb-4 transition-all duration-200 ease-out ${
              isNotifyVisible && !isNotifyDismissing ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
            }`}
            style={{ background: packageNotify === 'success' ? '#065f46' : '#7f1d1d',
                     borderColor: packageNotify === 'success' ? '#059669' : '#dc2626',
                     color: packageNotify === 'success' ? '#6ee7b7' : '#fca5a5' }}>
            <div className="flex items-center justify-between">
              <span>{packageNotify === 'success' ? t('settings.shareNotifySuccess') : t('settings.shareNotifyFailed')}</span>
              <div className="flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); dismissNotify(true) }}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'currentColor', opacity: 0.9 }}>
                  {t('common.view')}
                </button>
                <button onClick={(e) => { e.stopPropagation(); dismissNotify(false) }}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'currentColor', opacity: 0.9 }}>
                  {t('common.gotIt')}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ─── API Config ─── */}
        {activeSection === 'api' && (
          <div className="max-w-xl space-y-5">
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{'\u{1F511}'} {t('settings.api')}</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t('settings.apiDesc')}</p>
            </div>

            {/* Provider select */}
            <div>
              <div style={labelStyle}>{t('settings.apiProvider')}</div>
              <div className="flex flex-wrap gap-2">
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => handleProviderChange(p.id)}
                    className="px-3 py-1.5 text-xs rounded-md border transition-colors"
                    style={{ background: provider === p.id ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: provider === p.id ? 'white' : 'var(--text-primary)',
                      borderColor: provider === p.id ? 'var(--accent)' : 'var(--border-color)' }}>
                    {p.id === 'custom' ? t('settings.apiCustom') : p.id || t('settings.apiRuntimeDefault')}
                  </button>
                ))}
              </div>
            </div>

            {/* Base URL */}
            <div>
              <div style={labelStyle}>{t('settings.apiBaseUrl')}</div>
              <input style={inputStyle} value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1" />
            </div>

            {/* API Key */}
            <div>
              <div style={labelStyle}>{t('settings.apiKeyLabel')}</div>
              {hasLegacyKey && (
                <div className="text-xs rounded-lg p-2 mb-2 border"
                  style={{ background: '#78350f', borderColor: '#d97706', color: '#fde68a' }}>
                  {t('settings.apiKeyLegacyWarn')}
                </div>
              )}
              <div className="flex gap-2">
                {editingKey || !hasKey ? (
                  <input style={inputStyle} type="password" value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="••••••••" />
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <input style={{...inputStyle, opacity: 0.6}} type="text"
                      value={apiKeyPrefix} disabled />
                    <button onClick={() => { setEditingKey(true); setApiKey('') }}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t('settings.apiKeyEdit')}</button>
                  </div>
                )}
              </div>
            </div>

            {/* Model select */}
            <div>
              <div style={labelStyle}>{t('settings.apiModel')}</div>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                {PROVIDERS.find(p => p.id === provider)?.models.map(m => (
                  <option key={m} value={m}>{m === 'default' ? t('settings.apiModelDefault') : m}</option>
                ))}
              </select>
            </div>

            {/* Test & Save buttons */}
            <div className="flex items-center gap-3">
              <button onClick={handleTest} disabled={testing || !apiKey && (editingKey || !hasKey)}
                className="btn text-xs" style={{ background: 'var(--accent)', color: 'white', opacity: !apiKey && (editingKey || !hasKey) ? 0.5 : 1 }}>
                {testing ? t('settings.apiTesting') : t('settings.apiTestConn')}
              </button>
              <button onClick={handleQueryBalance} disabled={querying || !apiKey}
                className="btn text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                {querying ? t('settings.apiQuerying') : t('settings.apiQueryBalance')}
              </button>
              <button onClick={handleSave} disabled={saving}
                className="btn text-xs" style={{ background: '#059669', color: 'white' }}>
                {saving ? t('settings.apiSaving') : t('settings.apiSaveConfig')}
              </button>
              {saved && <span className="text-xs text-green-500">{t('settings.apiSaved')}</span>}
            </div>

            {/* Test result */}
            {testResult && (
              <div className="text-xs rounded-lg p-3 border"
                style={{ background: testSuccess ? '#065f46' : '#7f1d1d',
                  borderColor: testSuccess ? '#059669' : '#dc2626', color: testSuccess ? '#6ee7b7' : '#fca5a5' }}>
                {testSuccess ? '✅ ' : '❌ '}{testResult}
              </div>
            )}

            {/* Balance result */}
            {balance && (
              <div className="rounded-lg p-4 border space-y-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.apiBalanceTitle')}</div>
                {balance.balance !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.apiBalanceRemaining')}</span>
                    <span className="font-mono font-bold text-green-400">
                      {typeof balance.balance === 'number' ? Number(balance.balance).toFixed(2) : String(balance.balance)}
                      {balance.currency ? ` ${balance.currency}` : ''}
                    </span>
                  </div>
                )}
                {balance.total !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.apiBalanceTotal')}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {typeof balance.total === 'number' ? Number(balance.total).toFixed(2) : String(balance.total)}
                    </span>
                  </div>
                )}
                {balance.message !== undefined && balance.message !== null && (
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t(balance.success === false ? 'settings.apiBalanceFailed' : 'settings.apiBalanceUnavailable')}</div>
                )}
              </div>
            )}

            {/* ─── Runtime Provider ─── */}
            <div className="rounded-lg p-4 border space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.apiRuntimeTitle')}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t('settings.apiRuntimeDesc')}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className={(!runtimeProviderStatus || runtimeProviderStatus.mode === 'default') ? 'text-green-500' : 'text-yellow-500'}>
                  {(!runtimeProviderStatus || runtimeProviderStatus.mode === 'default') ? '✅' : '⚠️'}
                </span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {!runtimeProviderStatus || runtimeProviderStatus.mode === 'default'
                    ? t('settings.apiRuntimeDefault')
                    : `Custom: ${runtimeProviderStatus.name || ''}${runtimeProviderStatus.sanitizedHost ? ' / ' + runtimeProviderStatus.sanitizedHost : ''}`}
                </span>
                <button onClick={handleGetRuntimeProviderStatus} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}>{t('settings.apiRuntimeRefresh')}</button>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSetRuntimeProvider}
                  disabled={!hasKey || !apiKeyRef || !baseUrl || hasLegacyKey || settingProvider}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ background: runtimeProviderStatus?.mode === 'custom' ? '#059669' : 'var(--accent)', color: 'white', opacity: (!hasKey || !apiKeyRef || !baseUrl || hasLegacyKey) ? 0.4 : 1 }}>
                  {settingProvider ? t('settings.apiRuntimeApplying') : t('settings.apiRuntimeEnable')}
                </button>
                <button onClick={handleClearRuntimeProvider} disabled={runtimeProviderStatus?.mode !== 'custom' || clearingProvider}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', opacity: runtimeProviderStatus?.mode !== 'custom' ? 0.4 : 1 }}>
                  {clearingProvider ? t('settings.apiRuntimeRestoring') : t('settings.apiRuntimeRestore')}
                </button>
              </div>
              {providerSetResult && (
                <div className="text-[11px]" style={{ color: providerSetResult.success ? '#6ee7b7' : '#fca5a5' }}>
                  {providerSetResult.success ? t('settings.apiRuntimeSwitched') : `❌ ${t('settings.apiRuntimeOpFailed')}`}
                </div>
              )}
            </div>

            {/* ─── Claude Runtime Safe Mode ─── */}
            <div className="rounded-lg p-4 border space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.apiSafeModeTitle')}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {t('settings.apiSafeModeDesc')}
                  </div>
                </div>
                <button onClick={handleGetRuntimeState} className="text-xs px-2 py-1 rounded"
                  style={{ background: 'var(--accent)', color: 'white', fontSize: '11px' }}>
                  {t('settings.apiSafeModeDetect')}
                </button>
              </div>

              {runtimeState && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={runtimeState.isDefault ? 'text-green-500' : 'text-red-500'}>
                      {runtimeState.isDefault ? '✅' : '⚠️'}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {runtimeState.isDefault ? t('settings.apiSafeModeClean') : t('settings.apiSafeModePolluted')}
                    </span>
                  </div>
                  <div className="ml-5 space-y-0.5 text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    <div>ANTHROPIC_BASE_URL: {String(runtimeState.hasBaseUrl)}</div>
                    <div>ANTHROPIC_AUTH_TOKEN: {String(runtimeState.hasAuthToken)}</div>
                    <div>ANTHROPIC_API_KEY: {String(runtimeState.hasApiKey)}</div>
                    <div>ANTHROPIC_MODEL: {String(runtimeState.hasModel)}</div>
                    <div>api_provider: {String(runtimeState.apiProvider || t('common.none'))}</div>
                  </div>

                  {!runtimeState.isDefault && (
                    <div className="mt-3">
                      <button onClick={handleResetSafeMode} disabled={resetting}
                        className="btn text-xs" style={{ background: '#dc2626', color: 'white', opacity: resetting ? 0.5 : 1 }}>
                        {resetting ? t('settings.apiSafeModeResetting') : t('settings.apiSafeModeReset')}
                      </button>
                    </div>
                  )}

                  {resetResult && Boolean(resetResult.success) && (
                    <div className="rounded p-3 text-xs border" style={{ background: '#065f46', borderColor: '#059669', color: '#6ee7b7' }}>
                      <div className="font-medium mb-1">{t('settings.apiSafeModeRestored')}</div>
                      <div className="text-[10px] space-y-0.5" style={{ color: '#6ee7b7' }}>
                        <div>{t('settings.apiSafeModeRemoved')}: {String((resetResult.removed as string[])?.join(', ') || t('common.none'))}</div>
                        <div>{t('settings.apiSafeModeBackup')}: {String(resetResult.backupName)}</div>
                        <div className="mt-1 text-yellow-300">{t('settings.apiSafeModeRestartHint')}</div>
                      </div>
                    </div>
                  )}
                  {resetResult && !resetResult.success && (
                    <div className="rounded p-3 text-xs" style={{ background: '#7f1d1d', borderColor: '#dc2626', color: '#fca5a5' }}>
                      ❌ {t('settings.apiSafeModeRestoreFailed')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Language ─── */}
        {activeSection === 'language' && (
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('settings.languageDesc')}</p>
            <div className="flex gap-3">
              <button onClick={() => setLocale('zh')}
                className="flex-1 p-4 rounded-lg border text-xs transition-colors"
                style={{ background: locale === 'zh' ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  borderColor: locale === 'zh' ? 'var(--accent)' : 'var(--border-color)', color: 'var(--text-primary)' }}>
                <div className="text-lg mb-1">🇨🇳</div>
                <div className="font-medium">{t('settings.chinese')}</div>
              </button>
              <button onClick={() => setLocale('en')}
                className="flex-1 p-4 rounded-lg border text-xs transition-colors"
                style={{ background: locale === 'en' ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  borderColor: locale === 'en' ? 'var(--accent)' : 'var(--border-color)', color: 'var(--text-primary)' }}>
                <div className="text-lg mb-1">🇺🇸</div>
                <div className="font-medium">{t('settings.english')}</div>
              </button>
            </div>
          </div>
        )}

        {/* ─── Appearance ─── */}
        {activeSection === 'appearance' && (
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.appearance')}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('settings.appearanceDesc')}</p>
            <div className="flex gap-3">
              <button onClick={() => setTheme('dark')}
                className="flex-1 p-4 rounded-lg border text-xs transition-colors"
                style={{ background: theme === 'dark' ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  borderColor: theme === 'dark' ? 'var(--accent)' : 'var(--border-color)', color: 'var(--text-primary)' }}>
                <div className="text-lg mb-1">🌙</div>
                <div className="font-medium">{t('settings.dark')}</div>
              </button>
              <button onClick={() => setTheme('light')}
                className="flex-1 p-4 rounded-lg border text-xs transition-colors"
                style={{ background: theme === 'light' ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  borderColor: theme === 'light' ? 'var(--accent)' : 'var(--border-color)', color: 'var(--text-primary)' }}>
                <div className="text-lg mb-1">☀️</div>
                <div className="font-medium">{t('settings.light')}</div>
              </button>
            </div>

            {/* Density */}
            <div className="mt-5">
              <div style={labelStyle}>{t('settings.density')}</div>
              <div className="flex gap-3">
                {(['compact', 'standard', 'comfortable'] as const).map(d => (
                  <button key={d} onClick={() => setDensity(d)}
                    className="flex-1 p-4 rounded-lg border text-xs transition-colors"
                    style={{ background: density === d ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                      borderColor: density === d ? 'var(--accent)' : 'var(--border-color)', color: 'var(--text-primary)' }}>
                    <div className="text-lg mb-1">{d === 'compact' ? '▬' : d === 'standard' ? '▬▬' : '▬▬▬'}</div>
                    <div className="font-medium">{t(`settings.density${d.charAt(0).toUpperCase() + d.slice(1)}`)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Integrity ─── */}
        {activeSection === 'integrity' && (
          <div className="max-w-2xl">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.integrity')}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('settings.integrityDesc')}</p>
            <button onClick={handleCheck} disabled={checking} className="btn btn-primary text-xs mb-4">
              {checking ? t('settings.checking') : t('settings.startCheck')}
            </button>
            {integrity && (
              <div className="space-y-3">
                <div className="flex gap-4 text-xs">
                  <div className="rounded-lg p-3 flex-1 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <div className="text-2xl font-bold" style={{ color: theme === 'dark' ? '#4ade80' : '#16a34a' }}>{integrity.summary.ok}</div>
                    <div className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('settings.normal')}</div>
                  </div>
                  <div className="rounded-lg p-3 flex-1 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <div className="text-2xl font-bold text-red-500">{integrity.summary.missing}</div>
                    <div className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('settings.missing')}</div>
                  </div>
                </div>
                {(integrity.summary.missing > 0 || integrity.summary.empty > 0) && (
                  <div><button onClick={handleRepair} disabled={repairing} className="btn text-xs" style={{ background: '#d97706', color: 'white' }}>
                    {repairing ? t('settings.repairing') : t('settings.repair')}</button>
                    {repairResult && <div className="text-xs mt-2" style={{ color: theme === 'dark' ? '#4ade80' : '#16a34a' }}>{repairResult}</div>}
                  </div>
                )}
                {integrity.summary.missing === 0 && integrity.summary.empty === 0 && (
                  <div className="text-xs rounded-lg p-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: theme === 'dark' ? '#4ade80' : '#16a34a' }}>
                    {t('settings.allGood')}
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>{t('settings.viewDetails')} ({integrity.results.length} {t('common.files')})</summary>
                  <div className="mt-2 max-h-60 overflow-y-auto space-y-0.5">
                    {integrity.results.map(r => (
                      <div key={r.file} className="flex items-center gap-2 text-[10px] font-mono">
                        <span className={r.status === 'ok' ? 'text-green-500' : 'text-red-500'}>{r.status === 'ok' ? '✓' : '✗'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{r.file}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {/* ─── Claude Detection ─── */}
        {activeSection === 'claude' && (
          <div className="max-w-2xl">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.claude')}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('settings.claudeDesc')}</p>
            <button onClick={handleDetect} disabled={detecting} className="btn btn-primary text-xs mb-4">
              {detecting ? t('settings.detecting') : t('settings.detect')}
            </button>
            {detectResult && (
              <div className="space-y-3">
                {detectResult.found ? (
                  <div className="rounded-lg p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <div className="text-xs font-medium mb-1" style={{ color: theme === 'dark' ? '#4ade80' : '#16a34a' }}>✅ {t('settings.claudeFound')}</div>
                    <div className="text-[11px] font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{(detectResult.foundPath || '').replace(/\\/g, '/').split('/').pop() || 'claude'}</div>
                    {detectResult.version && <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('common.version')}: {detectResult.version}</div>}
                  </div>
                ) : (
                  <div className="rounded-lg p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <div className="text-xs font-medium mb-1" style={{ color: '#f59e0b' }}>⚠️ {t('settings.claudeNotFound')}</div>
                    <div className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>{t('settings.claudeInstallHint')}</div>
                    <div className="rounded p-2 font-mono text-[11px]" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>npm install -g @anthropic-ai/claude-code</div>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>{t('settings.viewPaths')}</summary>
                  <div className="mt-2 space-y-1">
                    {detectResult.paths.map(p => (
                      <div key={p.path} className="flex items-center gap-2 text-[10px] font-mono">
                        <span className={p.exists ? 'text-green-500' : ''}>{p.exists ? '✓' : '○'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{(p.path || '').replace(/\\/g, '/').split('/').pop() || 'path'}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {/* ─── Share ─── */}
        {activeSection === 'share' && (
          <div className="max-w-xl">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{'\u{1F4E6}'} {t('settings.share')}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('settings.shareDesc')}</p>

            <div className="rounded-lg border p-4 mb-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="text-[11px] space-y-2" style={{ color: 'var(--text-secondary)' }}>
                <div>{t('settings.shareExcluded')}</div>
                <div>{t('settings.shareIncluded')}</div>
                <div>{t('settings.shareRecipient')}</div>
              </div>
            </div>

            {packaging && packageProgress && (
              <div className="rounded-lg border p-3 mb-4 text-xs space-y-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.shareStatus')}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{packageProgress.label}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.shareElapsed')}</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatElapsed(packageProgress.elapsedMs)}</span>
                </div>
              </div>
            )}

            <button onClick={handlePackage} disabled={packaging}
              className="btn text-xs" style={{ background: 'var(--accent)', color: 'white' }}>
              {packaging ? t('settings.sharePackaging') : t('settings.shareCreate')}
            </button>

            {packageResult && (
              <div className="mt-4 space-y-3">
                {packageResult.success ? (
                  <>
                    <div className="text-xs rounded-lg p-3 border" style={{ background: '#065f46', borderColor: '#059669', color: '#6ee7b7' }}>
                      {t('settings.shareSuccess')}
                    </div>
                    <div className="rounded-lg border p-3 text-xs space-y-1" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.shareLocation')}</span>
                        <span className="font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>{(packageResult.path || '').replace(/\\/g, '/').split('/').pop() || 'package'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-tertiary)' }}>{t('settings.shareSize')}</span>
                        <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{packageResult.sizeMB} MB</span>
                      </div>
                    </div>
                    {packageResult.securityScan && (
                      <div className={`text-xs rounded-lg p-3 border ${packageResult.securityScan.passed ? 'text-green-400 bg-green-900/20 border-green-800/50' : 'text-red-400 bg-red-900/20 border-red-800/50'}`}>
                        {t(packageResult.securityScan.passed ? 'settings.shareSecurityPassed' : 'settings.shareSecurityFailed')}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs rounded-lg p-3 border" style={{ background: '#7f1d1d', borderColor: '#dc2626', color: '#fca5a5' }}>
                    {t('settings.shareFailed')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Environment Diagnostics ─── */}
        {activeSection === 'diagnostics' && <DiagnosticsPanel report={diagReport} loading={diagLoading} error={diagError} onRun={handleDiagRun} />}

        {/* ─── About ─── */}
        {activeSection === 'about' && (
          <div className="max-w-2xl">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.about')}</h3>
            <div className="rounded-lg border p-4 space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">⚡</span>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Agent Workbench</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t('app.version')} 0.1.0</div>
                </div>
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('settings.aboutDesc')}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t('app.techStack')}: Electron · React · TypeScript · xterm.js · node-pty</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
