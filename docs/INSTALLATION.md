# Installation and SHA-256 Verification

These instructions apply to `Agent Workbench 0.1.0-alpha.1` for Windows x64.

Reviewed binary source commit: `2658c0e481c6fc5693aad31302058f5d8b2c86d6`.

## Download

Download these files from the same release:

- `Agent Workbench Setup 0.1.0-alpha.1.exe`
- `SHA256SUMS.txt`

The `.blockmap` file supports release tooling and is not required for a manual installation. The manifest also records the reviewed `app.asar`; it is embedded in the installed application and is not required as a separate download.

## Verify SHA-256

Open PowerShell in the download directory and run:

```powershell
Get-FileHash -LiteralPath '.\Agent Workbench Setup 0.1.0-alpha.1.exe' -Algorithm SHA256
```

Compare the complete 64-character hash with both `SHA256SUMS.txt` and the value in [Release Notes](RELEASE_NOTES.md). The values must match exactly. Do not run the installer if the filename, size, or hash differs.

To inspect the manifest and verify the installer plus an optionally downloaded blockmap:

```powershell
Get-Content -LiteralPath '.\SHA256SUMS.txt'
Get-FileHash -LiteralPath '.\Agent Workbench Setup 0.1.0-alpha.1.exe' -Algorithm SHA256
Get-FileHash -LiteralPath '.\Agent Workbench Setup 0.1.0-alpha.1.exe.blockmap' -Algorithm SHA256
```

## Install

1. Confirm the checksum first.
2. Run `Agent Workbench Setup 0.1.0-alpha.1.exe`.
3. Choose an installation directory when prompted.
4. Launch Agent Workbench from the desktop or Start menu shortcut.
5. Review the workspace and safety state before enabling any available action.

The current Alpha installer is not code-signed, so Windows may show an unknown-publisher or reputation warning. A valid SHA-256 match confirms that the file matches the reviewed release artifact; it does not replace operating-system code signing.

## Uninstall

Use Windows Settings > Apps > Installed apps > Agent Workbench > Uninstall, or run `Uninstall Agent Workbench.exe` from the installation directory.

The uninstaller removes the application directory, application shortcuts, and its uninstall registry entry. It must not remove files outside app-managed locations.

## Build from Source

Requirements:

- Windows 10 or later.
- Node.js 22 or later.
- npm.

```powershell
git clone <repository-url>
Set-Location agent-workbench-desktop
npm ci
npm run build
npm run test:static
npm run test:electron
npm run dist
```

Always build from a reviewed commit and record the resulting artifact hashes.
