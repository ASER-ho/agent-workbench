# Agent Workbench 0.1.2 Release Notes

- Version: `0.1.2`
- Branch: `main` (HEAD `c62ef79abb5d64e059112fcf71abf5ea298a3fea`)
- Published as GitHub **Prerelease**
- Windows x64 only

## What's new

**Product Surface Cutover**
- New App Shell: Rail navigation, TopBar, responsive Inspector, Command Palette (Ctrl+K / Ctrl+B).
- Legacy AI-session terminal, Provider/API configuration surfaces, dual Sidebar, and prototype controls removed from the active product (`LEGACY_CODE_RETAINED`).
- Project Files drawer removed — the Project Desk is self-contained.
- Settings no longer ships the legacy source-integrity dev tool; About shows the real version and product description.

**Verification Workbench** (single lifecycle DEFINE → REVIEW → VERIFY → RESULT)
- Contract definition, review preview, one-time confirmation, controlled `node --test` execution, cancel/timeout/error handling.
- Result/Evidence Workbench: verdict, criterion ledger, evidence ledger, Receipt + Markdown Handoff export.
- Honest verdicts: VERIFIED / FAILED / INSUFFICIENT_EVIDENCE / CANCELLED / TIMEOUT; never fabricated.

**Theme / Locale / Density**
- Light/Dark themes, zh/en locale, compact/standard/comfortable density.
- Readiness panel is theme-aware (no dark-only styling).

**Integrity & semantics**
- `VERIFIED ≠ ACCEPTED`; `AcceptanceDecision` stays `NOT_RECORDED` (no Accept/Reject/Override).
- Verification readiness no longer depends on a Provider/API key.

**Packaging & hardening**
- Packaged size trimmed ~49 MB (node-pty trimmed to win32-x64; only zh-CN/zh-TW/en-US locales).
- SecretStore upgraded to Electron `safeStorage` (Windows DPAPI / macOS Keychain / libsecret) with legacy scrypt fallback.
- Shared `useMediaQuery` hook; unified SVG icons; i18n + theme-variable cleanup.

## Security boundary
- R2 Core (controlled verification, receipts, evidence, verdict) unchanged; no new IPC channels.
- Verification execution is PROCESS_BOUNDARY_ONLY, not an OS-level sandbox.

## Known limitations
- Artifacts are **not code-signed** — Windows SmartScreen will warn; verify by SHA-256.
- Real backend currently uses a single-criterion model; 8/30/100-scale evidence is fixture-scale.
- Receipt is generated at export time (immutable artifact); no fake pre-export receipt.
- SecretStore protects secrets via the OS secret store; on platforms without a keyring it falls back to local scrypt derivation (not OS-level).

## Artifacts (SHA-256)
See `SHA256SUMS-0.1.2.txt` in the release assets.

| Asset | Size | SHA-256 |
|---|---|---|
| `Agent Workbench Setup 0.1.2.exe` | 95,812,717 | `68a335ddc51fdccd2dbd554ab63a4808b1bff5aaa0bd50622f4ccf2e02f0b35f` |
| `Agent Workbench Setup 0.1.2.exe.blockmap` | 100,890 | `3afd7c7467192d0b67c5f585881395338edfa3f318c8ac844c24f33b37735be2` |
| `win-unpacked\Agent Workbench.exe` | 232,546,816 | `ffca14a7a1bc43319f45e9867ecfc6810de6bb777c151ea1142b3b8acb4df5b3` |
| `win-unpacked\resources\app.asar` | 3,899,903 | `5711f5ce3cc0e0354fab74bc1e60b19b72e8bc56fdac165f27fda497e7a80b04` |

## Not included in 0.1.2
Agent Claim, External Work, run History, Acceptance decision, Provider management UI, AI terminal, multi-criterion backend.
