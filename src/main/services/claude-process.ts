import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync } from 'fs'
import { spawn, type IPty } from 'node-pty'
import { getClaudeProcessCwd, getSettingsGlobalPath } from '../utils/paths'

export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'error' | 'terminated'
export type DataHandler = (data: string) => void
export type StatusHandler = (status: ProcessStatus) => void
export type SecretResolver = (ref: string) => Promise<string | null>

export interface RuntimeProviderConfig {
  mode: 'custom'
  name: string
  providerType?: string
  baseUrl: string
  apiKeyRef: string
  model?: string
  createdAt?: number
}
export interface RuntimeProviderStatus {
  mode: 'default' | 'custom'
  name?: string
  providerType?: string
  sanitizedHost?: string
  hasModel?: boolean
}

export class ClaudeProcessManager {
  private pty: IPty | null = null
  private _status: ProcessStatus = 'stopped'
  private onDataHandlers: DataHandler[] = []
  private onStatusHandlers: StatusHandler[] = []
  private runtimeProvider: RuntimeProviderConfig | null = null
  private secretResolver: SecretResolver | null = null

  get status(): ProcessStatus {
    return this._status
  }

  private setStatus(s: ProcessStatus): void {
    this._status = s
    this.onStatusHandlers.forEach(h => h(s))
  }

  onData(handler: DataHandler): () => void {
    this.onDataHandlers.push(handler)
    return () => {
      this.onDataHandlers = this.onDataHandlers.filter(h => h !== handler)
    }
  }

  onStatus(handler: StatusHandler): () => void {
    this.onStatusHandlers.push(handler)
    return () => {
      this.onStatusHandlers = this.onStatusHandlers.filter(h => h !== handler)
    }
  }

  private emitData(data: string): void {
    this.onDataHandlers.forEach(h => h(data))
  }

  async start(): Promise<void> {
    if (this.pty) { this.emitData('\r\n进程已在运行中\r\n'); return }
    this.setStatus('starting')
    const claudeExe = this.resolveClaudeExe()
    const cwd = getClaudeProcessCwd()
    let childEnv: Record<string, string>
    try { childEnv = await this.resolveSpawnEnv() } catch { this.pty = null; this.setStatus('error'); return }
    const customBaseUrl = childEnv['ANTHROPIC_BASE_URL']
    if (customBaseUrl && !this.runtimeProvider) {
      const isAnthropic = customBaseUrl.includes('anthropic.com')
      if (!isAnthropic) {
        this.emitData('\r\n')
        this.emitData('╔══════════════════════════════════════════════════════════╗\r\n')
        this.emitData('║  ⚠️  警告：检测到自定义 API endpoint                       ║\r\n')
        this.emitData(`║  当前 endpoint: ${customBaseUrl.padEnd(43)}║\r\n`)
        this.emitData('║  当前 Claude Code 将使用自定义 API endpoint，              ║\r\n')
        this.emitData('║  可能影响模型和登录状态。                                  ║\r\n')
        this.emitData('║  如需恢复默认，请在 Settings → API 配置中                   ║\r\n')
        this.emitData('║  点击"恢复 Claude 默认运行环境"。                          ║\r\n')
        this.emitData('╚══════════════════════════════════════════════════════════╝\r\n')
        this.emitData('\r\n')
      }
    }

    try {
      this.pty = spawn(claudeExe, [], { name: 'xterm-256color', cols: 120, rows: 30, cwd, env: childEnv })

      this.setStatus('running')

      this.pty.onData((chunk) => {
        this.emitData(chunk)
      })

      this.pty.onExit(({ exitCode }) => {
        this.pty = null
        this.setStatus('terminated')
        this.emitData(`\r\n进程已退出 (code: ${exitCode})\r\n`)
      })
    } catch (err) {
      this.pty = null
      this.setStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      this.emitData(`\r\n启动失败: ${msg}\r\n`)
      throw err
    }
  }

  stop(): void {
    if (!this.pty) return
    // Send Ctrl+C
    this.write('\x03')
    setTimeout(() => {
      if (this.pty) {
        try { this.pty.kill() } catch { /* ignore */ }
        this.pty = null
        this.setStatus('stopped')
      }
    }, 1000)
  }

  write(data: string): void {
    if (!this.pty) return
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return
    const safeCols = Math.max(10, Math.min(500, Math.round(cols)))
    const safeRows = Math.max(5, Math.min(200, Math.round(rows)))
    this.pty.resize(safeCols, safeRows)
  }

  isRunning(): boolean {
    return this.pty !== null && this._status === 'running'
  }

  private sanitizeHost(baseUrl: string): string {
    try { return new URL(baseUrl).hostname } catch { return 'custom' }
  }
  setRuntimeProvider(config: RuntimeProviderConfig): void {
    this.runtimeProvider = { ...config, mode: 'custom', createdAt: Date.now() }
  }
  clearRuntimeProvider(): void { this.runtimeProvider = null }

  getRuntimeProviderStatus(): RuntimeProviderStatus {
    if (!this.runtimeProvider) return { mode: 'default' }
    return { mode: 'custom', name: this.runtimeProvider.name, providerType: this.runtimeProvider.providerType, sanitizedHost: this.sanitizeHost(this.runtimeProvider.baseUrl), hasModel: !!this.runtimeProvider.model }
  }

  getRuntimeProviderForSpawn(): RuntimeProviderConfig | null {
    return this.runtimeProvider ? { ...this.runtimeProvider } : null
  }

  setSecretResolver(resolver: SecretResolver): void { this.secretResolver = resolver }

  private async resolveSpawnEnv(): Promise<Record<string, string>> {
    const be = { ...process.env, ...this.resolveEnv(), TERM: 'xterm-256color', NODE_NO_WARNINGS: '1' } as Record<string, string>
    if (!this.runtimeProvider) return be
    const rp = this.runtimeProvider; const rlv = this.secretResolver
    if (!rlv) { this.emitData('\r\n启动失败: 缺少密钥解析器\r\n'); throw new Error('e0') }
    if (!rp.apiKeyRef) { this.emitData('\r\n启动失败: 密钥引用为空\r\n'); throw new Error('e1') }
    if (!rp.baseUrl.trim()) { this.emitData('\r\n启动失败: API 地址为空\r\n'); throw new Error('e2') }
    let u: URL
    try { u = new URL(rp.baseUrl.trim()) } catch { this.emitData('\r\n启动失败: API 地址格式无效\r\n'); throw new Error('e3') }
    if (u.username || u.password || u.search || u.hash) { this.emitData('\r\n启动失败: API 地址包含不允许的字段\r\n'); throw new Error('e4') }
    const k = await rlv(rp.apiKeyRef)
    if (!k) { this.emitData('\r\n启动失败: 无法获取密钥\r\n'); throw new Error('e5') }
    const ce: Record<string, string> = {}
    for (const k of Object.keys(be)) ce[k] = be[k]
    delete ce['ANTHROPIC_BASE_URL']; delete ce['ANTHROPIC_AUTH_TOKEN']; delete ce['ANTHROPIC_API_KEY']; delete ce['ANTHROPIC_MODEL']
    ce['ANTHROPIC_BASE_URL'] = rp.baseUrl.trim(); ce['ANTHROPIC_AUTH_TOKEN'] = k
    if (rp.model) ce['ANTHROPIC_MODEL'] = rp.model
    return ce
  }

  private resolveClaudeExe(): string {
    const candidates = [
      join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      join(homedir(), 'AppData', 'Local', 'anthropic', 'claude', 'claude.exe')
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return 'claude'
  }

  private resolveEnv(): Record<string, string> {
    try {
      const settingsPath = getSettingsGlobalPath()
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.env || {}
    } catch {
      return {}
    }
  }
}
