import { useState, useEffect } from 'react'
import { useSidebar } from '../../contexts/SidebarContext'
import { useLocale } from '../../contexts/LocaleContext'

export default function ApiStatusWidget() {
  const { collapsed } = useSidebar()
  const { t } = useLocale()
  const [provider, setProvider] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [tokenStats, setTokenStats] = useState<{ sent: number; received: number }>({ sent: 0, received: 0 })

  useEffect(() => {
    window.api.api.loadConfig().then(cfg => {
      setProvider(cfg.provider || '-')
      setHasKey(cfg.hasKey)
    })
  }, [])

  useEffect(() => {
    const unsub = window.api.terminal.onData((data) => {
      setTokenStats(prev => ({ ...prev, received: prev.received + data.length }))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key.length === 1) {
        setTokenStats(prev => ({ ...prev, sent: prev.sent + 1 }))
      } else if (e.key === 'Enter') {
        setTokenStats(prev => ({ ...prev, sent: prev.sent + 30 }))
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const estSent = Math.round(tokenStats.sent / 4)
  const estRecv = Math.round(tokenStats.received / 4)

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1" title={`API: ${provider} (${hasKey ? t('sidebar.apiConnected') : t('sidebar.apiNoKey')})`}>
        <span className={`text-[10px] ${hasKey ? 'text-green-500' : 'text-red-400'}`}>●</span>
      </div>
    )
  }

  return (
    <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>API</span>
        <span className={`text-[10px] font-mono ${hasKey ? 'text-green-500' : 'text-red-400'}`}>
          ● {hasKey ? t('sidebar.apiConnected') : t('sidebar.apiNoKey')}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
        {estSent > 0 || estRecv > 0 ? (
          <>
            <span title={t('sidebar.tokensSent')}>↑{estSent.toLocaleString()}</span>
            <span style={{ color: 'var(--border-color)' }}>/</span>
            <span title={t('sidebar.tokensReceived')}>↓{estRecv.toLocaleString()}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>--</span>
        )}
        <span style={{ color: 'var(--border-color)', margin: '0 4px' }}>|</span>
        <span>{provider}</span>
      </div>
    </div>
  )
}
