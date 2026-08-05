// Display-safe sanitization and Markdown escaping for human-readable output.
// Pure TypeScript: no Node, fs, network, Electron, Agent, or LLM access.
//
// Two layers:
// 1. `sanitizeHandoffText` redacts secrets, credentials, and absolute paths.
// 2. `escapeMarkdownInline` escapes HTML/Markdown control characters so user
//    text cannot become active HTML, links, headings, emphasis, or code fences.
//
// This is a shared pure core so both Main-side export and the Handoff renderer
// can apply the same rules without depending on Main-only modules.

const SECRET_SHAPE_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+)/gi
const CREDENTIAL_VAR_RE = /\b(?:USERNAME|USERPROFILE|USER|COMPUTERNAME)\s*=\s*[^\s]+/gi
const WINDOWS_PATH_RE = /[A-Za-z]:[\\/][^\s]+/g
const UNC_PATH_RE = /\\\\[^\\\s]+\\[^\s]*/g
const POSIX_PATH_RE = /(^|[\s("'])\/(?:[^/\s]+\/)*[^/\s]+/gm

/** Redacts secret-shaped values, credential variables, and absolute paths. */
export function sanitizeHandoffText(input: string): string {
  return String(input ?? '')
    .replace(SECRET_SHAPE_RE, '[REDACTED_SECRET]')
    .replace(CREDENTIAL_VAR_RE, '[REDACTED_CREDENTIAL]')
    .replace(WINDOWS_PATH_RE, '[REDACTED_PATH]')
    .replace(UNC_PATH_RE, '[REDACTED_PATH]')
    .replace(POSIX_PATH_RE, '$1[REDACTED_PATH]')
}

/**
 * Escapes HTML and Markdown inline control characters so arbitrary text cannot
 * produce active HTML, links, headings, emphasis, or code fences. Backslash is
 * escaped first so the other escapes are not themselves undone.
 */
export function escapeMarkdownInline(input: string): string {
  return String(input ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/!/g, '\\!')
    .replace(/\|/g, '\\|')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Applies the full display-safe pipeline: redact then escape. Order matters:
 * redaction first (so secrets cannot hide inside escaping), then escaping.
 */
export function makeDisplaySafe(value: string): string {
  return escapeMarkdownInline(sanitizeHandoffText(value))
}
