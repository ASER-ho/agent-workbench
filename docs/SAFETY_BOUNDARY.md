# Safety Boundary

This document describes the current Alpha boundary. It does not claim roadmap controls are already implemented.

## Current Product Boundary

- Real external Agent launch is not a default release path.
- Deterministic local stub Sessions require readiness and explicit confirmation.
- Controlled actions require an immutable proposal and explicit approval before execution.
- `MODEL_ROLLBACK` accepts only app-generated snapshot names and resolves them inside the app-managed backup directory.
- File IPC operations enforce workspace containment, including traversal, sibling-prefix, separator, case, and symlink boundaries.
- The renderer runs with context isolation, sandboxing, and Node integration disabled.
- Renderer navigation is blocked. New windows are denied; only credential-free HTTPS links may be opened externally.
- Privileged IPC accepts messages only from the bound main window's top frame at its current URL.
- Credentials, SecretStore values, and full sensitive local paths must not appear in normal UI, copied reports, or public release evidence.
- Registry diagnostics are read-only.
- Non app-managed files must not be deleted by cleanup or uninstall flows.
- Observation is off by default. Renderer projections exclude raw transcript content, full cwd, transcript paths, source PID, and Hook secrets.
- Hook marker presence is not health; installed entries must match the active loopback endpoint. Repair requires preview and confirmation.
- Automatic verification requires a Main-owned, single-use workspace/contract/recipe/trigger authorization consumed before execution.
- Critical authorization audit failure prevents unattended automatic execution.

## Future Real Agent Launch

Any future real Agent launch must require:

- Explicit user confirmation.
- A user-selected workspace.
- A selected provider and model.
- A visible command/action preview.
- Visible running, failure, and completion states.
- User-safe error handling.
- A sanitized receipt or event record.

## Publication Boundary

Remote creation or modification, push, tag creation, release publication, and artifact upload require separate explicit authorization.
