import { useEffect, useRef, type ReactNode } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  divider?: boolean
  disabled?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay to avoid the same right-click closing immediately
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => (
        item.divider ? (
          <div key={i} className="my-1 border-t border-gray-700" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose() } }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
              item.disabled ? 'opacity-40 cursor-not-allowed' :
              item.danger
                ? 'text-red-400 hover:bg-red-900/40 hover:text-red-300'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {item.icon && <span className="w-4 text-center text-[11px]">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-gray-600 text-[10px]">{item.shortcut}</span>}
          </button>
        )
      ))}
    </div>
  )
}
