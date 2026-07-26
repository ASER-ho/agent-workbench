import { useState, useEffect } from 'react'

interface SkillViewerProps {
  filePath: string
}

export default function SkillViewer({ filePath }: SkillViewerProps) {
  const [content, setContent] = useState('')
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown> | null>(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '读取文件失败')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-text">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header */}
      {frontmatter && (
        <div className="mb-6 pb-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white mb-1">
            {String(frontmatter.name ?? '')}
          </h1>
          {frontmatter.description && (
            <p className="text-sm text-gray-400 mb-3">
              {String(frontmatter.description)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-[10px] rounded-full border border-indigo-800/50">
              {String(frontmatter['user-invocable'] === false ? 'Auto' : 'Manual')}
            </span>
            {frontmatter.metadata && typeof frontmatter.metadata === 'object' && 'type' in frontmatter.metadata && (
              <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded-full">
                {String((frontmatter.metadata as Record<string, unknown>).type)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">
        {body}
      </div>
    </div>
  )
}
