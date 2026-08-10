import { useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useDensity } from '../../contexts/DensityContext'

interface IntegrityResult {
  results: Array<{ file: string; status: 'ok' | 'missing' | 'empty'; size: number }>
  summary: { total: number; ok: number; missing: number; empty: number }
}
type Section = 'appearance' | 'language' | 'integrity' | 'about'

export default function SettingsEditor() {
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const { density, setDensity } = useDensity()
  const [activeSection, setActiveSection] = useState<Section>('appearance')
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<string | null>(null)

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

  const navItem = (section: Section, label: string, icon: string) => (
    <button onClick={() => setActiveSection(section)}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left"
      style={{ background: activeSection === section ? 'var(--bg-hover)' : 'transparent',
        color: activeSection === section ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: activeSection === section ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }

  return (
    <div className="h-full flex">
      <div style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }} className="w-48 p-3 flex flex-col gap-1">
        <h2 className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{t('settings.title')}</h2>
        {navItem('appearance', t('settings.appearance'), '🎨')}
        {navItem('language', t('settings.language'), '🌐')}
        {navItem('integrity', t('settings.integrity'), '🔍')}
        {navItem('about', t('settings.about'), 'ℹ️')}
      </div>

      <div className="flex-1 overflow-auto p-6" style={{ background: 'var(--bg-primary)' }}>
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
