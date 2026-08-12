import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { normalizeHookEvent } from './agent-events.ts'
import type { ObservedAgentEvent } from '../../../shared/observation-types.ts'

/** Loopback-only. Preferred fixed port so installed hook URLs survive restarts. */
const PREFERRED_PORT = 28331
const MAX_BODY_BYTES = 4096

export interface ObservationEventServer {
  start(): Promise<{ port: number; token: string }>
  stop(): Promise<void>
  onEvent(handler: (event: ObservedAgentEvent) => void): () => void
}

/**
 * Local HTTP hook receiver. Binds 127.0.0.1 only, requires a bearer token
 * (Authorization header or `token` query param — the hook URL carries it),
 * caps the body at 4 KB, and always answers the agent with `{"ok":true}` so
 * hook payloads never leak back to the agent process.
 */
export class HttpObservationEventServer implements ObservationEventServer {
  private server: Server | null = null
  private readonly token = randomBytes(16).toString('hex')
  private handlers = new Set<(e: ObservedAgentEvent) => void>()

  onEvent(handler: (e: ObservedAgentEvent) => void): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  async start(): Promise<{ port: number; token: string }> {
    if (this.server) return this.info()
    const server = createServer((req, res) => { void this.route(req, res) })
    const listen = (port: number): Promise<void> => new Promise((resolve, reject) => {
      const onError = (err: Error): void => { server.removeListener('listening', onListening); reject(err) }
      const onListening = (): void => { server.removeListener('error', onError); resolve() }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
    try {
      await listen(PREFERRED_PORT)
    } catch {
      await listen(0)
    }
    this.server = server
    return this.info()
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => { this.server!.close(() => resolve()) })
    this.server = null
  }

  private info(): { port: number; token: string } {
    const addr = this.server?.address()
    const port = addr && typeof addr === 'object' ? addr.port : PREFERRED_PORT
    return { port, token: this.token }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
      return
    }
    if (req.method === 'POST' && (req.url === '/state' || req.url?.startsWith('/state?'))) {
      if (!this.tokenOk(req)) {
        res.writeHead(401)
        res.end()
        return
      }
      const body = await this.readBody(req)
      if (body === null) {
        res.writeHead(413)
        res.end()
        return
      }
      let payload: unknown
      try {
        payload = JSON.parse(body)
      } catch {
        res.writeHead(400)
        res.end()
        return
      }
      const event = normalizeHookEvent(payload, true)
      if (event) {
        for (const h of this.handlers) h(event)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
      return
    }
    res.writeHead(404)
    res.end()
  }

  private tokenOk(req: IncomingMessage): boolean {
    const auth = req.headers['authorization']
    if (auth === `Bearer ${this.token}`) return true
    try {
      const url = new URL(req.url ?? '', 'http://127.0.0.1')
      return url.searchParams.get('token') === this.token
    } catch {
      return false
    }
  }

  private readBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          resolve(null)
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(null))
    })
  }
}
