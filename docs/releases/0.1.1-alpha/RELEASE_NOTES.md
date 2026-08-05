# Agent Workbench 0.1.1-alpha Release Notes

- Version: `0.1.1-alpha`
- Build source commit: `33432dbd08e40ba5b952ecb7532f8534dc1c7e94`
- Build date: 2026-08-05
- Platform: Windows x64
- Artifact signature: **unsigned** (Authenticode NotSigned)
- Release status: **local Alpha release candidate** — not pushed, not tagged, not published

> Versioning note: `0.1.1-alpha` is a new version, distinct from the previously tagged `v0.1.0-alpha.1` (which was built from `2658c0e`, before the R2 work). Verify the SHA-256 checksums below before running the installer.

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
- Packaged artifact installs, launches, exports, and exits cleanly; no residual processes.
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
| `Agent Workbench Setup 0.1.1-alpha.exe` | 105,152,179 bytes | `7a4cbd0b23a43427a9ce7b06bab674e55d1d4cf35d3d5732a9ca1e8b7405fbba` |
| `Agent Workbench Setup 0.1.1-alpha.exe.blockmap` | 109,906 bytes | `497f781fe3240e220a7c7c1aaced03a4abb210b9ba5a4a5fa9105e2050ad6931` |
| `app.asar` | 4,316,061 bytes | `e93e7395dc01d6145d6c96610549b1eb7a8e45005cf900a436c592c18aa68fca` |

Verify against `SHA256SUMS-0.1.1-alpha.txt` before installation.

## License

MIT. See [`LICENSE`](../../../LICENSE).
