import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { hostname, userInfo, homedir } from 'os'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16

interface SecretsPayload {
  secrets: Record<string, string>
}

/**
 * Storage format v2: Electron safeStorage protects the payload.
 * On Windows this is DPAPI (CurrentUser), on macOS the Keychain, on Linux
 * libsecret. A process without access to the OS secret store cannot decrypt
 * the file, unlike the legacy scrypt derivation which was a function of the
 * machine hostname and username.
 */
interface SafeStorageFile {
  version: 2
  protection: 'safe-storage'
  /** base64 of safeStorage.encryptString(JSON.stringify(payload)). */
  encrypted: string
  updatedAt: string
}

/**
 * Legacy storage format v1: AES-256-GCM keyed by scryptSync(tag, salt), where
 * tag is derived from hostname + username. Kept for reading existing files and
 * as a write fallback on platforms without an OS keyring. New writes use v2
 * whenever safeStorage is available.
 */
interface ScryptFile {
  version: 1
  salt: string
  iv: string
  authTag: string
  ciphertext: string
  updatedAt: string
}

type StoredFile = SafeStorageFile | ScryptFile

/**
 * Lazy Electron safeStorage accessor. Returns null when the module is loaded
 * outside Electron (e.g. a Node test process) or when the platform exposes no
 * OS secret store. This keeps FileSecretStore constructible and testable in
 * plain Node, where it falls back to the scrypt path.
 */
let safeStorageRef: Electron.SafeStorage | null | undefined
function getSafeStorage(): Electron.SafeStorage | null {
  if (safeStorageRef === undefined) {
    try {
      // electron is externalized in the main-process bundle; in a plain Node
      // test process this require throws and is caught here.
      const electron = require('electron') as typeof import('electron')
      safeStorageRef = electron.safeStorage ?? null
    } catch {
      safeStorageRef = null
    }
  }
  return safeStorageRef
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
  /** Force the legacy scrypt path regardless of safeStorage availability. */
  private readonly forceScrypt: boolean

  constructor(opts?: { storagePath?: string; useScryptFallback?: boolean }) {
    this.path = opts?.storagePath || join(homedir(), '.agent-workbench', 'secrets.enc')
    this.forceScrypt = opts?.useScryptFallback ?? false
  }

  private canUseSafeStorage(): boolean {
    if (this.forceScrypt) return false
    const storage = getSafeStorage()
    if (!storage) return false
    try {
      return storage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private readPayload(): SecretsPayload | null {
    if (!existsSync(this.path)) return null
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf-8')) as StoredFile
      if (raw.version === 2 && raw.protection === 'safe-storage') {
        const storage = getSafeStorage()
        if (!storage) throw new Error('safeStorage unavailable for stored secrets')
        const decrypted = storage.decryptString(Buffer.from(raw.encrypted, 'base64'))
        return JSON.parse(decrypted) as SecretsPayload
      }
      if (raw.version === 1) {
        return this.decryptScrypt(raw)
      }
      return null
    } catch {
      throw new Error('SecretStore corrupted or cannot be decrypted')
    }
  }

  private decryptScrypt(file: ScryptFile): SecretsPayload {
    const salt = Buffer.from(file.salt, 'base64')
    const iv = Buffer.from(file.iv, 'base64')
    const authTag = Buffer.from(file.authTag, 'base64')
    const key = this.deriveKey(salt)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(file.ciphertext, 'base64'),
      decipher.final()
    ]).toString('utf-8')
    return JSON.parse(decrypted)
  }

  private writePayload(data: SecretsPayload): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const payload = JSON.stringify(data)
    let file: StoredFile
    if (this.canUseSafeStorage()) {
      const storage = getSafeStorage()
      const encrypted = storage!.encryptString(payload).toString('base64')
      file = { version: 2, protection: 'safe-storage', encrypted, updatedAt: new Date().toISOString() }
    } else {
      file = this.encryptScrypt(payload)
    }
    const tmp = this.path + '.tmp'
    writeFileSync(tmp, JSON.stringify(file), 'utf-8')
    try { renameSync(tmp, this.path) } catch { /* rename failed, old file intact, tmp left for recovery */ }
  }

  private encryptScrypt(payload: string): ScryptFile {
    const salt = randomBytes(SALT_LENGTH)
    const key = this.deriveKey(salt)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const ciphertext = Buffer.concat([cipher.update(payload, 'utf-8'), cipher.final()])
    return {
      version: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      updatedAt: new Date().toISOString()
    }
  }

  private deriveKey(salt: Buffer): Buffer {
    const tag = `agent-workbench-v1:${hostname()}:${userInfo().username}`
    return scryptSync(tag, salt, KEY_LENGTH)
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
