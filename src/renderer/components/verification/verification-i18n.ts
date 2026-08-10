// Inline zh/en fallback helper for the 0.1.2-B Verification Workbench.
// Mirrors the WorkspaceDesk pattern: do NOT edit LocaleContext.tsx. The
// integration agent adds locale keys later; until then every string is an
// inline zh/en pair.

import { useLocale } from '../../contexts/LocaleContext'

export type Tr = (zh: string, en: string) => string

export function useTr(): {
  tr: Tr
  tx: (key: string, zh: string, en: string) => string
  locale: 'zh' | 'en'
} {
  const { t, locale } = useLocale()
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  const tx = (key: string, zh: string, en: string) => {
    const v = t(key)
    return v && v !== key ? v : (locale === 'zh' ? zh : en)
  }
  return { tr, tx, locale }
}
