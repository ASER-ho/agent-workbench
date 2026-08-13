# Installation and SHA-256 Verification

These instructions apply to Agent Workbench 0.1.3 for Windows x64 after a matching release is published. The current repository state is a local Release Candidate and is not an available GitHub release.

## Verify the installer

Download the installer and manifest from the same authorized release:

```powershell
Get-FileHash -LiteralPath '.\Agent Workbench Setup 0.1.3.exe' -Algorithm SHA256
Get-Content -LiteralPath '.\SHA256SUMS.txt'
```

Compare the complete 64-character SHA-256. Do not run an installer when filename, size, source release, or hash differs. A matching hash confirms artifact identity; it does not replace code signing.

## Install and first start

1. Verify the checksum.
2. Run `Agent Workbench Setup 0.1.3.exe` and choose an installation directory.
3. Launch Agent Workbench and select the intended workspace.
4. Observation is off by default; review watched directories before enabling.
5. Hook install/repair shows a redacted preview and requires confirmation.
6. Auto Verification stays off until a valid Verification preview exists and the user authorizes one execution.

## Uninstall

Use Windows Settings > Apps > Installed apps > Agent Workbench > Uninstall, or the installed uninstaller. Application uninstall does not silently edit external Claude Hook settings. Use Agent Workbench's precise Hook uninstall action first when those entries should be removed.

## Build from source

Requirements: Windows 10 or later, Node.js 22 or later, and npm.

```powershell
git clone <repository-url>
Set-Location agent-workbench
npm ci
npm run build
npm test -- --exclude test:electron
npm run test:electron
npm run pack
npm run dist
```

Record source HEAD/tree, fresh test output, installer size, and SHA-256. Do not substitute GitHub CI for local Electron E2E or packaged smoke.
