import type { ReactNode } from 'react'

/**
 * Shared inline SVG icon set. Single source of truth for shell and sidebar
 * icons so the app never mixes emoji with SVG. All icons inherit the current
 * text color and render at the given size (default 14).
 */
interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 14, className, children }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** 2x2 grid — workspace / projects desk. */
export function WorkspaceIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Svg>
  )
}

/** Circle with check — verification. */
export function VerificationIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.2 7.2 9.9 10.6 6.4" />
    </Svg>
  )
}

/** Magnifier — environment / diagnostics. */
export function EnvironmentIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 10.5a6.5 6.5 0 1 1 11 0" />
      <path d="M8 10.5 10.5 7" />
    </Svg>
  )
}

/** Gear — settings. */
export function SettingsIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
    </Svg>
  )
}

/** Notebook — memory. */
export function MemoryIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M6 2.5v11M6 6.5h7.5" />
    </Svg>
  )
}

/** Sparkle — skills / ability. */
export function SkillsIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M8 2.5c.4 2.6 2.9 5.1 5.5 5.5-2.6.4-5.1 2.9-5.5 5.5-.4-2.6-2.9-5.1-5.5-5.5 2.6-.4 5.1-2.9 5.5-5.5Z" />
    </Svg>
  )
}

/** Folder — projects. */
export function FolderIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
    </Svg>
  )
}

/** Open folder. */
export function FolderOpenIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2 5A1.5 1.5 0 0 1 3.5 3.5h3l1.5 2h3.5A1.5 1.5 0 0 1 13 7v1H3.2a1 1 0 0 0-.95.7L2 11.2V5Z" />
      <path d="M13 8v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1 11.5V11" />
    </Svg>
  )
}

/** Generic document. */
export function FileIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 2.5V6h3.5" />
    </Svg>
  )
}

/** Markdown document (lines). */
export function MarkdownIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M5.5 10h1v-2l1 1 1-1v2h1M9 2.5V6h3.5" />
    </Svg>
  )
}

/** JSON document (braces). */
export function JsonIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M6.5 8.5 5.2 7.5l1.3-1M9.5 8.5l1.3-1-1.3-1M9 2.5V6h3.5" />
    </Svg>
  )
}

/** File with a plus — create file. */
export function NewFileIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 2.5V6h3.5M6.5 9v3M5 10.5h3" />
    </Svg>
  )
}

/** Folder with a plus — create folder. */
export function NewFolderIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
      <path d="M8 7v4M6 9h4" />
    </Svg>
  )
}

/** Pencil — rename. */
export function RenameIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 1 1-3 7.5-7.5Z" />
    </Svg>
  )
}

/** Trash — delete. */
export function DeleteIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8" />
      <path d="M6.5 7v4M9.5 7v4" />
    </Svg>
  )
}

/** Hamburger — collapse/expand sidebar. */
export function MenuIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    </Svg>
  )
}

/** Circular arrows — refresh. */
export function RefreshIcon({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.5v2.5h-2.5" />
    </Svg>
  )
}

/** Left chevron — collapse rail. */
export function CollapseChevron({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M10 3 5 8l5 5" />
    </Svg>
  )
}

/** Right chevron — expand rail. */
export function ExpandChevron({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M6 3l5 5-5 5" />
    </Svg>
  )
}

/** Left-pointing back — collapse sidebar. */
export function BackChevron({ size, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M10.5 3 5 8l5.5 5" />
    </Svg>
  )
}
