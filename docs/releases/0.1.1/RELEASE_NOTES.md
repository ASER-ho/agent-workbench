# Agent Workbench 0.1.1 Release Notes

- Version: `0.1.1`
- Artifact source commit: `09233a1a7c93f10b889e0d6edf90e10acdf6d38c`
- Build date: 2026-08-05
- Platform: Windows x64
- Artifact signature: **unsigned** (Authenticode NotSigned)
- Release status: **local release candidate** — not pushed, not tagged, not published
- Note: `0.1.1` supersedes the previously tagged `v0.1.0-alpha.1` (built from `2658c0e`, before the R2 work). GitHub publication, if authorized, may mark this as a Prerelease, but the software version is `0.1.1`.

## What this is

An Agent-neutral, deterministic, traceable local verification workbench. This candidate ships the completed R2 minimum independent acceptance loop: a controlled `node --test` run is turned into a bound-evidence receipt and a display-safe Markdown handoff.

## What's included

- **Verification Contract** creation against a Git workspace.
- **Subject Snapshot** binding (taken before and after the controlled run).
- **Controlled Verification** executing `node --test` as a fixed, non-shell child process.
- **Bound Evidence** and **Evidence Freshness** against the binding policy.
- **Deterministic Criterion Evaluator** and **Overall Verdict**.
- **JSON Receipt** with a receipt digest, built only from the same confirmation's completed verification record; duplicate identifiers are fail-closed.
- **Markdown Handoff**: display-safe, escaped export of the receipt.
- **Export boundary**: the renderer cannot supply an output path; packaged apps always use the system save dialog (E2E export-dir override is a non-packaged test hook only).
- **One-time confirmation**: single-consumption, concurrent/duplicate rejections.

## What was verified

- Full test suite green: 238 unit/static tests + 34 Electron E2E + targeted receipt-handoff E2E (see RELEASE_READINESS.md for the table).
- **Installed-artifact 19-step smoke passed**: the shipped installer was installed, launched, driven through a real contract → preview → confirm → `node --test` → VERIFIED → JSON Receipt → Markdown Handoff flow, exports read back, the `receiptDigest` independently recomputed and matched, `acceptanceDecision` confirmed `NOT_RECORDED`, no secret/absolute-path/`node.exe` leakage, clean exit, no residual processes, then uninstalled and the install directory removed.
- Packaged bundles contain no private paths, no credentials, no leaked test fixtures, and no source maps.

## Known limitations (user-facing)

- **Windows x64 only** is release-qualified.
- Only the **controlled `node --test` recipe** is supported — no arbitrary shell, no PTY runtime, no external Agent launch.
- **No filesystem sandbox** (`NO_FILESYSTEM_SANDBOX`) and **no network isolation** (`NETWORK_NOT_ENFORCED`). The verified child runs as a separate process (`PROCESS_BOUNDARY_ONLY`).
- **`VERIFIED` does not equal `ACCEPTED`.** Acceptance decision stays `NOT_RECORDED`; the app never auto-accepts, auto-shares, or auto-releases.
- The installer is **not code-signed**; Windows may show unknown-publisher warnings.
- No automatic update delivery, crash reporting, or telemetry.

## Security boundaries (brief)

- Renderer cannot supply an output path or control packaged state; the Main process owns path selection and writes atomically.
- Test file selection is constrained to safe `.js`/`.mjs`/`.cjs` files, with junction/symlink escape protection.
- One-time confirmation required; receipt/evidence duplicate IDs are fail-closed; user text is display-safe sanitized and Markdown/HTML escaped.
- API keys, tokens, passwords, and full sensitive local paths never appear in UI, exported receipts/handoffs, or packaged bundles.
- See RELEASE_READINESS.md for the full boundary.

## What this release does NOT claim

Not an enterprise filesystem sandbox, not a general IDE, not an Agent Runtime, not a cloud platform, not an auto-release tool, and not an automatic acceptance-decision tool. `VERIFIED` does not imply `ACCEPTED`, `SHARED`, or `RELEASED`.

## Artifacts

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.1.exe` | 105,152,316 bytes | `5fa703437bb0b961167171f41fa7390dbd85d561b8794707d2af39fc6abf2514` |
| `Agent Workbench Setup 0.1.1.exe.blockmap` | 109,773 bytes | `ca78ef75465c822e5d4d332950a36db8477f82f22d360f492aa8110203d2e789` |
| `app.asar` | 4,316,055 bytes | `91612a1b6b331581f2005eebd9903d6f26e40ae0910f45fa09fd1dc608682bdb` |
| `win-unpacked/Agent Workbench.exe` | 232,546,816 bytes | `47e5373c779b164dc0a375fd37a228fc9b8980ccf9d338bd8fffd32ce175618b` |

Verify against `SHA256SUMS-0.1.1.txt` before installation.

## License

MIT. See [`LICENSE`](../../../LICENSE).
