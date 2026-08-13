# Auto-Verification Security Model

Status: Draft — Agent Workbench 0.1.3

## 1. Problem statement

The interactive Verification Workbench (DEFINE → REVIEW → **VERIFY**) requires a human
confirmation for every run. Auto-verification runs a verification **without interactive
confirmation** when an observed session ends. This intentionally changes R2's
human-confirmation semantics and therefore needs an explicit, documented authorization
model — not just a button.

## 2. Current implementation (0.1.3)

`AutoVerifier` (main/services/observation/auto-verifier.ts) executes only when **every**
gate holds:

1. `autoVerifyEnabled` is true (user toggled; the UI checkbox is bound to backend state).
2. The observed event is `session:end`.
3. `workspaceOnly`: observed `cwd` equals the selected workspace (`cwdEquals`).
4. The recipe id is a member of `REGISTERED_RECIPES` (hardcoded code-level allowlist).
5. A remembered `VerificationContract` exists (captured when the user generated a preview).
6. Execution is delegated to the same `ControlledVerificationManager` (fixed `node --test`
   command on a whitelisted relative test path, allowlisted env, fail-closed snapshot).

Provenance: `VerificationCompletedPayload.trigger` is `'auto:session-end'` (vs `'manual'`)
and is shown in the Observation panel.

## 3. Security principles

- Auto-verification **never executes commands from transcripts or hooks** — only
  `REGISTERED_RECIPES` test paths.
- It does not auto-approve permissions, spawn agents, or write outside the workspace test
  target.
- Its blast radius is bounded: running a fixed `node --test` on a code-level-whitelisted
  relative test path, inside the selected workspace.

## 4. Authorization model (trusted auto-verification)

Definition: the user pre-authorizes a bounded action (recipe × workspace) and a specific
trigger (session end) runs it without further confirmation.

**Authorization holds when all of:**
- `autoVerifyEnabled = true`
- recipe whitelist non-empty and ⊆ `REGISTERED_RECIPES`
- `workspaceOnly` on; observed cwd === selected workspace
- a contract is captured (records what the user intends to verify)

**Revocation — any of the following invalidates the authorization:**
- toggling auto-verify off
- changing or emptying the recipe whitelist
- changing the selected workspace
- generating a new preview (the remembered contract is replaced)

The current implementation already satisfies this model; the gates are the authorization,
and each gate change is a revocation.

## 5. Visible state (implemented)

- `ObservationStatus.autoVerify` carries the live backend settings.
- The panel checkbox is bound to that state (no hardcoded value).
- Enabling observation shows the exact directories that will be watched.
- The last receipt shows its trigger (`auto:session-end` vs `manual`).

## 6. Receipt provenance

- `VerificationCompletedPayload.trigger` distinguishes auto vs manual.
- The R2 receipt schema is frozen; provenance is carried in the observation layer and must
  not be back-ported into `verification-receipt-types.ts`.

## 7. Audit record (recommended follow-up, not yet implemented)

Proposed: an append-only JSONL at `app.getPath('userData')/observation-audit.jsonl` with
one line per auto-run:

```json
{ "ts": 1723000000000, "trigger": "auto:session-end", "recipeId": "project-default-check",
  "workspaceDisplayId": "...", "sessionIdPrefix": "abc123", "verdict": "VERIFIED" }
```

Rules: never full paths, secrets, or tool input. The file is a local audit trail, not a
claim of integrity. Exposing it in the UI is a separate product decision.

## 8. Explicit non-goals

- Runtime-defined recipes (the registry is code-level only).
- Auto-approval of any permission prompt.
- Silent execution before the user explicitly enables auto-verify.

## 9. Open questions (product decisions)

1. Should the remembered contract expire (e.g. per-session or per-N runs) instead of
   persisting until the next preview?
2. Should the audit file be surfaced in the UI / exportable?
3. Should the panel show per-recipe run count / last run time?
