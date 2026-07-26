import { useState, useEffect, useCallback } from 'react'
import { useTabs } from '../../contexts/TabContext'
import { useLocale } from '../../contexts/LocaleContext'

interface MarkdownEditorProps {
  filePath: string
}

export default function MarkdownEditor({ filePath }: MarkdownEditorProps) {
  const { setDirty, updateSavedContent } = useTabs()
  const { t } = useLocale()
  const [content, setContent] = useState('')
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown> | null>(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    window.api.fs.readFrontmatter(filePath)
      .then(doc => {
        if (cancelled) return
        setFrontmatter(doc.frontmatter)
        setBody(doc.body)
        setContent(doc.raw)
        updateSavedContent(filePath, doc.raw)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('editor.readFailed'))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [filePath])

  const handleBodyChange = useCallback((newBody: string) => {
    setBody(newBody)
    const newContent = frontmatter
      ? ['---', ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`), '---', '', newBody].join('\n')
      : newBody
    setContent(newContent)
    setDirty(filePath, true)
  }, [filePath, frontmatter, setDirty])

  const handleFrontmatterChange = useCallback((key: string, value: string) => {
    setFrontmatter(prev => ({ ...prev, [key]: value }))
    setDirty(filePath, true)
  }, [filePath, setDirty])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await window.api.fs.writeFrontmatter(filePath, frontmatter ?? {}, body)
      updateSavedContent(filePath, content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('editor.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="loading-spinner" />
          <span className="text-xs text-gray-500">{t('editor.loading')}</span>
        </div>
      </div>
    )
  }

  if (error && !content) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-text">{error}</div>
        <button onClick={() => window.api.fs.readFrontmatter(filePath).then(d => {
          setFrontmatter(d.frontmatter); setBody(d.body); setContent(d.raw); setError(null)
        })} className="btn btn-primary text-xs">
          {t('editor.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="editor-container">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary text-[11px] disabled:opacity-50"
          >
            {saving ? t('editor.saving') : t('editor.save')}
          </button>
          {saved && <span className="text-green-400 text-[10px]">✓ {t('editor.saved')}</span>}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="btn btn-ghost text-[11px]"
          >
            {showPreview ? t('editor.edit') : t('editor.preview')}
          </button>
        </div>
        <span className="text-[10px] text-gray-600 font-mono truncate ml-2">{filePath.replace(/\\/g, '/').split('/').pop() || filePath}</span>
      </div>

      {/* Error inline */}
      {error && (
        <div className="px-3 py-1.5 bg-red-900/30 border-b border-red-800 text-red-400 text-[11px]">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('editor.dismiss')}</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {showPreview ? (
          <div className="p-4 text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {body || t('editor.empty')}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Frontmatter Editor */}
            {frontmatter && Object.keys(frontmatter).length > 0 && (
              <div className="p-3 bg-gray-900/50 border-b border-gray-800">
                <div className="text-[10px] text-indigo-400 font-semibold mb-2 uppercase tracking-wider">{t('editor.frontmatter')}</div>
                <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1.5">
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <div key={key} className="contents">
                      <label className="text-[11px] text-gray-500 font-mono truncate">{key}</label>
                      <input
                        className="bg-gray-800 text-gray-200 text-[11px] px-2 py-1 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none"
                        value={String(value ?? '')}
                        onChange={e => handleFrontmatterChange(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body Editor */}
            <textarea
              className="flex-1 bg-transparent text-gray-200 text-sm font-mono p-4 outline-none resize-none"
              value={body}
              onChange={e => handleBodyChange(e.target.value)}
              placeholder={t("editor.content")}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
