# Auto-Verification Security Model

Status: Agent Workbench 0.1.3 Release Candidate

## Purpose

Manual Verification requires a fresh human confirmation for every controlled run. Auto Verification intentionally differs: the user grants a narrowly bound, single-use authorization before a matching observed session ends. It does not weaken or replace the manual confirmation path.

## Authorization identity and bindings

`AutoVerificationAuthorization` is owned by Main and kept in memory only. It binds a random authorization ID, selected workspace identity/canonical cwd, remembered contract digest and generation, exact sorted registered recipe set, fixed `session:end` trigger, creation time, and state.

The renderer receives only a display-safe workspace ID, contract digest prefix, registered recipe IDs/labels, trigger, creation time, state, and revocation reason. Full cwd and full contract digest stay Main-only.

## Single-use lifetime

```text
explicit authorize -> AUTHORIZED
matching session:end -> CONSUMED before any await or verification work
-> controlled verification attempt -> automatic verification remains off
```

A consumed lease is never restored, including after controlled verification failure, timeout, cancellation, or a missing completed record. Duplicate `session:end` delivery cannot execute twice.

## Revocation

An authorized lease is revoked when the user disables it, the workspace changes or clears, a new verification preview replaces the remembered contract, the registered recipe set no longer contains its recipe, Observation is disabled, or the app exits. Authority is never transferred between workspaces.

## Controlled execution boundary

Only fixed recipes in `REGISTERED_RECIPES` can reach `ControlledVerificationManager`. Transcript and Hook commands are never executed. Authorization controls whether a run may start; R2 criterion evaluation, evidence binding/freshness, verdict, Receipt, Handoff, trusted Node resolution, and safe-path enforcement are unchanged.

## Audit model

The append-only local `observation-audit.jsonl` records `authorization_granted`, `authorization_revoked`, `authorization_consumed`, `auto_run_started`, `auto_run_completed`, and `auto_run_failed`.

Records contain minimized fields: authorization ID, trigger, recipe IDs, display-safe workspace ID, contract digest prefix, fixed verdict/reason fields, and a 16-character SHA-256 prefix of the source session ID. They never contain full cwd, transcript paths, raw transcript, tool input/output, tokens, bearer headers, full Hook URLs, SecretStore content, or full session IDs.

The file is append-only by application behavior, not cryptographically tamper-proof.

## Audit failure semantics

Grant, consume, and start records are critical authorization evidence. If a critical write fails, automatic execution fails closed. A consume/start audit failure leaves the lease consumed.

If result audit fails after verification completed, the completed fact is not rewritten. Audit health becomes `DEGRADED` and the UI exposes the error.

## Explicit non-goals

No runtime/transcript-defined recipes, automatic permission approval, persistent/multi-use authorization, history UI, action queue, Agent launch, provider control, terminal control, or multi-agent orchestration.
