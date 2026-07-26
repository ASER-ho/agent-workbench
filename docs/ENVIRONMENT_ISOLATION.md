# Environment Isolation

Complete runtime isolation is not claimed for the current Alpha.

## Implemented Guardrails

- Runtime-provider state is app-managed and summarized without exposing secrets.
- Safe Mode clears app-managed runtime state without deleting provider credentials.
- Diagnostics inspect selected tool, settings, environment, registry, and package signals using sanitized summaries.
- The app does not silently write system environment variables, registry values, shell profiles, or global editor configuration.
- User data, workspace fixtures, backups, and E2E state resolve from Electron runtime paths or explicit test fixtures, not developer-machine defaults.
- File operations and model rollback use explicit containment checks.
- Cleanup and uninstall verification must distinguish app-managed resources from user-managed files.

## Not Yet Claimed

- Complete process or container sandboxing for external Agent runtimes.
- A finished provider-neutral profile system.
- Automatic migration from older private application identities.
- Silent global-machine mutation.
