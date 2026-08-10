// Shared inline style tokens for the 0.1.2-B Verification Workbench.
// Uses the 0.1.2-A graphite + indigo design tokens (globals.css) so theme and
// density switching work automatically. Cards are used sparingly — the surface
// prefers Main Work Surface / Structured Sections / List / Table / Inline Status.

import type { CSSProperties } from 'react'

export const surface: CSSProperties = { background: 'var(--surface)' }
export const surface2: CSSProperties = { background: 'var(--surface-2)' }
export const ink: CSSProperties = { color: 'var(--ink)' }
export const ink2: CSSProperties = { color: 'var(--ink-2)' }
export const ink3: CSSProperties = { color: 'var(--ink-3)' }
export const accentText: CSSProperties = { color: 'var(--indigo)' }
export const verifiedText: CSSProperties = { color: 'var(--verified)' }
export const failedText: CSSProperties = { color: 'var(--failed)' }
export const warnText: CSSProperties = { color: 'var(--warn)' }

export const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 14,
  padding: '7px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box'
}

export const inputErrorStyle: CSSProperties = {
  ...inputStyle,
  border: '1px solid var(--failed)'
}

export const controlBtn: CSSProperties = {
  height: 'var(--control-h)',
  borderRadius: 'var(--radius)'
}

export const mono: CSSProperties = {
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
}
