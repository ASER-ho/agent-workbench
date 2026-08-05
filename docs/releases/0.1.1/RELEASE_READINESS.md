# Agent Workbench 0.1.1 — Release Readiness

Status:

```
AW_0_1_1_LOCAL_RELEASE_CANDIDATE_READY
AW_0_1_1_ARTIFACTS_VERIFIED
AW_0_1_1_RELEASE_EVIDENCE_COMMITTED
REMOTE_NOT_UPDATED
PUSH_TAG_RELEASE_AUTHORIZATION_REQUIRED
```

## Commit distinctions

| Commit | SHA |
| --- | --- |
| `artifactSourceCommit` (branch HEAD the binary was built from) | `09233a1a7c93f10b889e0d6edf90e10acdf6d38c` |
| `releaseMetadataCommit` (this document / release-evidence commit) | `docs: finalize 0.1.1 release evidence` (this commit; full SHA recorded in the final acceptance report) |
| `main` commit | `6b1f39b1d2ebb7b884b75a0aa5bcbbcce9b3e477` |
| `origin/main` | `2a96fc4d72382335f27f946c8ea353be69c7cebf` (unchanged, not pushed; main is 38 commits ahead) |
| current release branch HEAD | `release/r2-alpha-readiness` (after this commit) |

Tags: only `v0.1.0-alpha.1` → `3fb72071ae5a89934efce0b02f74fab4e1a2d1a5` (pre-existing; no new tag).

## Repository facts

| Item | Value |
| --- | --- |
| Version (package.json / package-lock.json) | `0.1.1` |
| Artifact source tree | `8c9b10205d1c0451746762abba4f263e41a3e8e0` (parent tree of the build commit) |
| Working tree | clean after the release-evidence commit (artifacts and `dist-0.1.1/` are gitignored) |

## Full test results (on the 0.1.1 code)

| Command | Tests | PASS | FAIL | SKIP | Exit | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm run build` | — | — | — | — | 0 | ~1.2s |
| `npm run test:r2d` | 48 | 48 | 0 | 0 | 0 | — |
| `npm run test:r2b2b-r2c` | 79 | 79 | 0 | 0 | 0 | — |
| `npm run test:criterion` | 30 | 30 | 0 | 0 | 0 | — |
| `npm run test:verification` | 21 | 21 | 0 | 0 | 0 | — |
| `npm run test:ipc-sender` | 2 | 2 | 0 | 0 | 0 | — |
| `npm run test:static` | 22 | 22 | 0 | 0 | 0 | — |
| `npm run test:privacy` | files=99 | matches=0 | — | — | 0 | — |
| `npm run test:electron` | 34 | 34 | 0 | 0 | 0 | ~1.4m |
| `npx playwright … verification-receipt-handoff.e2e.spec.ts` | 2 | 2 | 0 | 0 | 0 | ~9.9s |

Total: 238 unit/static + 34 Electron E2E + 2 targeted E2E, all PASS, no SKIP.

## Acceptance-flow coverage

- VERIFIED outcome: receipt-handoff e2e passing case; **and the installed-artifact smoke below**.
- FAILED outcome: receipt-handoff e2e failing case → non-VERIFIED receipt.
- Timeout / cancel: `stage-b` e2e `__TIMEOUT__` → `response_timeout`; cancel button path.
- Preview immutability and stale-on-change: `controlled-verification` e2e.
- No raw path / Agent exposure: `verification-slice` e2e.
- `NOT_RECORDED`: receipt builder unit tests + installed smoke.

## Installed-artifact smoke (19 steps, `dist-0.1.1/Agent Workbench Setup 0.1.1.exe`)

Run against the **shipped installer** (silent install), not the dev environment.

1. Install 0.1.1 — PASS (exit 0, install dir + exe present).
2. Displayed version `0.1.1` — PASS (`app.getVersion() === '0.1.1'`).
3. Launch — PASS (window "Agent Workbench", responding).
4. Select temp Git workspace (fixture) — PASS.
5. Create minimal Verification Contract — PASS.
6. Safe `.mjs` test file — PASS.
7. Preview — PASS (fixed command shown).
8. Confirm and run real `node --test` — PASS.
9. VERIFIED — PASS.
10. Export JSON Receipt — PASS (file written and read back).
11. Export Markdown Handoff — PASS (header + verdict present).
12. Read back export — PASS (schema v1, verdict VERIFIED).
13. **Independently recomputed `receiptDigest`** — PASS (SHA-256 over `VERIFICATION_RECEIPT_DIGEST_PREFIX + canonicalReceiptStringify(receipt minus receiptDigest)` equals the exported digest).
14. `acceptanceDecision === 'NOT_RECORDED'` — PASS (JSON + Markdown).
15. No secrets / workspace absolute path / `node.exe` private path — PASS (JSON + Markdown).
16. Exit — PASS (graceful close).
17. No residual Agent Workbench / verification Node processes — PASS.
18. Uninstall — PASS (exit 0).
19. Install directory removed — PASS.

FAILED / timeout / cancel outcomes were not re-driven manually on the installer; existing automated E2E is the evidence for those (as agreed).

## Artifacts (0.1.1)

Output directory: `dist-0.1.1/` (separate from `dist/`, so the older `0.1.0-alpha.1` artifacts are untouched).

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.1.exe` (NSIS installer) | 105,152,316 B | `5fa703437bb0b961167171f41fa7390dbd85d561b8794707d2af39fc6abf2514` |
| `Agent Workbench Setup 0.1.1.exe.blockmap` | 109,773 B | `ca78ef75465c822e5d4d332950a36db8477f82f22d360f492aa8110203d2e789` |
| `app.asar` | 4,316,055 B | `91612a1b6b331581f2005eebd9903d6f26e40ae0910f45fa09fd1dc608682bdb` |
| `win-unpacked/Agent Workbench.exe` | 232,546,816 B | `47e5373c779b164dc0a375fd37a228fc9b8980ccf9d338bd8fffd32ce175618b` |

- Build source: `09233a1a7c93f10b889e0d6edf90e10acdf6d38c`
- Toolchain: node `v22.14.0` / npm `10.9.2` / Electron `42.4.1` / electron-builder `26.15.3`
- **Signed: No** (Authenticode NotSigned)
- Installer: yes (NSIS, per-user, `oneClick=false`, directory selectable)
- Portable: no
- Checksum manifest: `SHA256SUMS-0.1.1.txt` (verified with `sha256sum -c`; the older `SHA256SUMS-0.1.1-alpha.txt` and `SHA256SUMS.txt` records are not overwritten).

## Secret / private-path scan

- `test:privacy` over `src` + `out`: PASS (99 files, 0 private-path matches).
- No `.map` files shipped (excluded via `!**/*.map`).
- Packaged bundles contain no actual credentials (no long `sk-…` tokens, no PEM private keys, no real passwords); hits are legitimate API-key-management code identifiers.
- No private absolute paths (`C:\Users\…`, `F:\GW\…`, `node-v22`) in packaged bundles.
- No test/fixture/E2E/probe files packaged in `app.asar`.
- E2E export-dir override unreachable in a packaged app: main bundle wires `app.isPackaged`; constructor default is fail-closed `() => true`; verified by unit tests, independent review, probes, and the installed-artifact smoke.

## Security boundaries (full)

### Verification / execution
- `node --test` runs as a fixed child process (`shell: false`), fixed command, fixed arguments. Isolation is `PROCESS_BOUNDARY_ONLY`; **no filesystem sandbox** (`NO_FILESYSTEM_SANDBOX`); **no network isolation** (`NETWORK_NOT_ENFORCED`).
- Test file selection constrained to safe `.js`/`.mjs`/`.cjs` files; junction/symlink escape protection.
- One-time confirmation, single-consumption; concurrent/duplicate rejections; timeout and cancel observable; child process cleanup verified.

### Evidence / receipt
- Receipt built only from the same confirmation's `CompletedVerificationRecord` (no execution/contract mixing).
- Duplicate criterion/evidence IDs fail-closed; receipt digest deterministic and binds policy, subject, evidence.
- Overall Verdict deterministic (rule-based). **`VERIFIED` does not equal `ACCEPTED`**; acceptance stays `NOT_RECORDED`.

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
  1. Artifact unsigned (expected for Alpha/0.1.1 local; SmartScreen will warn).
  2. Static MAJOR-4 wiring test regex-coupled to source formatting (cosmetic).
  3. `npm` package metadata still has no author field.

## GO / NO-GO

**GO** for a *local* release candidate.

```
AW_0_1_1_LOCAL_RELEASE_CANDIDATE_READY
AW_0_1_1_ARTIFACTS_VERIFIED
AW_0_1_1_RELEASE_EVIDENCE_COMMITTED
REMOTE_NOT_UPDATED
PUSH_TAG_RELEASE_AUTHORIZATION_REQUIRED
```

## Recommendations

- **Merged to main: yes.**
  - Main release metadata commit: `c66bf8cfb3eeaf57245a45070c3aed2fde4b9af1`
  - Main tree: `b7f76ca52295a612d5823bd35a9b9b2825988b44`
  - Artifact source commit: `09233a1a7c93f10b889e0d6edf90e10acdf6d38c`
  - Remote status: not pushed at the time this report was finalized
- Create `v0.1.1` tag: **not yet** — requires authorization.
- Create GitHub Prerelease: **not yet** — requires authorization.
- Push: **not performed**; origin/main unchanged.
