# Agent Workbench

Agent Workbench is a Windows-first Electron desktop workspace manager for Claude Code, Codex, and other AI coding agents. It helps users configure, diagnose, package, and safely manage local Agent workspaces without making the command line the primary interface.

Agent Workbench is an independent project. It is not affiliated with or endorsed by Anthropic or OpenAI. Vendor product names identify supported external tools only.

## Current Alpha Scope

The current prototype includes:

- Electron desktop UI with context isolation, renderer sandboxing, restricted navigation, and validated privileged IPC senders.
- Settings, API configuration, diagnostics, project capsule, readiness, and share/package surfaces.
- Sensitive-value masking and display-safe path handling.
- Deterministic local stub Session lifecycle with crash, timeout, stop, and cleanup coverage.
- Controlled-action proposal, confirmation, cancellation, execution, and receipt flows.
- Managed-snapshot-only `MODEL_ROLLBACK`; arbitrary paths never cross the renderer contract.
- Browser smoke tests and real Electron E2E tests.

Real external Agent launch is not enabled as a default release path. The Alpha validates deterministic local fixtures and explicit safety gates.

## Install the Alpha

Download the Windows installer and its checksum manifest from the matching release. Verify the SHA-256 value before running the installer, especially because the current Alpha installer is not code-signed.

See [Installation and SHA-256 verification](docs/INSTALLATION.md) for exact PowerShell commands, startup checks, and uninstall steps.

## Safety Boundaries

See [docs/SAFETY_BOUNDARY.md](docs/SAFETY_BOUNDARY.md).

Core rules:

- No default or silent real Agent launch.
- No credential or full sensitive local-path exposure in normal UI, copied reports, or release evidence.
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

Local verification:

```powershell
npm run test:unit
npm run test:fs
npm run test:session
npm run test:action
npm run test:rollback
npm run test:navigation
npm run test:ipc-sender
npm run test:api-boundary
npm run test:static
npm run test:electron
npm run smoke
```

Packaging:

```powershell
npm run pack
npm run dist
```

## Documentation

- [Release notes](docs/RELEASE_NOTES.md)
- [Installation and SHA-256 verification](docs/INSTALLATION.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Artifact checksums](SHA256SUMS.txt)
- [Public roadmap](docs/PUBLIC_ROADMAP.md)
- [Safety boundary](docs/SAFETY_BOUNDARY.md)
- [Environment isolation](docs/ENVIRONMENT_ISOLATION.md)
- [Public history provenance](PUBLIC_HISTORY_PROVENANCE.md)

## License

Agent Workbench is licensed under the [MIT License](LICENSE).
