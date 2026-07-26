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

Binary source commit: `d29e651db01b8f854627cacc733431195cdbbd6c`

The checksum manifest is recorded in a descendant release-materials commit and is not an input to these binaries.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.0-alpha.1.exe` | 105,114,477 bytes | `31032FD7E987C9979FF7018EB3AE829393EC9318A0F3D104CBC9E52EB94B3CB5` |
| `Agent Workbench Setup 0.1.0-alpha.1.exe.blockmap` | 109,837 bytes | `C07D4AFD1FBDB09DCFCA7C04D8DB7C0C8AAA6FBA54DEE07509B4E99619746AE2` |
| `app.asar` | 4,127,855 bytes | `39CF4A49070DB19B72A4D393C53D2A59633BEFAFCAC5DA5848F93A19A43D40C9` |

See [Installation and SHA-256 verification](INSTALLATION.md) and the release `SHA256SUMS.txt` manifest before running the installer.

## License

Agent Workbench is released under the MIT License. See [`LICENSE`](../LICENSE).

## Important

The Alpha installer is not code-signed. Verify the SHA-256 checksum before execution. Review [Known Limitations](KNOWN_LIMITATIONS.md) before installation.
