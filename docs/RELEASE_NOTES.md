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

Binary source commit: `PENDING_CLEAN_REBUILD`

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Agent Workbench Setup 0.1.0-alpha.1.exe` | Pending | Pending clean rebuild |
| `Agent Workbench Setup 0.1.0-alpha.1.exe.blockmap` | Pending | Pending clean rebuild |
| `app.asar` | Pending | Pending clean rebuild |

See [Installation and SHA-256 verification](INSTALLATION.md) and the release `SHA256SUMS.txt` manifest before running the installer.

## License

Agent Workbench is released under the MIT License. See [`LICENSE`](../LICENSE).

## Important

The Alpha installer is not code-signed. Verify the SHA-256 checksum before execution. Review [Known Limitations](KNOWN_LIMITATIONS.md) before installation.
