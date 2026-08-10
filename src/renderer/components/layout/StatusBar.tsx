import { useState, useEffect } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useLocale } from '../../contexts/LocaleContext'

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

/**
 * Status Bar — only continuously valuable, context-relevant state is kept:
 *   workspace label · local time · session time.
 * The short HH:MM clock (redundant with the full local time), the static
 * version string (covered by the TopBar brand), the launch uptime (redundant
 * with the session timer), and the legacy "connected" dot (no real connection
 * concept in the 0.1.2 surface) were removed to cut noise.
 */
export default function StatusBar() {
  const { t } = useLocale()
  const { root } = useWorkspace()
  // Display-safe workspace label: basename only, never full path
  const workspaceDisplayLabel = root
    ? (root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Workspace')
    : 'Workspace'
  // Session start is captured once via lazy initializer so it never resets on re-render.
  const sessionStart = useState(() => Date.now())[0]
  const [now, setNow] = useState(() => new Date())
  const [sessionElapsed, setSessionElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now()
      setNow(new Date(nowMs))
      // Clamp with Math.max so the session timer never decreases, even across clock adjustments.
      setSessionElapsed(prev => Math.max(prev, Math.floor((nowMs - sessionStart) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionStart])

  return (
    <div className="status-bar">
      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--text-tertiary)' }}>{workspaceDisplayLabel}</span>
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
      </div>
    </div>
  )
}
