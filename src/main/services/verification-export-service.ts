// Verification export service: writes a display-safe JSON Receipt and/or
// Markdown Handoff through the Electron Main process.
//
// Security invariants:
// - The renderer only requests an export kind ('json' | 'md' | 'both'); it can
//   never supply an arbitrary output path.
// - The Main process owns path selection (system save dialog), validates the
//   extension, rejects device/UNC paths, and writes atomically via a temp file
//   + rename.
// - Export never mutates the already-built immutable Receipt, so an export
//   failure cannot change the verification verdict.
// - We never zip, sign, upload, sync, auto-commit, auto-push, or copy to the
//   clipboard, and we never open or execute the exported file.
import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'

import type { VerificationReceipt } from '../../shared/verification-receipt-types.ts'
import { renderHandoffMarkdown } from '../../shared/handoff-markdown.ts'

export type ExportKind = 'json' | 'md' | 'both'

export interface ExportRequest {
  kind: ExportKind
  receipt: VerificationReceipt
  /** Optional explicit paths for 'both' in tests; production uses the save dialog. */
  jsonPath?: string
  mdPath?: string
}

export type ExportResult =
  | { ok: true; jsonPath?: string; mdPath?: string }
  | { ok: false; error: string }

const ALLOWED_EXTENSIONS = new Set(['.json', '.md'])
const UNC_OR_DEVICE_RE = /^(?:\\\\|\/\/|\\[?.]\\)/

export interface VerificationExportServiceOptions {
  /** Injected save-path resolver (tests). Production uses dialog.showSaveDialog. */
  resolveSavePath?: (defaultName: string) => Promise<string | null>
}

export class VerificationExportService {
  private readonly resolveSavePath: (defaultName: string) => Promise<string | null>

  constructor(options: VerificationExportServiceOptions = {}) {
    this.resolveSavePath = options.resolveSavePath ?? this.promptForSavePath
  }

  async export(request: ExportRequest): Promise<ExportResult> {
    const { kind, receipt } = request

    if (kind === 'json' || kind === 'both') {
      const jsonPath = request.jsonPath ?? await this.pickPath('verification-receipt.json')
      if (!jsonPath) return { ok: false, error: 'save cancelled' }
      const jsonError = this.validatePath(jsonPath)
      if (jsonError) return { ok: false, error: jsonError }
      const jsonContent = JSON.stringify(receipt, null, 2)
      this.writeAtomic(jsonPath, jsonContent)
    }
    if (kind === 'md' || kind === 'both') {
      const mdPath = request.mdPath ?? await this.pickPath('verification-handoff.md')
      if (!mdPath) return { ok: false, error: 'save cancelled' }
      const mdError = this.validatePath(mdPath)
      if (mdError) return { ok: false, error: mdError }
      const mdContent = renderHandoffMarkdown(receipt)
      this.writeAtomic(mdPath, mdContent)
    }

    return { ok: true, ...(request.jsonPath ? { jsonPath: request.jsonPath } : {}), ...(request.mdPath ? { mdPath: request.mdPath } : {}) }
  }

  private validatePath(path: string): string | null {
    if (!path || UNC_OR_DEVICE_RE.test(path)) return 'output path must be a local drive path'
    const ext = extname(path).toLocaleLowerCase('en-US')
    if (!ALLOWED_EXTENSIONS.has(ext)) return 'output extension must be .json or .md'
    return null
  }

  private writeAtomic(path: string, content: string): void {
    const dir = dirname(path)
    const tmp = join(dir, `.aw-export-${randomUUID()}.tmp`)
    writeFileSync(tmp, content, 'utf8')
    renameSync(tmp, path)
  }

  private async pickPath(defaultName: string): Promise<string | null> {
    return this.resolveSavePath(defaultName)
  }

  private async promptForSavePath(defaultName: string): Promise<string | null> {
    // E2E hook: when the test sets an export directory, write directly there
    // instead of opening the system save dialog. Production never sets this.
    const e2eExportDir = process.env['AGENT_WORKBENCH_E2E_EXPORT_DIR']
    if (e2eExportDir && process.env['AGENT_WORKBENCH_E2E'] === '1') {
      return join(e2eExportDir, defaultName)
    }
    const { dialog, BrowserWindow } = await import('electron')
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const options = {
      title: 'Export Verification',
      defaultPath: defaultName,
      filters: [
        { name: 'Verification artifacts', extensions: ['json', 'md'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    return result.canceled || result.filePath.length === 0 ? null : result.filePath
  }
}
