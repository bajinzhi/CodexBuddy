# CodexBuddy Mobile Remote Blueprint (Tailscale + TCP)

This document is the canonical runbook for iOS and Android remote usage with a desktop-hosted CodexBuddy backend over Tailscale.

## Scope

- iOS and Android apps run in remote backend mode.
- Desktop app runs the TCP mobile access daemon.
- Connectivity is provided by the user-managed Tailscale tailnet.
- Hosted relay providers are out of scope.

## Current Architecture

1. Desktop CodexBuddy hosts the daemon and executes Codex workflows.
2. Mobile CodexBuddy connects to the desktop daemon using `remoteBackendHost` + token.
3. Transport is TCP only (`remoteBackendProvider = "tcp"`).
4. Tailscale is used as the network path between mobile devices and desktop.

## Prerequisites

- Desktop and mobile device are signed into the same Tailscale tailnet.
- Desktop CodexBuddy is installed and able to run local workspaces.
- iOS or Android build/runtime is available (simulator/emulator or device).
- A non-empty remote backend token is configured.

## Desktop Setup (Source of Truth)

In desktop CodexBuddy:

1. Open `Settings > Server`.
2. Set `Remote backend token`.
3. In `Mobile access daemon`, click `Start daemon`.
4. In `Tailscale helper`, click `Detect Tailscale`.
5. Use `Use suggested host` or copy the suggested host manually (example: `macbook.your-tailnet.ts.net:4732`).

Optional fallback:

- Use `Refresh daemon command` to get a manual launch command template.

Headless alternative (no desktop UI required):

1. Build daemon + daemonctl:
   - `cd src-tauri`
   - `cargo build --bin codex_buddy_daemon --bin codex_buddy_daemonctl`
2. Start daemon from CLI:
   - `./target/debug/codex_buddy_daemonctl start`
3. Verify daemon status:
   - `./target/debug/codex_buddy_daemonctl status`

## Mobile Setup

In mobile CodexBuddy:

1. Open `Settings > Server` (or the mobile setup wizard).
2. Enter the desktop Tailscale host (including port).
3. Enter the same remote backend token used on desktop.
4. Tap `Connect & test`.

Success criteria:

- Connectivity check passes.
- Workspace list loads from desktop backend.

## Operational Notes

- Desktop daemon must remain running while mobile clients are connected.
- Mobile flow is remote-only and uses user infrastructure.
- Desktop remains local-first unless switched to remote mode explicitly.
- Android project files are generated with `npm run tauri:android:init` after Android SDK/NDK prerequisites are installed.

## Known Mobile Limits

- Terminal tooling is unavailable on mobile builds.
- Dictation is unavailable on mobile builds.

## Troubleshooting

- `Unable to reach remote backend`:
  - Verify desktop daemon is running.
  - Verify host/token match desktop settings.
  - Verify both devices are online in the same tailnet.
- `Token (required)` / auth failures:
  - Set a non-empty token in desktop Server settings.
  - Re-enter the same token on the mobile device.
- No suggested host shown:
  - Confirm Tailscale is installed and connected on desktop.
  - Retry `Detect Tailscale`.
