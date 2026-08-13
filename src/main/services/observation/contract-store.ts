import type { VerificationContract } from '../../../shared/verification-types.ts'
import { canonicalStringify, sha256Utf8 } from '../../utils/evidence-digest.ts'

/**
 * Most recently submitted verification contract (from the interactive preview
 * flow). Auto-verification uses it when a matching session ends. Kept in
 * process memory only; never persisted and never sent back to the agent.
 */
let lastContract: VerificationContract | null = null
let generation = 0
const listeners = new Set<(snapshot: RememberedContractSnapshot) => void>()

export interface RememberedContractSnapshot {
  contract: VerificationContract | null
  digest: string | null
  generation: number
}

function snapshot(): RememberedContractSnapshot {
  return {
    contract: lastContract,
    digest: lastContract ? sha256Utf8(canonicalStringify(lastContract)) : null,
    generation
  }
}

function notify(): void {
  const value = snapshot()
  for (const listener of listeners) listener(value)
}

export function rememberContract(contract: unknown): void {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return
  lastContract = contract as VerificationContract
  generation++
  notify()
}

export function getRememberedContract(): VerificationContract | null {
  return lastContract
}

export function getRememberedContractSnapshot(): RememberedContractSnapshot {
  return snapshot()
}

export function onRememberedContractChanged(listener: (snapshot: RememberedContractSnapshot) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearRememberedContract(): void {
  lastContract = null
  generation++
  notify()
}
