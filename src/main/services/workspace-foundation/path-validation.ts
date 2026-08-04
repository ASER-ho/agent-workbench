// Workspace Foundation 路径校验工具。
// isUncOrDevicePath 从 executable-validation.ts 拆出，仅保留路径校验部分，不依赖可执行文件校验。

/**
 * Reject UNC paths, extended UNC, device paths, and other non-local-drive paths.
 * Only allows plain local drive-letter absolute paths like C:\... or F:\...
 */
export function isUncOrDevicePath(value: string): boolean {
  const s = value.trim()
  // UNC: \\server\share\...
  if (s.startsWith('\\\\') && !s.startsWith('\\\\?\\')) return true
  // Extended UNC: \\?\UNC\server\share\...
  if (/^\\\\\?\\UNC\\/i.test(s)) return true
  // Extended local: \\?\C:\...
  if (/^\\\\\?\\[A-Za-z]:/i.test(s)) return true
  // Device namespace: \\.\...
  if (/^\\\\\.\\/i.test(s)) return true
  return false
}
