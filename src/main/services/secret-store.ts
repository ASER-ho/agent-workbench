import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { hostname, userInfo, homedir } from 'os'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16
const FILE_VERSION = 1

interface EncryptedFile {
  version: number
  salt: string
  iv: string
  authTag: string
  ciphertext: string
  updatedAt: string
}

interface SecretsPayload {
  secrets: Record<string, string>
}

export interface SecretStore {
  setSecret(ref: string, value: string): Promise<void>
  getSecret(ref: string): Promise<string | null>
  deleteSecret(ref: string): Promise<void>
  hasSecret(ref: string): Promise<boolean>
  listRefs(): Promise<string[]>
}

export class FileSecretStore implements SecretStore {
  private readonly path: string

  constructor(opts?: { storagePath?: string }) {
    this.path = opts?.storagePath || join(homedir(), '.agent-workbench', 'secrets.enc')
  }

  private deriveKey(salt: Buffer): Buffer {
    const tag = `agent-workbench-v1:${hostname()}:${userInfo().username}`
    return scryptSync(tag, salt, KEY_LENGTH)
  }

  private readPayload(): SecretsPayload | null {
    if (!existsSync(this.path)) return null
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf-8')) as EncryptedFile
      const salt = Buffer.from(raw.salt, 'base64')
      const iv = Buffer.from(raw.iv, 'base64')
      const authTag = Buffer.from(raw.authTag, 'base64')
      const key = this.deriveKey(salt)
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([
        decipher.update(raw.ciphertext, 'base64'),
        decipher.final()
      ]).toString('utf-8')
      return JSON.parse(decrypted)
    } catch { throw new Error('SecretStore corrupted or cannot be decrypted') }
  }

  private writePayload(data: SecretsPayload): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const salt = randomBytes(SALT_LENGTH)
    const key = this.deriveKey(salt)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const plaintext = JSON.stringify(data)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
    const file: EncryptedFile = {
      version: FILE_VERSION,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
      updatedAt: new Date().toISOString()
    }
    const tmp = this.path + '.tmp'
    writeFileSync(tmp, JSON.stringify(file), 'utf-8')
    try { renameSync(tmp, this.path) } catch { /* rename failed, old file intact, tmp left for recovery */ }
  }

  async setSecret(ref: string, value: string): Promise<void> {
    const data = this.readPayload() || { secrets: {} }
    data.secrets[ref] = value
    this.writePayload(data)
  }

  async getSecret(ref: string): Promise<string | null> {
    const data = this.readPayload()
    return data ? (data.secrets[ref] ?? null) : null
  }

  async deleteSecret(ref: string): Promise<void> {
    const data = this.readPayload()
    if (!data) return
    delete data.secrets[ref]
    this.writePayload(data)
  }

  async hasSecret(ref: string): Promise<boolean> {
    const data = this.readPayload()
    return data ? Object.hasOwn(data.secrets, ref) : false
  }

  async listRefs(): Promise<string[]> {
    const data = this.readPayload()
    return data ? Object.keys(data.secrets) : []
  }
}
