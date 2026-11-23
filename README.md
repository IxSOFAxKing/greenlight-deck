# Greenlight Deck

**Play your Xbox on a Steam Deck.** Greenlight Deck is a controller-first app for Xbox remote play and Xbox Cloud Gaming on handhelds. It's built on the open-source [Greenlight](https://github.com/unknownskl/greenlight) streaming client.

- Sign in by scanning a QR code with your phone. You never type a password on the Deck
- **My Xbox**: wake your console and stream it
- **Cloud**: your Xbox Cloud Gaming library, if your plan includes it
- Every screen works with the D-pad/stick, A/B and LB/RB. Hold **L3 + R3** in a game for the menu
- **Updates itself** from this repo's Releases

## Install

1. In **Desktop Mode**, download `GreenlightDeck-<version>-x86_64.AppImage` and `install.sh` from the [latest release](https://github.com/IxSOFAxKing/greenlight-deck/releases/latest).
2. In Konsole, in the download folder, run:
   ```bash
   bash install.sh
   ```
3. In Steam: **Games → Add a Non-Steam Game → Greenlight Deck**. Then go back to Gaming Mode.

On your Xbox, turn on **Settings → Devices & connections → Remote features**, and set power mode to **Sleep**.

After this first install, updates come through the app: **Settings → Check for updates**.

## Repository layout

This is a fork of the Greenlight monorepo, so it builds against Greenlight's streaming packages directly.

| Path | What |
|---|---|
| `packages/deck` | **Greenlight Deck**: Electron app, handheld UI, updater ([README](packages/deck/README.md)) |
| `packages/platform` | Greenlight: Xbox auth, consoles, catalog |
| `packages/player` | Greenlight: WebRTC streaming core |
| `packages/desktop`, `desktop-v3`, … | Upstream Greenlight apps (unchanged) |

Upstream's original README is in [README.greenlight.md](README.greenlight.md).

## Build

```bash
yarn install
yarn deck build      # bundle
yarn deck start      # run in a window
yarn deck dist       # build the AppImage into packages/deck/release/
```

## Releasing an update

1. Bump `version` in `packages/deck/package.json` (for example `0.3.0`) and commit.
2. Tag it and push:
   ```bash
   git tag v0.3.0 && git push origin main v0.3.0
   ```
3. GitHub Actions builds the AppImage and publishes the release with `latest-linux.yml`. Installed apps will offer the update the next time they check.

## Credits & license

MIT, the same as Greenlight. The streaming core is © UnknownSKL (Jim Kroon) and the Greenlight contributors. This project isn't affiliated with Microsoft or Xbox.
