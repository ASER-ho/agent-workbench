const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])

export function isAllowedExternalUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.trim() !== rawUrl || rawUrl.length === 0) {
    return false
  }

  try {
    const url = new URL(rawUrl)
    return (
      ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol.toLowerCase()) &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
  }
}
