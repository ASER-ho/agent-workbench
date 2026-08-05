// Display-safe Handoff Markdown renderer.
// Pure function: identical Receipt produces identical Markdown. No fs, network,
// time, Electron, Agent, or LLM access. The output contains only display-safe
// values already present in the Receipt — never absolute paths, raw secrets, or
// unredacted command output.
import type { VerificationReceipt } from './verification-receipt-types.ts'
import { makeDisplaySafe } from './display-sanitize.ts'

const ISOLATION_LIMITATIONS = [
  'PROCESS_BOUNDARY_ONLY',
  'NO_FILESYSTEM_SANDBOX',
  'NETWORK_NOT_ENFORCED',
  'ALLOWLISTED_ENVIRONMENT',
  'WORKSPACE_FIXED_CWD'
]

// Fixed template strings are NOT escaped (they are program-generated).
// Every user-controlled value passes through makeDisplaySafe (redact then escape).

/** Renders a fixed-structure, display-safe Handoff Markdown document. */
export function renderHandoffMarkdown(receipt: VerificationReceipt): string {
  const lines: string[] = []

  lines.push('# Agent Workbench Verification Handoff')
  lines.push('')
  lines.push('## 1. Verification Summary')
  lines.push('')
  lines.push(`Overall Verification Verdict: ${receipt.overallVerdict}`)
  lines.push(`Receipt Schema: ${receipt.schemaVersion}`)
  lines.push(`Verification rule: ${receipt.criterionResults.map(c => makeDisplaySafe(c.ruleId)).join(', ') || 'none'}`)
  lines.push('')
  lines.push('## 2. Contract and Criteria')
  lines.push('')
  lines.push(`Contract ID: ${makeDisplaySafe(receipt.contract.contractId)}`)
  lines.push(`Contract Digest: ${makeDisplaySafe(receipt.contract.contractDigest)}`)
  for (const criterion of receipt.contract.criteria) {
    lines.push(`- ${makeDisplaySafe(criterion.criterionId)}: ${makeDisplaySafe(criterion.title)}`)
  }
  lines.push('')
  lines.push('## 3. Verified Code Subject')
  lines.push('')
  lines.push(`Subject Digest: ${makeDisplaySafe(receipt.subject.subjectDigest)}`)
  lines.push(`HEAD: ${receipt.subject.headOid === null ? 'null' : makeDisplaySafe(receipt.subject.headOid)}`)
  lines.push(`Snapshot Complete: ${receipt.subject.complete ? 'yes' : 'no'}`)
  lines.push('')
  lines.push('## 4. Verification Command')
  lines.push('')
  lines.push(`Recipe: ${makeDisplaySafe(receipt.verification.recipeType)}`)
  lines.push(`Command: ${makeDisplaySafe(receipt.verification.displaySafeCommand)}`)
  lines.push(`Execution Status: ${makeDisplaySafe(receipt.verification.executionStatus)}`)
  lines.push(`Exit Code: ${receipt.verification.exitCode === null ? 'n/a' : receipt.verification.exitCode}`)
  lines.push(`Isolation: ${makeDisplaySafe(receipt.verification.isolationLevel)}`)
  lines.push(`Output Truncated: ${receipt.verification.outputTruncated ? 'yes' : 'no'}`)
  lines.push('')
  lines.push('## 5. Criterion Results')
  lines.push('')
  if (receipt.criterionResults.length === 0) {
    lines.push('No criteria evaluated.')
  } else {
    for (const criterion of receipt.criterionResults) {
      lines.push(`- ${makeDisplaySafe(criterion.criterionId)}: ${criterion.verdict} (rule ${makeDisplaySafe(criterion.ruleId)})`)
    }
  }
  lines.push('')
  lines.push('## 6. Evidence Exclusions')
  lines.push('')
  const exclusions = receipt.evidence.filter(e => e.exclusionReason !== null)
  if (exclusions.length === 0) {
    lines.push('No evidence exclusions recorded.')
  } else {
    for (const evidence of exclusions) {
      lines.push(`- ${makeDisplaySafe(evidence.evidenceId)}: ${makeDisplaySafe(evidence.exclusionReason ?? '')}`)
    }
  }
  lines.push('')
  lines.push('## 7. Unresolved Items')
  lines.push('')
  if (receipt.unresolvedItems.length === 0) {
    lines.push('No unresolved items recorded.')
  } else {
    for (const item of receipt.unresolvedItems) {
      lines.push(`- ${makeDisplaySafe(item)}`)
    }
  }
  lines.push('')
  lines.push('## 8. Acceptance Decision')
  lines.push('')
  lines.push(`Acceptance Decision: ${receipt.acceptanceDecision}`)
  lines.push('')
  lines.push('A VERIFIED verification verdict is not an ACCEPT, SHARE, or RELEASE decision.')
  lines.push('')
  lines.push('## 9. Isolation and Safety Limitations')
  lines.push('')
  lines.push(`Isolation Level: ${makeDisplaySafe(receipt.verification.isolationLevel)}`)
  for (const limitation of ISOLATION_LIMITATIONS) {
    lines.push(`- ${limitation}`)
  }
  lines.push('')
  lines.push('This is not a sandboxed execution. Network, filesystem, and credentials are not isolated by an OS sandbox.')
  lines.push('')
  lines.push('## 10. Receipt Identity')
  lines.push('')
  lines.push(`Receipt Digest: ${makeDisplaySafe(receipt.receiptDigest)}`)
  lines.push(`Policy Digest: ${makeDisplaySafe(receipt.policy.policyDigest)}`)
  lines.push(`Policy Version: ${makeDisplaySafe(receipt.policy.policyVersion)}`)
  lines.push(`Freshness Policy: ${makeDisplaySafe(receipt.policy.freshnessPolicyId)}`)

  return lines.join('\n')
}
