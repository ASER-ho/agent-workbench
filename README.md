# Agent Workbench

Agent Workbench is a Windows-first Electron desktop workbench for safe, visible, user-controlled AI coding-agent workflows. It provides a Verification Workbench (DEFINE → REVIEW → VERIFY → RESULT), environment diagnostics, passive observation of local Claude Code / Codex sessions, and recipe-whitelisted auto-verification — without making the command line the primary interface.

Agent Workbench is an independent project. It is not affiliated with or endorsed by Anthropic or OpenAI. Vendor product names identify supported external tools only.

## Current Alpha (0.1.x)

- **Verification Workbench** — deterministic, evidence-bound verification of a workspace: contract definition, review preview, one-time confirmation, controlled `node --test` execution, cancel/timeout/error handling, and an immutable JSON Receipt + Markdown Handoff export. Honest verdicts only (VERIFIED / FAILED / INSUFFICIENT_EVIDENCE / CANCELLED / TIMEOUT); never fabricated.
- **Passive agent observation** — opt-in observation of Claude Code (HTTP hooks + transcript polling) and Codex (transcript polling) sessions. Read-only, loopback-only event server, tool input stored as a digest only; nothing observed ever reaches the renderer as raw content. Off by default — enabling shows exactly which directories will be watched.
- **Auto-verification** — user-enabled, recipe-whitelisted auto-verification that runs only a hardcoded trusted recipe against the selected workspace when a matching session ends. Does not replace the interactive confirmation model for manual runs; auto-generated receipts are marked with their trigger.
- **Environment, settings, capsule** — diagnostics and readiness checks, theme / locale / density, display-safe project capsule.
- **Security model** — context-isolated renderer, sandboxed, restricted navigation, validated privileged IPC senders (`trustedIpcMain`); fail-closed verification; secrets via the OS secret store; display-safe paths everywhere.

Real external Agent launch is not enabled as a default release path. The Alpha validates deterministic local fixtures and explicit safety gates.

## Install the Alpha

Download the Windows installer and its checksum manifest from the matching release. Verify the SHA-256 value before running the installer, especially because the current Alpha installer is not code-signed.

See [Installation and SHA-256 verification](docs/INSTALLATION.md) for exact PowerShell commands, startup checks, and uninstall steps.

## Safety Boundaries

See [docs/SAFETY_BOUNDARY.md](docs/SAFETY_BOUNDARY.md).

Core rules:

- No default or silent real Agent launch; observation and auto-verification are opt-in.
- No credential, full sensitive local-path, or raw transcript content in normal UI, copied reports, or release evidence.
- Verification executes only a fixed `node --test` command from a trusted recipe registry (never arbitrary commands from a transcript or hook).
- Hook installation into `~/.claude/settings.json` requires explicit user confirmation with a full preview and a backup; uninstalling removes only Agent Workbench's entries.
- Workspace and rollback targets must remain inside app-controlled boundaries.
- System settings, remotes, tags, pushes, and release publication are never changed silently.

## Development

Requirements:

- Windows 10 or later.
- Node.js 22 or later.
- npm.

Install and build:

```powershell
npm ci
npm run build
```

Local verification (runs every `test:*` suite in sequence):

```powershell
npm test
```

Electron E2E (`npm run test:electron`) is a **local release gate** (59 passing on a
workstation). It is not run in CI because a real Electron window cannot open on the
headless GitHub Windows runner; CI runs the unit/static/privacy suites only.

Packaging:

```powershell
npm run pack
npm run dist
```

## Documentation

- [Release notes](docs/RELEASE_NOTES.md)
- [Installation and SHA-256 verification](docs/INSTALLATION.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Public roadmap](docs/PUBLIC_ROADMAP.md)
- [Safety boundary](docs/SAFETY_BOUNDARY.md)
- [Environment isolation](docs/ENVIRONMENT_ISOLATION.md)

## License

Agent Workbench is licensed under the [MIT License](LICENSE).
