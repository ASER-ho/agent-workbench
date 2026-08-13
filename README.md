# Agent Workbench

Agent Workbench is a Windows-first, local-first, agent-neutral verification workbench for external AI coding agents. Its core path is:

```text
External Coding Agent -> Passive Observation -> Bounded Authorization
-> Controlled Verification -> Evidence -> Deterministic Verdict -> Receipt / Handoff
```

Agent Workbench is an independent project and is not affiliated with or endorsed by Anthropic or OpenAI. Vendor names identify supported external tools only.

## Current Alpha: 0.1.3 Release Candidate

- **Verification Workbench** — contract definition, review preview, controlled `node --test` verification, evidence-bound deterministic verdicts, immutable Receipt, and Markdown Handoff.
- **Trusted Observation** — opt-in Claude Code Hook/transcript and Codex transcript observation. Main keeps internal cwd/transcript/raw fields; renderer IPC receives only display-safe projections.
- **Hook health** — distinguishes not installed, healthy, endpoint drift, server unavailable, and watcher error. Repair requires a redacted preview and explicit confirmation; uninstall removes only Agent Workbench entries.
- **Bounded Auto Verification** — a single-use authorization binds the selected workspace, remembered contract digest, exact registered recipe set, and `session:end`. It is consumed before execution and turns off after one attempt.
- **Local authorization audit** — grant, revoke, consume, start, completed, and failed events use minimized display-safe fields and a digest instead of the full session ID.

R2 verification semantics are unchanged: `VERIFIED` is not human acceptance and `AcceptanceDecision` remains `NOT_RECORDED`.

## Product boundary

Agent Workbench observes and verifies external Agent work. It does not launch or control real Agents, provide Agent chat, expose a general terminal, manage providers/models, orchestrate multiple Agents, execute transcript commands, auto-approve Agent permissions, or operate as a cloud Agent platform.

## Safety boundaries

- Observation is off by default; Auto Verification requires a separate explicit single-use authorization.
- No full sensitive local paths, raw transcript content, tool input/output, full session IDs, credentials, or Hook tokens in Observation UI/audit projections.
- Automatic verification executes only fixed code-level recipes through the existing controlled-verification manager.
- Critical pre-run audit failure prevents unattended execution.
- Hook installation and repair require preview plus confirmation.
- Remote changes, push, tag, release publication, and npm publication are never performed silently.

See [Safety Boundary](docs/SAFETY_BOUNDARY.md), [Auto-Verification Security Model](docs/AUTO_VERIFICATION_SECURITY_MODEL.md), and [Known Limitations](docs/KNOWN_LIMITATIONS.md).

## Development

Requirements: Windows 10 or later, Node.js 22 or later, and npm.

```powershell
npm ci
npm run build
npm test -- --exclude test:electron
npm run test:electron
npm run pack
npm run dist
```

Electron E2E is a local release gate. GitHub CI runs unit/static/privacy coverage and cannot substitute for a fresh real-window Electron run or packaged smoke.

## Documentation

- [Release notes draft](docs/RELEASE_NOTES.md)
- [Installation and SHA-256 verification](docs/INSTALLATION.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Public roadmap](docs/PUBLIC_ROADMAP.md)
- [Safety boundary](docs/SAFETY_BOUNDARY.md)
- [Environment isolation](docs/ENVIRONMENT_ISOLATION.md)

## License

Agent Workbench is licensed under the [MIT License](LICENSE).
