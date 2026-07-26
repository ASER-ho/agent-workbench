import { useState, useEffect } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useLocale } from '../../contexts/LocaleContext'

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function StatusBar() {
  const { t } = useLocale()
  const { root } = useWorkspace()
  // Display-safe workspace label: basename only, never full path
  const workspaceDisplayLabel = root
    ? (root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Workspace')
    : 'Workspace'
  const launchTime = useState(() => Date.now())[0]
  const [time, setTime] = useState(new Date())
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
      setUptime(Math.floor((Date.now() - launchTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [launchTime])

  const hours = time.getHours().toString().padStart(2, '0')
  const mins = time.getMinutes().toString().padStart(2, '0')

  return (
    <div className="status-bar">
      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: '11px' }}>
          {hours}:{mins}
        </span>
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{workspaceDisplayLabel}</span>
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <span style={{ color: 'var(--text-tertiary)' }}>Agent Workbench v0.1</span>
      </div>
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
          {formatUptime(uptime)}
        </span>
        <span className="text-green-600">●</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{t('status.connected')}</span>
      </div>
    </div>
  )
}
