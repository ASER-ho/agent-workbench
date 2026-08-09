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

function formatSessionTime(totalSeconds: number): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export default function StatusBar() {
  const { t } = useLocale()
  const { root } = useWorkspace()
  // Display-safe workspace label: basename only, never full path
  const workspaceDisplayLabel = root
    ? (root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Workspace')
    : 'Workspace'
  const launchTime = useState(() => Date.now())[0]
  // Session start is captured once via lazy initializer so it never resets on re-render.
  const sessionStart = useState(() => Date.now())[0]
  const [now, setNow] = useState(() => new Date())
  const [uptime, setUptime] = useState(0)
  const [sessionElapsed, setSessionElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now()
      setNow(new Date(nowMs))
      setUptime(Math.floor((nowMs - launchTime) / 1000))
      // Clamp with Math.max so the session timer never decreases, even across clock adjustments.
      setSessionElapsed(prev => Math.max(prev, Math.floor((nowMs - sessionStart) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [launchTime, sessionStart])

  const hours = now.getHours().toString().padStart(2, '0')
  const mins = now.getMinutes().toString().padStart(2, '0')

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
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <span
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'monospace',
            fontSize: '11px',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {t('status.localTime')} {formatLocalDateTime(now)}
        </span>
        <span style={{ color: 'var(--border-color)' }}>|</span>
        <span
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'monospace',
            fontSize: '11px',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {t('status.sessionTime')} {formatSessionTime(sessionElapsed)}
        </span>
        <span className="text-green-600">●</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{t('status.connected')}</span>
      </div>
    </div>
  )
}
