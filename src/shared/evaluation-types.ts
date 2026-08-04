// Deterministic single-criterion evaluation types.
// This module must stay pure TypeScript: no time, random, network, fs, Electron,
// Agent, or LLM access. Identical valid input must produce identical output.

export type CriterionVerdict =
  | 'VERIFIED'
  | 'FAILED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_EVALUATED'

export type EvidenceStatus = 'PASS' | 'FAIL' | 'UNKNOWN'

export interface EvidenceItem {
  evidenceId: string
  criterionId: string
  status: EvidenceStatus
  valid: boolean
  policyDigest?: string
  subjectDigest?: string
}

export interface EvaluationRequest {
  criterionId: string
  enabled: boolean
  supported: boolean
  policyDigest?: string
  subjectDigest?: string
  evidence: EvidenceItem[]
}

export interface PolicyDescriptor {
  policyVersion: string
  evaluatorRuleSet: string[]
  policyDigest: string
}

export interface SubjectSnapshot {
  subjectId: string
  subjectDigest: string
}

export interface DecisionTraceCounts {
  pass: number
  fail: number
  unknown: number
}

export interface CriterionEvaluationResult {
  criterionId: string
  verdict: CriterionVerdict
  policyVersion: 'r2b1-v1'
  ruleId: string
  decisionTrace: string[]
}
