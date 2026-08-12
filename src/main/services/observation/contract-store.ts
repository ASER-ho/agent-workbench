import type { VerificationContract } from '../../../shared/verification-types.ts'

/**
 * Most recently submitted verification contract (from the interactive preview
 * flow). Auto-verification uses it when a matching session ends. Kept in
 * process memory only; never persisted and never sent back to the agent.
 */
let lastContract: VerificationContract | null = null

export function rememberContract(contract: unknown): void {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return
  lastContract = contract as VerificationContract
}

export function getRememberedContract(): VerificationContract | null {
  return lastContract
}

export function clearRememberedContract(): void {
  lastContract = null
}
