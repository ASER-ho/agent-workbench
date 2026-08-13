# Agent Workbench 0.1.3 Release Notes Draft

Status: local Release Candidate; not released, published, tagged, or uploaded.

## Trusted Observation

- Observation remains opt-in and off by default.
- Claude Code Hooks/transcripts and Codex transcripts are normalized in Main and projected through display-safe IPC.
- Hook health distinguishes not installed, healthy, endpoint drift, server unavailable, and watcher error.
- Existing AW Hook endpoint credentials can be recovered on restart; incompatible drift is visible and requires preview plus confirmation to repair.
- Precise uninstall removes only Agent Workbench entries and preserves unrelated settings.

## Bounded Auto Verification

- Auto Verification is an in-memory, single-use authorization lease.
- It binds workspace identity, remembered contract digest/generation, exact registered recipe set, and `session:end`.
- The lease is consumed before verification and remains consumed after failure, cancellation, timeout, or duplicate trigger delivery.
- Workspace, contract, recipe, Observation, user, and app-lifecycle changes revoke authority fail-closed.

## Audit and privacy

- Grant, revoke, consume, start, completed, and failed events are locally audited.
- Full session IDs are replaced by a fixed-length SHA-256 digest prefix.
- Audit, authorization, Hook health, and repair preview exclude full cwd, transcript paths, raw content, tool input/output, and Hook tokens.
- Critical pre-run audit failure prevents automatic execution; post-result failure is visible as degraded audit health.

## Verification semantics

R2 deterministic verification semantics are unchanged. `VERIFIED` remains distinct from human acceptance and `AcceptanceDecision` remains `NOT_RECORDED`.

## Explicit exclusions

0.1.3 does not add History UI, Action Queue, Agent Claim, Human Acceptance, providers, Agent launch, terminal control, multi-workspace operation, cloud sync, signing, sandboxing, or container verification.

Final source HEAD/tree, test battery, Electron E2E, packaged smoke, artifact size, and SHA-256 belong in `docs/releases/0.1.3/RELEASE_READINESS.md` only after fresh local completion.
