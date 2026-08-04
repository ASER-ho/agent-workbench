// Controlled verification types: Subject Snapshot.
// This module must stay pure TypeScript (no runtime imports) so it can be
// shared between the main process and any verification consumers.
// Only Subject-related types live here; policy/evaluator types belong to the
// integration stage and must not be added to this file.

/**
 * A fail-closed, deterministic capture of a repository's current code state.
 * Every field is a SHA-256 over stably ordered, canonicalized input.
 * `complete: false` means the snapshot must NOT be used as evidence.
 */
export interface VerificationSubjectSnapshot {
  repositoryIdentityDigest: string
  headOid: string | null
  stagedDiffDigest: string
  unstagedDiffDigest: string
  untrackedContentDigest: string
  subjectDigest: string
  complete: boolean
  /** First fail-closed reason, present only when `complete` is false. */
  exclusion?: SubjectSnapshotExclusion
}

/**
 * Fail-closed reasons. A snapshot with any exclusion must be treated as
 * non-evidence: the capture is incomplete, ambiguous, or changed mid-flight.
 */
export type SubjectSnapshotExclusion =
  | 'DIFF_LIMIT_EXCEEDED'
  | 'UNTRACKED_LIMIT_EXCEEDED'
  | 'FILE_CHANGED_DURING_CAPTURE'
  | 'PATH_ESCAPE'
  | 'UNSAFE_SYMLINK_OR_REPARSE'
  | 'SNAPSHOT_INCOMPLETE'
