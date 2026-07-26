const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function normalizeApiBaseUrl(rawValue: unknown): string {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error('API base URL is required')
  }

  let url: URL
  try {
    url = new URL(rawValue.trim())
  } catch {
    throw new Error('API base URL is invalid')
  }

  if (url.username || url.password) {
    throw new Error('API base URL must not contain credentials')
  }
  if (url.search || url.hash) {
    throw new Error('API base URL must not contain query or fragment data')
  }

  const protocol = url.protocol.toLowerCase()
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (protocol !== 'https:' && !(protocol === 'http:' && LOOPBACK_HOSTS.has(hostname))) {
    throw new Error('API base URL must use HTTPS or loopback HTTP')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

export function buildApiEndpoint(baseUrl: unknown, suffix: string): string {
  const normalized = normalizeApiBaseUrl(baseUrl)
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${normalized}${normalizedSuffix}`
}

export function isStoredApiBindingAllowed(
  request: { baseUrl: unknown; apiKeyRef: unknown },
  stored: { baseUrl: unknown; apiKeyRef: unknown }
): boolean {
  if (
    typeof request.apiKeyRef !== 'string' ||
    request.apiKeyRef.length === 0 ||
    request.apiKeyRef !== stored.apiKeyRef
  ) {
    return false
  }

  try {
    return normalizeApiBaseUrl(request.baseUrl) === normalizeApiBaseUrl(stored.baseUrl)
  } catch {
    return false
  }
}
