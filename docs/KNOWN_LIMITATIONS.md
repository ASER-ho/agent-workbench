# Known Limitations

These limitations describe Agent Workbench 0.1.3 Release Candidate capabilities, not roadmap promises.

## Platform and distribution

- Windows x64 is the only release-qualified target.
- The installer is unsigned and can trigger unknown-publisher or SmartScreen warnings.
- Electron E2E and packaged smoke are local release gates; GitHub CI cannot substitute.
- Automatic updates are not included.

## Verification and evidence

- Verification is `PROCESS_BOUNDARY_ONLY`; there is no filesystem sandbox, container, or VM boundary.
- Network access is not technically denied by the verification process boundary.
- The current criterion backend and recipe registry are fixed in code.
- `VERIFIED` is not human acceptance; acceptance remains `NOT_RECORDED`.
- The local audit is append-only by application behavior, not cryptographically tamper-proof.

## Observation and authorization

- Observation supports Claude Code Hooks/transcripts and Codex transcripts only.
- Observation is off by default.
- Auto Verification uses an in-memory, single-use lease bound to one workspace, remembered contract, exact recipe set, and `session:end`.
- Authorization is intentionally not persisted across app lifecycle.
- Hook repair requires preview and confirmation; no silent Claude settings rewrite.

## Product boundary

- No real external Agent launch, provider/model management, general terminal, multi-workspace operation, or cloud sync.
- No signing/Sigstore, sandbox/container verification, CI evidence import, verification history, activity timeline, action queue, Agent Claim, or Human Acceptance surface.

See [Safety Boundary](SAFETY_BOUNDARY.md), [Auto-Verification Security Model](AUTO_VERIFICATION_SECURITY_MODEL.md), and [Public Roadmap](PUBLIC_ROADMAP.md).
