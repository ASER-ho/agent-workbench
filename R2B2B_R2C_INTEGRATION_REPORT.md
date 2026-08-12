# R2B2B + R2C Controlled Verification — Integration Report

Branch: `feat/r2b2b-r2c-controlled-verification` (worktree `wt-r2b2b-r2c-integration`)
Base: `main` @ `1fa244a` (untouched)

## Cherry-picked prerequisite branches (A, B, C — all applied cleanly, no conflicts)

| Branch | SHAs (cherry-picked onto this branch) |
| --- | --- |
| A `feat/r2b2b-freshness` | `40870aa` test: define evidence freshness behavior, `458f54c` feat: add evidence freshness policy |
| B `feat/r2c-subject-snapshot` | `4d8e458` test: define subject snapshot capture, `3e900b7` feat: add fail-closed subject snapshot |
| C `feat/r2c-node-recipe` | `af57924` test: define node recipe validation, `82abb6e` feat: add trusted node executable discovery |

## Integration commits (Task 4/5/6/7)

| Commit | SHA | Scope |
| --- | --- | --- |
| Task 4/5/6 core | `46daa05` | shared execution types, IPC channels, `ControlledVerificationManager`, IPC handler, preload API |
| Task 6 tests | `d2afbc6` | `tests/unit/controlled-verification-manager.test.mts`, package.json scripts |
| Task 7 UI | `db24bbb` | `VerificationWorkbench.tsx`, `LocaleContext.tsx` |
| Task 7 E2E | `0c4558e` | `tests/electron/controlled-verification.e2e.spec.ts` |

## Full verification (Task 8)

| Command | Exit | Result |
| --- | --- | --- |
| `npm run build` | 0 | 3 chunks built (main / preload / renderer) |
| `npm run test:r2b2b-r2c` (manager + freshness + subject-snapshot + node-recipe) | 0 | 69 tests, 69 pass, 0 fail |
| `npm run test:criterion` | 0 | 30 tests, 30 pass, 0 fail |
| `npm run test:verification` | 0 | 21 tests, 21 pass, 0 fail |
| `npm run test:static` | 0 | 22 tests, 22 pass, 0 fail |
| `npx playwright test -c playwright.electron.config.ts controlled-verification.e2e.spec.ts` | 0 | 3 passed |
| `npm run test:electron` | 0 | 32 passed |
| Regression: `test:paths` `test:fs` `test:session` `test:action` `test:rollback` `test:navigation` `test:ipc-sender` `test:api-boundary` `test:brand` `test:smoke-harness` `test:credentials` | 0 | all green |

No real Agent launched. No push/tag/release performed.

## Truthful isolation declaration (reported to UI, no "sandboxed execution" claim)

- `PROCESS_BOUNDARY_ONLY` — child process boundary, no OS sandbox
- `NO_FILESYSTEM_SANDBOX` — no filesystem sandbox
- `NETWORK_NOT_ENFORCED` — network not restricted
- `ALLOWLISTED_ENVIRONMENT` — fixed environment allowlist
- `WORKSPACE_FIXED_CWD` — cwd fixed to workspace root

Execution: trusted `node.exe` (C branch discovery), `args = ['--test', <validated relative test path>]`, `cwd = workspaceRoot`, `shell = false`, timeout 30 s (override only in tests). Environment allowlist excludes names containing `TOKEN/SECRET/PASSWORD/API_KEY/AUTH/COOKIE/CREDENTIAL`. stdout/stderr each capped at 64 KiB, redacted before UI, truncation flagged, exit code and start/end times stored, cancel supported, process tree killed on app exit. Renderer can never supply executable/cwd/env/args/PID.

Result mapping: exit 0 → PASS (VERIFIED); non-zero → FAIL (FAILED); timeout → UNKNOWN + `EXECUTION_TIMEOUT`; cancel → UNKNOWN + `EXECUTION_CANCELLED`; spawn failure → UNKNOWN + `EXECUTION_ERROR`; the last three → `INSUFFICIENT_EVIDENCE` (not acceptance failure).

Fail-closed subject binding: pre-execution snapshot must equal the preview-bound `subjectDigest` (else `CONFIRMATION_STALE`); post-execution snapshot must match the pre snapshot (else `SUBJECT_CHANGED_DURING_VERIFICATION`, evidence `valid=false`, criterion cannot be VERIFIED).

Evidence freshness: `observedAt` = command completion time, `evaluationAsOf` = final code-state review time, both recorded by main; evaluator consumes only explicit inputs; `freshnessPolicy = { policyId: 'evidence-freshness-v1', maxAgeMs: 300000 }` (renderer cannot change).

## File inventory

Added:
- `src/shared/controlled-verification-execution-types.ts`
- `src/main/services/controlled-verification-manager.ts`
- `src/main/ipc/controlled-verification.ts`
- `tests/unit/controlled-verification-manager.test.mts`
- `tests/electron/controlled-verification.e2e.spec.ts`

Small-scope modifications:
- `src/shared/ipc-types.ts` (3 IPC channels)
- `src/main/ipc/index.ts` (register handler)
- `src/preload/index.ts` (expose API)
- `src/renderer/components/editors/VerificationWorkbench.tsx` (preview/execute UI)
- `src/renderer/contexts/LocaleContext.tsx` (zh/en copy)
- `package.json` (targeted test scripts only, no deps)

Not touched: Runtime, PTY, Provider, Session, TerminalPanel, Agent Adapter, old Agent API, Workspace Foundation semantics.

## Final state

Working tree clean. `main` remains at `1fa244a` — not moved. No commit on this branch touches anything outside the listed files.
