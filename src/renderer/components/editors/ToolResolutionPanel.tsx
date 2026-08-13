import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'

interface SafeTool {
  kind: string
  found: boolean
  name: string
  version: string | null
  source: string
}

interface ToolResolution {
  node: SafeTool
  npm: SafeTool
  claude: SafeTool
}

/** Display-safe trusted tool resolution + manual override picker. */
export default function ToolResolutionPanel() {
  const { t } = useLocale()
  const [resolution, setResolution] = useState<ToolResolution | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = (await window.api.tools.getResolution()) as ToolResolution
    setResolution(r)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const pick = async (kind: 'node' | 'claude') => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tools.pick(kind)
      if (!res.ok) setError(res.error ?? 'pick failed')
      await refresh()
    } finally { setBusy(false) }
  }

  const clear = async (kind: 'node' | 'claude') => {
    await window.api.tools.clearOverride(kind)
    await refresh()
  }

  const sourceLabel = (s: string): string => {
    const map: Record<string, string> = {
      override: t('tool.source.override'),
      environment: t('tool.source.environment'),
      'standard-location': t('tool.source.standard'),
      path: t('tool.source.path'),
      'derived-from-node': t('tool.source.derived'),
      'not-found': t('tool.source.notFound')
    }
    return map[s] ?? s
  }

  const row = (label: string, tool: SafeTool, pickable: boolean, kind: 'node' | 'claude') => (
    <div className="flex items-center gap-2 text-[11px] py-1">
      <span className="w-24 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: tool.found ? 'var(--verified)' : 'var(--failed)' }} />
      <span className="truncate" style={{ color: 'var(--text-primary)' }}>
        {tool.found ? `${tool.name} ${tool.version ?? ''}` : t('tool.notFound')}
      </span>
      <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{sourceLabel(tool.source)}</span>
      {pickable && (
        <span className="ml-auto flex gap-1 shrink-0">
          <button disabled={busy} onClick={() => void pick(kind)}
            className="rounded px-2 py-0.5 text-[10px] transition-colors hover:opacity-90"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            {t('tool.select')}
          </button>
          <button disabled={busy || tool.source !== 'override'} onClick={() => void clear(kind)}
            className="rounded px-2 py-0.5 text-[10px] transition-colors hover:opacity-90"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}>
            {t('tool.clear')}
          </button>
        </span>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('tool.title')}</h3>
      <p className="text-[10px] leading-relaxed mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('tool.desc')}</p>
      {!resolution ? (
        <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t('tool.loading')}</p>
      ) : (
        <>
          {row(t('tool.node'), resolution.node, true, 'node')}
          {row(t('tool.npm'), resolution.npm, false, 'node')}
          {row(t('tool.claude'), resolution.claude, true, 'claude')}
        </>
      )}
      {error && <p className="mt-2 text-[10px]" style={{ color: 'var(--failed)' }}>{error}</p>}
    </div>
  )
}
