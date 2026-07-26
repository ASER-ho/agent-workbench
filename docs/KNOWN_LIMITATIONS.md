# Known Limitations

The following limitations apply to Agent Workbench `0.1.0-alpha.1`.

## Platform and Distribution

- The reviewed release target is Windows x64. Other operating systems and architectures are not release-qualified.
- The Alpha installer is not code-signed. Windows may display unknown-publisher or reputation warnings.
- Automatic update delivery is not included. Install upgrades manually after verifying the new release checksum.
- Migration from older private application identities and user-data directories is not automated.

## Agent Runtime

- Real external Agent launch is not enabled as the default release path.
- The reviewed Session flow uses a deterministic local stub to validate confirmation, input, stop, crash, timeout, and cleanup behavior.
- Complete process or container isolation for future external Agent runtimes is not claimed.
- Provider-neutral profiles and broader provider lifecycle management are incomplete.

## Diagnostics and Packaging

- Diagnostics are best-effort and may report a version as unavailable when a discovered Windows tool is exposed only through a `.cmd` or `.bat` shim. The application intentionally does not execute those shims through `cmd.exe` during version detection.
- The share/package flow is local and does not publish artifacts automatically.
- The current release has no automatic crash reporting or telemetry upload.

## Alpha Expectations

- Back up important workspaces before testing an Alpha build.
- Treat generated receipts and diagnostics as local evidence, not as a complete security audit of external tools.
- Verify installer SHA-256 values before every installation.

See the [Safety Boundary](SAFETY_BOUNDARY.md) and [Public Roadmap](PUBLIC_ROADMAP.md) for current guarantees and planned work.
