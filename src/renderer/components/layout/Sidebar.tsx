import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useTabs } from '../../contexts/TabContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useSidebar } from '../../contexts/SidebarContext'
import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu'
import {
  MemoryIcon, SkillsIcon, FolderIcon, SettingsIcon, FileIcon,
  MarkdownIcon, JsonIcon, NewFileIcon, NewFolderIcon, RenameIcon,
  DeleteIcon, MenuIcon, RefreshIcon, BackChevron, FolderOpenIcon
} from '../common/icons'

const SECTION_ICONS: Record<string, ReactNode> = {
  Memory: <MemoryIcon />,
  Skills: <SkillsIcon />,
  Projects: <FolderIcon />,
  Config: <SettingsIcon />
}

const SECTION_KEYS: Record<string, string> = {
  Memory: 'sidebar.memory',
  Skills: 'sidebar.skills',
  Projects: 'sidebar.projects',
  Config: 'sidebar.config'
}

interface DirCache {
  [dirPath: string]: Array<{
    name: string
    path: string
    isDirectory: boolean
    size: number
    mtime: string
  }>
}

interface CtxMenu {
  x: number
  y: number
  items: ContextMenuItem[]
}

function getFileType(fileName: string, sectionName: string): 'memory' | 'skill' | 'transcript' | 'settings' | 'claude-md' {
  if (sectionName === 'Skills') return 'skill'
  if (sectionName === 'Projects') return 'transcript'
  if (sectionName === 'Config') {
    if (fileName === 'CLAUDE.md') return 'claude-md'
    return 'settings'
  }
  return 'memory'
}

function getIcon(sectionName: string): ReactNode {
  return SECTION_ICONS[sectionName] ?? <FileIcon />
}

export default function Sidebar() {
  const { loading, error, sections, refresh } = useWorkspace()
  const { openTab } = useTabs()
  const { t } = useLocale()
  const { collapsed, toggle: toggleCollapse } = useSidebar()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Memory', 'Skills']))
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [dirCache, setDirCache] = useState<DirCache>({})
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [creating, setCreating] = useState<{ parentDir: string; isDir: boolean } | null>(null)

  const toggleSection = (name: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleFileClick = (filePath: string, fileName: string, sectionName: string) => {
    setSelectedPath(filePath)
    openTab(filePath, fileName, getFileType(fileName, sectionName), getIcon(sectionName))
  }

  const toggleDir = async (dirPath: string) => {
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs(prev => { const n = new Set(prev); n.delete(dirPath); return n })
      return
    }
    if (!dirCache[dirPath]) {
      try {
        const items = await window.api.fs.listDirectory(dirPath)
        setDirCache(prev => ({ ...prev, [dirPath]: items }))
      } catch { return }
    }
    setExpandedDirs(prev => { const n = new Set(prev); n.add(dirPath); return n })
  }

  const handleCreate = async (parentDir: string, isDir: boolean, name: string) => {
    try {
      if (isDir) {
        await window.api.fs.createDirectory(parentDir, name)
      } else {
        await window.api.fs.createFile(parentDir, name)
      }
      // Clear cache for this dir and refresh tree
      setDirCache(prev => {
        const next = { ...prev }
        delete next[parentDir]
        return next
      })
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      alert(msg)
    }
  }

  const handleDelete = async (path: string) => {
    try {
      await window.api.fs.delete(path)
      // Clear cached parent
      const parentDir = path.split('\\').slice(0, -1).join('\\')
      setDirCache(prev => {
        const next = { ...prev }
        delete next[parentDir]
        return next
      })
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const handleRename = async (oldPath: string, newName: string) => {
    try {
      await window.api.fs.rename(oldPath, newName)
      const parentDir = oldPath.split('\\').slice(0, -1).join('\\')
      setDirCache(prev => {
        const next = { ...prev }
        delete next[parentDir]
        return next
      })
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const onContextMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  // Path-derived workspace IDs (e.g. "C--Users--workspace-user") must never
  // expose drive letters, usernames, or directory hierarchy.
  // Show locale-based safe label instead of any path segment.
  const isPathDerivedId = (name: string): boolean => /^[A-Za-z]--/.test(name)

  const sectionName = (name: string) => {
    const key = SECTION_KEYS[name]
    return key ? (
      <span className="flex items-center gap-1.5">{SECTION_ICONS[name] ?? <FileIcon />}<span>{t(key)}</span></span>
    ) : (
      <span className="flex items-center gap-1.5"><FileIcon /><span>{isPathDerivedId(name) ? t('sidebar.currentWorkspace') : name}</span></span>
    )
  }

  const renderItem = (
    item: { name: string; path: string; isDirectory: boolean },
    sectionName: string,
    depth: number
  ): ReactNode => {
    const isActive = item.path === selectedPath
    const padLeft = 12 + depth * 16
    const isDir = item.isDirectory

    if (isDir) {
      const expanded = expandedDirs.has(item.path)
      const icon = expanded ? <FolderOpenIcon /> : <FolderIcon />
      const children = dirCache[item.path]

      return (
        <div key={item.path}>
          <div
            className={`sidebar-item ${isActive ? 'active' : ''}`}
            onClick={() => toggleDir(item.path)}
            onContextMenu={(e) => onContextMenu(e, [
              { label: t('context.newFile'), icon: <NewFileIcon />, onClick: () => setCreating({ parentDir: item.path, isDir: false }) },
              { label: t('context.newFolder'), icon: <NewFolderIcon />, onClick: () => setCreating({ parentDir: item.path, isDir: true }) },
              { label: t('context.rename'), icon: <RenameIcon />, onClick: () => setRenaming({ path: item.path, name: item.name }) },
              { label: t('context.delete'), icon: <DeleteIcon />, danger: true, onClick: () => handleDelete(item.path) },
            ])}
            style={{ paddingLeft: padLeft }}
          >
            <span className="text-[10px] mr-1">{expanded ? '▾' : '▸'}</span>
            <span className="mr-1">{icon}</span>
            {renaming?.path === item.path ? (
              <input
                className="text-[11px] px-1 py-0 rounded outline-none border flex-1 min-w-0" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--indigo)' }}
                defaultValue={item.name}
                autoFocus
                onBlur={(e) => { handleRename(item.path, e.target.value); setRenaming(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleRename(item.path, (e.target as HTMLInputElement).value); setRenaming(null) }
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-[11px]">{(isPathDerivedId(item.name) ? t('sidebar.currentWorkspace') : item.name)}</span>
            )}
          </div>
          {expanded && children && (
            <div>
              {/* "New file" inline at top of dir when creating */}
              {creating?.parentDir === item.path && (
                <InlineCreateInput
                  parentDir={item.path}
                  isDir={creating.isDir}
                  padLeft={padLeft + 16}
                  onSubmit={() => { setCreating(null); }}
                  onCancel={() => setCreating(null)}
                  onCreate={handleCreate}
                />
              )}
              {children.map(child => renderItem(child, sectionName, depth + 1))}
              {children.length === 0 && (
                <div className="px-6 py-1.5 text-[10px] italic" style={{ paddingLeft: padLeft + 16, color: 'var(--text-tertiary)' }}>
                  {t('sidebar.empty')}
                </div>
              )}
            </div>
          )}
          {expanded && !children && (
            <div className="px-6 py-1.5 text-[10px] italic" style={{ paddingLeft: padLeft + 16, color: 'var(--text-tertiary)' }}>
              <span className="loading-spinner w-2.5 h-2.5 inline-block" />
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={item.path}>
        <div
          className={`sidebar-item ${isActive ? 'active' : ''}`}
          onClick={() => handleFileClick(item.path, (isPathDerivedId(item.name) ? t('sidebar.currentWorkspace') : item.name), sectionName)}
          onContextMenu={(e) => onContextMenu(e, [
            { label: t('context.rename'), icon: <RenameIcon />, onClick: () => setRenaming({ path: item.path, name: item.name }) },
            { label: t('context.delete'), icon: <DeleteIcon />, danger: true, onClick: () => handleDelete(item.path) },
          ])}
          style={{ paddingLeft: padLeft }}
        >
          <span className="mr-1 flex items-center">
            {item.name.endsWith('.md') ? <MarkdownIcon /> :
             item.name.endsWith('.jsonl') || item.name.endsWith('.json') ? <JsonIcon /> :
             <FileIcon />}
          </span>
          {renaming?.path === item.path ? (
            <input
              className="text-[11px] px-1 py-0 rounded outline-none border flex-1 min-w-0" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--indigo)' }}
              defaultValue={item.name}
              autoFocus
              onBlur={(e) => { handleRename(item.path, e.target.value); setRenaming(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { handleRename(item.path, (e.target as HTMLInputElement).value); setRenaming(null) }
                if (e.key === 'Escape') setRenaming(null)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-[11px]">{(isPathDerivedId(item.name) ? t('sidebar.currentWorkspace') : item.name)}</span>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="loading-spinner mx-auto" />
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>{t('sidebar.loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <div className="text-xs text-center" style={{ color: 'var(--failed)' }}>{error}</div>
        <button onClick={refresh} className="btn btn-primary text-xs">{t('sidebar.retry')}</button>
      </div>
    )
  }

  return (
    <div className="py-2 h-full flex flex-col" onContextMenu={(e) => {
      // Right-click on empty area — no menu
    }}>
      <div className="px-3 py-2 flex items-center justify-between gap-1">
        {collapsed ? (
          <button onClick={toggleCollapse} className="w-full flex items-center justify-center p-1 rounded transition-colors hover:bg-gray-800 hover:text-white" style={{ color: 'var(--text-secondary)' }} title={t('sidebar.expand')}>
            <MenuIcon size={14} />
          </button>
        ) : (
          <>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('sidebar.workspace')}</h1>
            <div className="flex items-center gap-1">
              <button onClick={refresh}
                className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-gray-800 hover:text-white" style={{ color: 'var(--text-secondary)' }}
                title={t("sidebar.refresh")}>
                <RefreshIcon size={13} />
              </button>
              <button onClick={toggleCollapse}
                className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-gray-800 hover:text-white" style={{ color: 'var(--text-secondary)' }}
                title={t('sidebar.collapse')}>
                <BackChevron size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-2 px-1" />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {sections.map(section => (
              <div key={section.name}>
                <div
                  className="sidebar-section-header"
                  onClick={() => toggleSection(section.name)}
                  onContextMenu={(e) => onContextMenu(e, [
                    { label: t('context.newFile'), icon: <NewFileIcon />, onClick: () => setCreating({ parentDir: section.path, isDir: false }) },
                    { label: t('context.newFolder'), icon: <NewFolderIcon />, onClick: () => setCreating({ parentDir: section.path, isDir: true }) },
                  ])}
                >
                  <span>{sectionName(section.name)}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{expandedSections.has(section.name) ? '▾' : '▸'}</span>
                </div>

                {expandedSections.has(section.name) && (
                  <div className="mb-1">
                    {section.items.length === 0 ? (
                      <div className="flex flex-col items-center py-3 gap-2">
                        <div className="px-6 py-1 text-xs italic" style={{ color: 'var(--text-tertiary)' }}>{t('sidebar.empty')}</div>
                        <button
                          onClick={() => setCreating({ parentDir: section.path, isDir: false })}
                          className="text-[10px] hover:underline" style={{ color: 'var(--indigo)' }}>{t('sidebar.newFile')}</button>
                      </div>
                    ) : (
                      <>
                        {creating?.parentDir === section.path && (
                          <InlineCreateInput
                            parentDir={section.path}
                            isDir={creating.isDir}
                            padLeft={28}
                            onSubmit={() => setCreating(null)}
                            onCancel={() => setCreating(null)}
                            onCreate={handleCreate}
                          />
                        )}
                        {section.items.map(item => renderItem(item, section.name, 0))}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {ctxMenu && (
            <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
          )}
        </>
      )}
    </div>
  )
}

// Inline create input component
function InlineCreateInput({
  parentDir, isDir, padLeft, onSubmit, onCancel, onCreate
}: {
  parentDir: string
  isDir: boolean
  padLeft: number
  onSubmit: () => void
  onCancel: () => void
  onCreate: (parentDir: string, isDir: boolean, name: string) => void
}) {
  const { t } = useLocale()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const name = value.trim()
    if (!name) { onCancel(); return }
    const finalName = isDir ? name : (name.includes('.') ? name : `${name}.md`)
    onCreate(parentDir, isDir, finalName)
    onSubmit()
  }

  return (
    <div style={{ paddingLeft: padLeft }} className="flex items-center gap-1 px-3 py-1">
      <span className="flex items-center" style={{ color: 'var(--text-secondary)' }}>{isDir ? <NewFolderIcon /> : <NewFileIcon />}</span>
      <input
        ref={inputRef}
        className="text-[11px] px-1 py-0.5 rounded outline-none border flex-1 min-w-0" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--indigo)' }}
        placeholder={isDir ? t('sidebar.newFolder') : t('sidebar.newFileAction')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={submit}
      />
    </div>
  )
}
