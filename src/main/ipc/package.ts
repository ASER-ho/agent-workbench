import { trustedIpcMain as ipcMain } from './trusted-ipc'
import type { IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, basename } from 'path'
import { spawn } from 'child_process'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import type { PackageProgress } from '../../shared/ipc-types'
import { getPackageRoot, getShareOutputDir, getDisplayPath } from '../utils/paths'
import { createArchiveInvocation } from '../utils/archive-command'

async function readdirSafe(dir: string): Promise<string[]> {
  try { return await fs.readdir(dir) } catch { return [] }
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
  const results: string[] = []
  try {
    const items = await readdirSafe(dir)
    for (const item of items) {
      const full = join(dir, item)
      try {
        const st = await fs.stat(full)
        if (st.isDirectory()) {
          const sub = await findFiles(full, ext)
          results.push(...sub)
        } else if (item.endsWith(ext)) {
          results.push(full)
        }
      } catch {}
    }
  } catch {}
  return results
}

async function compressArchiveAsync(sourceDir: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = createArchiveInvocation(sourceDir, zipPath)
    const child = spawn('powershell.exe', invocation.args, {
      timeout: 180000,
      windowsHide: true,
      env: invocation.env
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(code ? `zip exit ${code}` : 'zip terminated'))
    })

    child.on('error', (err) => reject(err))
  })
}

function sanitizePackageError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : ''
  const message = err instanceof Error ? err.message : String(err || '')
  if (message.includes('EPERM') || code === 'EPERM' || code === 'EACCES') {
    return `文件访问被拒绝或临时文件被占用，请关闭旧窗口后重试。错误代码：${code || 'EPERM'}`
  }
  if (code) {
    return `打包失败，请检查文件占用或权限后重试。错误代码：${code}`
  }
  return '打包失败，请检查文件占用或权限后重试。'
}

function sendPackageProgress(
  event: IpcMainInvokeEvent,
  startTime: number,
  progress: { stage: PackageProgress['stage']; label: string; percent?: number }
): void {
  event.sender.send(IPC_CHANNELS.PACKAGE_PROGRESS, {
    ...progress,
    elapsedMs: Date.now() - startTime,
    etaLabel: '估算中'
  } satisfies PackageProgress)
}

export function registerPackageHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PACKAGE_SHARE, async (event) => {
    const packageRoot = getPackageRoot()
    const shareOutputDir = getShareOutputDir()
    const startedAt = Date.now()
    let tmpDir = ''
    const emit = (stage: PackageProgress['stage'], label: string, percent?: number) =>
      sendPackageProgress(event, startedAt, { stage, label, percent })

    try {
      // Step 1: Clean up old temp, then prepare staging directory
      emit('cleanup', '清理旧临时文件...')
      const outDir = join(packageRoot, 'out')
      const packageJsonPath = join(packageRoot, 'package.json')
      if (!existsSync(outDir) || !existsSync(packageJsonPath)) {
        throw new Error('Packaging source unavailable')
      }

      await fs.mkdir(shareOutputDir, { recursive: true })
      tmpDir = await fs.mkdtemp(join(tmpdir(), 'agent-workbench-share-'))
      const zipPath = join(shareOutputDir, 'Agent-Workbench-v0.1.zip')
      emit('prepare', '准备打包...')

      // Step 2: Copy runtime files
      const nmDir = join(packageRoot, 'node_modules')

      emit('copy-out', '复制编译产物...')
      if (existsSync(outDir)) await fs.cp(outDir, join(tmpDir, 'out'), { recursive: true })

      emit('copy-deps', '复制运行依赖...')
      if (existsSync(nmDir)) {
        await fs.mkdir(join(tmpDir, 'node_modules'), { recursive: true })
        const nmItems = await readdirSafe(nmDir)
        let copied = 0
        for (const item of nmItems) {
          if (item.startsWith('.') || item === '@electron') continue
          try {
            await fs.cp(join(nmDir, item), join(tmpDir, 'node_modules', item), { recursive: true })
            copied++
            if (copied % 10 === 0) {
              sendPackageProgress(event, startedAt, { stage: 'copy-deps', label: `复制运行依赖 (${copied})...`, percent: Math.min(90, Math.round(copied / nmItems.length * 80)) })
            }
          } catch { /* skip locked files */ }
        }
      }
      if (existsSync(join(packageRoot, 'package.json'))) {
        await fs.cp(join(packageRoot, 'package.json'), join(tmpDir, 'package.json'))
      }

      // Launcher
      await fs.writeFile(join(tmpDir, 'run.bat'), `@echo off
cd /d "%~dp0"
echo Starting Agent Workbench...
npx electron out/main/index.js
pause
`, 'utf-8')

      // README with security warning
      await fs.writeFile(join(tmpDir, 'README.txt'), `Agent Workbench - Portable
=================================
Generated: ${new Date().toLocaleString()}

HOW TO USE:
  1. Double-click run.bat
  2. Go to Settings -> API Config -> enter your API Key

SECURITY:
  This package has NO API keys or personal data.
  DO NOT copy your own settings files into it before sharing.

REQUIREMENTS: Windows 10/11, Node.js 18+
`, 'utf-8')

      // Step 3: Security scan — scan staging dir BEFORE zipping
      emit('scan', '安全检查...')
      const jsonFiles = await findFiles(tmpDir, '.json')
      const suspiciousFiles: string[] = []
      let hasKey = false

      for (const f of jsonFiles) {
        try {
          const content = await fs.readFile(f, 'utf-8')
          const matches = content.match(/["']sk-[a-zA-Z0-9]{20,}["']/g)
          if (matches && matches.length > 0) {
            suspiciousFiles.push(basename(f))
            hasKey = true
          }
          if (content.includes('ANTHROPIC_AUTH_TOKEN') && !content.includes('ANTHROPIC_AUTH_TOKEN ||')) {
            suspiciousFiles.push(basename(f) + ' (contains ANTHROPIC_AUTH_TOKEN)')
            hasKey = true
          }
        } catch {}
      }

      // Step 4: ZIP
      if (existsSync(zipPath)) await fs.rm(zipPath)
      emit('compress', '压缩 ZIP...')
      await compressArchiveAsync(tmpDir, zipPath)
      const zipSize = (await fs.stat(zipPath)).size

      // Step 5: Clean temp
      emit('cleanup', '清理临时文件...')
      await fs.rm(tmpDir, { recursive: true })

      emit('done', '打包完成')
      return {
        success: true,
        path: getDisplayPath(zipPath).basename,
        sizeBytes: zipSize,
        sizeMB: (zipSize / 1024 / 1024).toFixed(1),
        securityScan: {
          passed: !hasKey,
          suspiciousFiles,
          message: hasKey
            ? '⚠️ 发现 API Key 泄露风险！请勿分享此文件'
            : '✅ 安全检查通过，未发现 API Key'
        }
      }
    } catch (err) {
      if (tmpDir && existsSync(tmpDir)) await fs.rm(tmpDir, { recursive: true }).catch(() => {})
      emit('failed', '打包失败')
      return { success: false, error: sanitizePackageError(err) }
    }
  })
}
