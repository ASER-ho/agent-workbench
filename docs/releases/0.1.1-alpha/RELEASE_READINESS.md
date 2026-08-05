# Agent Workbench 0.1.1-alpha — Release Readiness

Status:

```
AW_R2_0_1_1_ALPHA_LOCAL_RELEASE_CANDIDATE_READY
REMOTE_NOT_UPDATED
PUSH_TAG_RELEASE_AUTHORIZATION_REQUIRED
```

## Repository facts

| Item | Value |
| --- | --- |
| Candidate build source (branch HEAD) | `33432dbd08e40ba5b952ecb7532f8534dc1c7e94` |
| Candidate tree | `8c9b10205d1c0451746762abba4f263e41a3e8e0` |
| main | `6b1f39b1d2ebb7b884b75a0aa5bcbbcce9b3e477` |
| origin/main | `2a96fc4d72382335f27f946c8ea353be69c7cebf` (unchanged, not pushed) |
| origin/main..main ahead | 38 commits |
| Release branch | `release/r2-alpha-readiness` |
| Tags | only `v0.1.0-alpha.1` → `3fb72071ae5a89934efce0b02f74fab4e1a2d1a5` (pre-existing; no new tag) |

## Full test results

Run on the R2 code (identical code, version bump only changed `package.json`/lockfile version fields):

| Command | Tests | PASS | FAIL | SKIP | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| `npm run build` | — | — | — | — | 0 |
| `npm run test:r2d` | 48 | 48 | 0 | 0 | 0 |
| `npm run test:r2b2b-r2c` | 79 | 79 | 0 | 0 | 0 |
| `npm run test:criterion` | 30 | 30 | 0 | 0 | 0 |
| `npm run test:verification` | 21 | 21 | 0 | 0 | 0 |
| `npm run test:ipc-sender` | 2 | 2 | 0 | 0 | 0 |
| `npm run test:static` | 22 | 22 | 0 | 0 | 0 |
| `npm run test:electron` | 34 | 34 | 0 | 0 | 0 |
| `npx playwright … verification-receipt-handoff.e2e.spec.ts` | 2 | 2 | 0 | 0 | 0 |
| `npm run test:privacy` (src+out) | files=99 | matches=0 | — | — | 0 |

Total: 238 unit/static + 34 Electron E2E + 2 targeted E2E, all PASS, no SKIP.

## Acceptance flow coverage (real Electron app, E2E)

- VERIFIED outcome: `verification-receipt-handoff.e2e.spec.ts` passing case → JSON Receipt + Markdown Handoff exported and read back.
- FAILED outcome: same spec failing case → non-VERIFIED receipt; `controlled-verification.e2e.spec.ts` FAIL mapping.
- Timeout / cancel: `stage-b.e2e.spec.ts` `__TIMEOUT__` → `response_timeout`; cancel button path.
- Preview immutability and stale-on-change: `controlled-verification.e2e.spec.ts`.
- No raw path / Agent exposure: `verification-slice.e2e.spec.ts`.
- Acceptance Decision `NOT_RECORDED`: receipt builder unit tests (`test:r2d`).

## Desktop smoke

| Check | Result |
| --- | --- |
| Silent install (`/S`) of `0.1.0-alpha.1` installer build | PASS (exit 0) |
| Installed app launch | PASS (window "Agent Workbench", responding) |
| Graceful close | PASS |
| Silent uninstall | PASS (exit 0, install dir removed) |
| `0.1.1-alpha` packaged app launch | PASS (window "Agent Workbench", responding, graceful exit) |
| Residual processes after exit | none |

## Artifacts (0.1.1-alpha)

Output directory: `dist-0.1.1-alpha/` (separate from `dist/`, so the older `0.1.0-alpha.1` build artifacts are untouched).

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.1-alpha.exe` (NSIS installer) | 105,152,179 B | `7a4cbd0b23a43427a9ce7b06bab674e55d1d4cf35d3d5732a9ca1e8b7405fbba` |
| `Agent Workbench Setup 0.1.1-alpha.exe.blockmap` | 109,906 B | `497f781fe3240e220a7c7c1aaced03a4abb210b9ba5a4a5fa9105e2050ad6931` |
| `app.asar` | 4,316,061 B | `e93e7395dc01d6145d6c96610549b1eb7a8e45005cf900a436c592c18aa68fca` |
| `win-unpacked/Agent Workbench.exe` | — | `e1a08ecc290bb2ea3e5a8f16ae3b4731270805c1eb3c676a9a00ce318866a55c` |

- Build source: `33432dbd08e40ba5b952ecb7532f8534dc1c7e94`
- Toolchain: node `v22.14.0` / npm `10.9.2` / Electron `42.4.1` / electron-builder `26.15.3`
- **Signed: No** (Authenticode NotSigned)
- Installer: yes (NSIS, per-user, `oneClick=false`, directory selectable)
- Portable: no
- Checksum manifest: `SHA256SUMS-0.1.1-alpha.txt` (new file; the older `SHA256SUMS.txt` for `0.1.0-alpha.1` is untouched)

## Secret / private-path scan

- `test:privacy` over `src` + `out`: PASS (99 files, 0 private-path matches).
- No `.map` files shipped (excluded via `!**/*.map`).
- Packaged bundles contain no actual credentials (no long `sk-…` tokens, no PEM private keys, no real passwords); hits are legitimate API-key-management code identifiers.
- No private absolute paths (`C:\Users\…`, `F:\GW\…`, `node-v22`) in packaged bundles.
- No test/fixture/E2E/probe files packaged in `app.asar`.
- E2E export-dir override unreachable in a packaged app: main bundle wires `app.isPackaged`; constructor default is fail-closed `() => true`; verified by unit tests, independent review, and probes.

## Security boundaries (full)

### Verification / execution
- `node --test` runs as a fixed child process (`shell: false`), fixed command, fixed arguments. Isolation is `PROCESS_BOUNDARY_ONLY`; no filesystem sandbox (`NO_FILESYSTEM_SANDBOX`); no network isolation (`NETWORK_NOT_ENFORCED`).
- Test file selection constrained to safe `.js`/`.mjs`/`.cjs` files; junction/symlink escape protection.
- One-time confirmation, single-consumption; concurrent/duplicate rejections; timeout and cancel observable; child process cleanup verified.

### Evidence / receipt
- Receipt built only from the same confirmation's `CompletedVerificationRecord` (no execution/contract mixing).
- Duplicate criterion/evidence IDs fail-closed; receipt digest deterministic and binds policy, subject, evidence.
- Overall Verdict deterministic (rule-based). `VERIFIED` does not equal `ACCEPTED`; acceptance stays `NOT_RECORDED`.

### Export
- Renderer requests only an export kind; cannot supply an output path.
- Main owns path selection (system save dialog), validates extensions, rejects device/UNC paths, writes atomically.
- Packaged behavior fail-closed: default `isPackaged` is `() => true`; production passes `() => app.isPackaged`; E2E export-dir override reachable only when not packaged AND `AGENT_WORKBENCH_E2E === '1'` AND export-dir set.
- JSON user text display-safe sanitized; Markdown user text sanitized + Markdown/HTML escaped; export never mutates the receipt.

### Data / privacy
- No keys/tokens/passwords/full sensitive paths in UI, exports, or packaged bundles; source maps excluded; no test fixtures packaged; renderer context-isolated and sandboxed; privileged IPC restricted; navigation blocked.

### Publication
- Nothing pushed, tagged, released, or uploaded. Remote modification requires separate explicit authorization.

## Findings

- **BLOCKER: none.**
- **MAJOR: none.**
- **MINOR:**
  1. Artifact unsigned (expected for Alpha; SmartScreen will warn).
  2. Static MAJOR-4 wiring test regex-coupled to source formatting (cosmetic).
  3. `npm` package metadata still has no author field.

## GO / NO-GO

**GO** for a *local* alpha candidate.

```
AW_R2_0_1_1_ALPHA_LOCAL_RELEASE_CANDIDATE_READY
REMOTE_NOT_UPDATED
PUSH_TAG_RELEASE_AUTHORIZATION_REQUIRED
```

## Recommendations

- Push: not performed (no authorization); origin/main unchanged.
- New tag: not created; assign when publication is authorized.
- Suggested release version (already applied): `0.1.1-alpha`.
