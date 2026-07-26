# Agent Workbench 0.1.0-alpha.1 Release Notes

Release date: 2026-07-26

This is the first public Alpha release candidate built from the privacy-remediated Agent Workbench history.

## Highlights

- Windows-first Electron desktop workspace for visible, user-controlled AI coding-agent workflows.
- Agent Workbench product identity with application ID `com.agentworkbench.desktop`.
- Deterministic local stub Session lifecycle covering normal stop, crash, response timeout, stop-timeout regression, and process cleanup.
- Controlled actions with immutable previews, explicit approval, single consumption, receipts, and workspace containment.
- Managed-snapshot-only `MODEL_ROLLBACK` with traversal, absolute-path, separator, case, symlink, and realpath escape protection.
- Context isolation, renderer sandboxing, blocked navigation, credential-free HTTPS external-link policy, and validated privileged IPC senders.
- Stored API Secret references bound to their saved normalized endpoints.
- Archive and diagnostic commands use fixed executables and argument or environment boundaries instead of interpolating local paths into shell source.

## Verification Summary

- Clean-clone dependency install and production build: PASS.
- Node and static tests: 68/68 PASS.
- Electron E2E: 28/28 PASS.
- Browser smoke: 3 executable checks PASS; 4 Electron-only checks explicitly skipped in browser mode.
- Packed application launch and ASAR content sweep: PASS.
- Isolated install, installed launch, Session lifecycle, process cleanup, uninstall, shortcut cleanup, registry cleanup, and non-app-managed file preservation: PASS.
- Source, production output, ASAR, installer, and blockmap privacy scans: zero blocking findings.

## Artifacts

Binary source commit: `2658c0e481c6fc5693aad31302058f5d8b2c86d6`

The checksum manifest is recorded in a descendant release-materials commit and is not an input to these binaries.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.0-alpha.1.exe` | 105,114,478 bytes | `B599931852D95F974A5C4BCF15560EECABF87714CB0B632D76B33416426F3042` |
| `Agent Workbench Setup 0.1.0-alpha.1.exe.blockmap` | 109,829 bytes | `059EB18D110C4A80531C0C51C460E3F18F7FD4AC2D68B23CEE6F44D4FB43DA8D` |
| `app.asar` | 4,127,855 bytes | `39CF4A49070DB19B72A4D393C53D2A59633BEFAFCAC5DA5848F93A19A43D40C9` |

See [Installation and SHA-256 verification](INSTALLATION.md) and the release `SHA256SUMS.txt` manifest before running the installer.

## License

Agent Workbench is released under the MIT License. See [`LICENSE`](../LICENSE).

## Important

The Alpha installer is not code-signed. Verify the SHA-256 checksum before execution. Review [Known Limitations](KNOWN_LIMITATIONS.md) before installation.
