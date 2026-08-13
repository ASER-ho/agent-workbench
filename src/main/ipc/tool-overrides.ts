import { dialog } from 'electron'
import { basename } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { trustedIpcMain as ipcMain } from './trusted-ipc'
import {
  resolveNode, resolveClaude, resolveNpm, trustedExecutableCandidate,
  loadToolOverrides, persistToolOverrides, type ResolvedTool, type ToolKind
} from '../services/trusted-tool-resolver'

/** Display-safe projection: basename + version + source — never a full path. */
function safeTool(t: ResolvedTool): { kind: ToolKind; found: boolean; name: string; version: string | null; source: string } {
  return {
    kind: t.kind,
    found: t.found,
    name: t.found && t.executable ? basename(t.executable) : '',
    version: t.version,
    source: t.source
  }
}

export function registerToolOverrideHandlers(getWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.TOOL_GET_RESOLUTION, () => {
    const node = resolveNode()
    return {
      node: safeTool(node),
      npm: safeTool(resolveNpm(node.found ? node.executable : null)),
      claude: safeTool(resolveClaude())
    }
  })

  // Open a native file dialog, validate the picked executable, persist it as the
  // override, and return only a display-safe confirmation (basename). The full
  // path never crosses to the renderer.
  ipcMain.handle(IPC_CHANNELS.TOOL_PICK, async (_event, kind: ToolKind) => {
    if (kind !== 'node' && kind !== 'claude') return { ok: false, error: 'invalid tool kind' }
    const win = getWindow()
    if (!win) return { ok: false, error: 'no window' }
    const result = await dialog.showOpenDialog(win, {
      title: kind === 'node' ? 'Select node.exe' : 'Select claude.exe',
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'cancelled' }
    const trusted = trustedExecutableCandidate(result.filePaths[0], kind)
    if (!trusted) return { ok: false, error: 'path is not a trusted executable' }
    const overrides = loadToolOverrides()
    if (kind === 'node') overrides.node = trusted
    else overrides.claude = trusted
    persistToolOverrides(overrides)
    return { ok: true, name: basename(trusted) }
  })

  ipcMain.handle(IPC_CHANNELS.TOOL_SET_OVERRIDE, (_event, { kind, path }: { kind: ToolKind; path: string }) => {
    if (kind !== 'node' && kind !== 'claude') return { ok: false, error: 'invalid tool kind' }
    const trusted = trustedExecutableCandidate(path, kind)
    if (!trusted) return { ok: false, error: 'path is not a trusted executable' }
    const overrides = loadToolOverrides()
    if (kind === 'node') overrides.node = trusted
    else overrides.claude = trusted
    persistToolOverrides(overrides)
    return { ok: true, name: basename(trusted) }
  })

  ipcMain.handle(IPC_CHANNELS.TOOL_CLEAR_OVERRIDE, (_event, kind: ToolKind) => {
    if (kind !== 'node' && kind !== 'claude') return { ok: false, error: 'invalid tool kind' }
    const overrides = loadToolOverrides()
    if (kind === 'node') delete overrides.node
    else delete overrides.claude
    persistToolOverrides(overrides)
    return { ok: true }
  })
}
