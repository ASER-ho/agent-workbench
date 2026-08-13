# Agent Workbench 0.1.3 Local Release Readiness

Status: local Release Candidate. This document records local evidence only; it is not evidence of a public release.

```text
AW_0_1_3_IMPLEMENTATION_COMPLETE
AW_0_1_3_TRUSTED_OBSERVATION_PASS
AW_0_1_3_AUTO_VERIFY_AUTHORIZATION_PASS
AW_0_1_3_OBSERVATION_PRIVACY_PASS
AW_0_1_3_LOCAL_E2E_PASS
AW_0_1_3_HUMAN_SMOKE_FIXES_PASS
AW_0_1_3_RC_ARTIFACT_READY_FOR_USER_VALIDATION
AW_0_1_3_GITHUB_MUTATION_NOT_PERFORMED
```

## Source identity

| Item | Value |
| --- | --- |
| Logical baseline requested for 0.1.3 | `b432977423a018043d635c1af52d06a8eb41d197` |
| Current rewritten baseline | `22f0f666a9591f9d1a49959232fbf45d1d055491` |
| Baseline relationship | different commit histories, identical tree `c52fbd6fd274182f1c5d942ce71121ef10e8ca0d` |
| Branch | `feat/0.1.3-trusted-observation` |
| Artifact source commit | `6b2564c` (Human RC smoke fix) |
| Previous artifact (superseded) | `E211D522B9C373F5DE140D7C96B3CA5707074125492D4FB9F14E94FEC4851B96` |

The release-evidence commit containing this file is intentionally newer than the artifact source commit. No product, build configuration, or smoke-test code changed after the artifact source commit.

## Scope disposition

| Scope | Disposition | Evidence |
| --- | --- | --- |
| `REL-LOCK-01` | `NO_REPRO` | npm 11.6.2 `npm ci` completed; 375 packages installed; Electron and node-pty postinstall verification passed; `npm ls --all` exited 0 with 700 output lines and no problem lines. |
| Trusted Observation | `DONE` | Default-off observation, Hook/transcript ingestion, health/drift reporting, safe renderer projection, and fail-closed startup are implemented and tested. |
| Bounded Auto Verification | `DONE` | Main-owned in-memory single-use authorization binds workspace, normalized contract digest/generation, exact recipe set, and `session:end`; consumption occurs before asynchronous work. |
| Audit and privacy | `DONE` | Critical audit failures fail closed; result-audit degradation is visible; full cwd, transcript paths, tokens, raw transcript, tool data, full Hook URL, and full session ID are excluded from audit/UI projection. |
| Hook lifecycle | `DONE` | Install/repair is preview-before-confirm; endpoint drift is visible; uninstall removes only Agent Workbench entries and preserves unrelated user entries, including mixed Hook groups. |
| Product truth | `DONE` | README, security model, limitations, roadmap, installation, release notes, and safety boundary describe current 0.1.3 behavior. |

## Dependency and lock evidence

- npm CLI: 11.6.2, run with the bundled Node runtime.
- `package-lock.json`: lockfile version 3, root version 0.1.3, 472 package entries, zero self-tarball references.
- `npm ci --no-audit --no-fund`: PASS, 375 packages installed.
- Electron binary verification: PASS.
- node-pty win32-x64 prebuild verification: PASS.
- `npm ls --all`: PASS, exit 0, 700 output lines, zero problem lines.
- `package-lock.json` remained unchanged after the clean install.

## Build and test evidence

| Gate | Result |
| --- | --- |
| `npm run build` | PASS; main 61 modules, preload 2 modules, renderer 77 modules |
| `npm test -- --exclude test:electron` | PASS; all 22 suites; Observation 49/49 |
| `npm run test:electron` | PASS; 64/64 in ~3.4 minutes (incl. Tool Resolution panel E2E) |
| `npm run pack -- --config.electronDist=node_modules/electron/dist` | PASS; Windows x64 unpacked application |
| `npm run dist -- --config.electronDist=node_modules/electron/dist` | PASS; NSIS installer and blockmap |

The non-Electron runner emitted Node's `DEP0190` warning because the existing suite dispatcher uses `shell: true`. The test command exited 0; this warning is tracked as engineering debt and is not treated as functional or release-gate evidence.

Standalone `tsc` is **not claimed as PASS**. The repository's existing TypeScript project configuration reports rootDir, deprecated-option, and import/configuration errors outside this 0.1.3 change. The product compilation gate used here is the successful `electron-vite build`, supplemented by the unit/static/privacy and Electron runtime gates above.

## Packaged smoke

The smoke ran against `dist/win-unpacked/Agent Workbench.exe`, not the development server.

```text
packed-asar-sweep=PASS entries=277
packed-workspace=PASS
packed-shortcuts=PASS ctrlK=true ctrlB=true
packed-environment=PASS observationDefaultOff=true hookHealth=NOT_INSTALLED
packed-observation=PASS enabled=true authorization=AUTHORIZED_SINGLE_USE
packed-verification-and-result=PASS
packed-settings=PASS
packed-app-smoke=PASS
```

The smoke used an isolated temporary workspace and did not launch a real Agent or read SecretStore content.

## Artifacts

Output directory: local ignored `dist/`.

| File | Size | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `Agent Workbench Setup 0.1.3.exe` | 95,828,658 B | `90258B2622F6AA635977F683FFD95F36CA9126FC8F2428327E8971368D1FF880` | `NotSigned` |
| `Agent Workbench Setup 0.1.3.exe.blockmap` | — | `AFB737C13A3A36E8E8938B16221D1CDA0BAE88FC48CD74AE5955C01231D95E44` | not applicable |
| `win-unpacked/Agent Workbench.exe` | 232,546,816 B | `43E362796126C64424D8BB77F196AAE9286EB88DE4C86561F9865CEDEE97FB8A` | `NotSigned` |
| `win-unpacked/resources/app.asar` | — | `621C1F9D6485A08A5548E4128B2BFBF5F1D587150B230BF0C5BC8D4DC49B3FE9` | not applicable |

## Human RC smoke fix (0.1.3)

The user's Human RC smoke on the previous artifact found three issues; all are fixed and re-verified in this artifact.

| Finding | Fix |
| --- | --- |
| HUMAN-MINOR-01 — stale `0.1.2-B` Inspector placeholder | Replaced `inspector.*Hint` strings with current product copy (zh/en). |
| HUMAN-MAJOR-01 — `diag.next.*` raw key leak | Keys existed only in unused locale JSON files; added them to `LocaleContext` `LOCALE_DATA` so `t()` resolves them. Static regression test asserts both zh/en blocks carry all six keys. |
| HUMAN-MAJOR-02 — tool discovery false negative | New unified `Trusted Tool Resolver` (`trusted-tool-resolver.ts`): Environment Diagnostics and the Verification engine now share one fact source. node/claude resolve via env → user override → standard locations → `where.exe`; npm derives from the trusted Node. Manual `node.exe`/`claude.exe` selection via a native file dialog (display-safe confirmation; full path never crosses IPC), persisted to userData. Real-machine validation found the user's `C:\Claude` node `v22.14.0`, npm `10.9.2`, Claude CLI `2.1.220` after override. |

Re-verification: unit battery 23/23 (incl. new `test:tools` + static tool-resolution scan); Electron E2E 64/64; packaged smoke PASS (shell + Tool Resolution panel + no raw-key leak, 0 residual processes).

## Security invariants confirmed

- Observation remains off by default.
- Auto Verification is never implicitly authorized, persisted, transferred between workspaces, or reused.
- A matching event consumes the authorization synchronously before audit/start/verification awaits; duplicate delivery cannot run twice.
- Workspace clear/change, contract generation change, recipe change, observation disable, explicit revoke, and app exit revoke an unconsumed authorization.
- Hook bearer token, full endpoint, full paths, raw transcript, tool input/output, SecretStore content, and full session ID are not exposed to the renderer or minimized audit record.
- Critical authorization audit failure prevents automatic execution; a post-completion audit failure preserves the completed fact and exposes `DEGRADED` audit health.
- Hook repair and install require a preview and explicit confirmation; unrelated Claude settings and user Hook entries are preserved.
- Verification still uses the existing fixed-recipe process boundary; it does not add filesystem or network isolation.
- `VERIFIED` remains distinct from human acceptance; acceptance is `NOT_RECORDED`.

## Remaining findings and limitations

- **BLOCKER:** none found in the executed local gates.
- **MAJOR:** none found in the executed local gates.
- **MINOR:** the Windows artifacts are unsigned; SmartScreen/unknown-publisher warnings are expected.
- **MINOR:** the non-Electron suite dispatcher triggers Node `DEP0190` due to existing `shell: true` child-process invocation.
- **MINOR:** standalone `tsc` is not a clean current repository gate because of existing project-configuration errors; no standalone typecheck PASS is asserted.
- Windows x64 is the only release-qualified target.
- Verification is `PROCESS_BOUNDARY_ONLY`: no filesystem sandbox, container/VM boundary, or enforced network denial.
- The local audit is append-only by application behavior, not cryptographically tamper-proof.
- Observation supports Claude Code Hooks/transcripts and Codex transcripts only.
- No automatic updates, cloud sync, persistent/multi-use authorization, history UI, Agent launch, provider control, or general terminal are included.

## Publication boundary

No push, tag, pull request, GitHub Release, repository-setting change, package publication, or other remote mutation was performed. The local RC is ready for user validation and stops immediately before any push decision.
