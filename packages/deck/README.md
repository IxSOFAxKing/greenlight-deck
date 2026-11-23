# Greenlight Deck

A controller-first, handheld-friendly frontend for streaming your Xbox (and Xbox Cloud Gaming) to a Steam Deck. The streaming itself is Greenlight's: this app uses the `@greenlight/platform` and `@greenlight/player` packages from this repo and puts a new UI on top.

- **My Xbox**: lists your consoles, shows whether each one is on or asleep, and can wake one up before streaming
- **Cloud**: your Xbox Cloud Gaming library (only shown if your account has cloud gaming)
- **Settings**: 720p/1080p, fit or stretch the picture, performance stats, vibration, and signing out
- Sign in with a QR code / short code on your phone. You never type a password on the Deck
- Every screen works with the D-pad or stick, A/B, and LB/RB. Touch and mouse work too

## Install on a Steam Deck

1. Switch to **Desktop Mode** and download `GreenlightDeck-<version>-x86_64.AppImage` and `install.sh` from the [latest release](https://github.com/IxSOFAxKing/greenlight-deck/releases/latest) to the same folder.
2. Open **Konsole** in that folder and run:
   ```bash
   bash install.sh GreenlightDeck-*.AppImage
   ```
3. In Steam (Desktop Mode): **Games → Add a Non-Steam Game to My Library → Greenlight Deck**.
4. Go back to **Gaming Mode**. You'll find it under **Library → Non-Steam**.

Recommended: open the shortcut's **Controller settings** and pick a **Gamepad** layout (not Keyboard/Mouse).

### Updates
Version 0.2.0 and later update themselves. Go to **Settings → Check for updates**, then **Download** and **Restart to update**. By default the app also checks quietly at launch; you can turn that off in Settings. Updates come from this repo's [GitHub Releases](https://github.com/IxSOFAxKing/greenlight-deck/releases). They only work when the app runs from the installed AppImage.

### Before your first stream (on the Xbox)
- **Settings → Devices & connections → Remote features → Enable remote features**
- Set **Power mode** to **Sleep** so the Deck can wake the console.

## Controls

| Where | Input | Does |
|---|---|---|
| Menus | D-pad / left stick | Move |
| | A / B | Select / Back |
| | LB / RB | Switch tabs |
| | X (on a console) | Wake it up |
| | Y | Refresh |
| | Left / right (on a setting) | Change its value |
| In game | Hold **L3 + R3** | Open the stream menu (input to the Xbox pauses) |
| | **View + Menu** together | Xbox (Guide) button |
| Keyboard | Arrows, Enter, Esc, Q/E, F11 | Same as above; Esc/F1 opens the menu in-game, F11 toggles fullscreen |

The stream menu has Resume, Press Xbox button, Picture (fit/fill), Performance stats, and Disconnect.

## Develop

From the repo root:

```bash
yarn install
yarn deck build        # bundle main process + UI
yarn deck start        # run in a window (Electron)
yarn deck dist         # build the AppImage into packages/deck/release/
yarn deck preview:ui   # UI only, in a browser, with mock data (?mock=signedout to see sign-in)
yarn deck typecheck
```

### How it fits together

```
src/               React UI (Vite). Controller input -> spatial focus navigation.
  input/           Gamepad API polling, key-repeat, L3+R3 combo, focus layers
  screens/         SignIn, Home (My Xbox / Cloud / Settings), Stream
  stream/session   Drives one stream: request -> provision -> SDP/ICE -> play
electron/          Main process. Holds all tokens; exposes a small IPC API.
  backend.ts       Calls @greenlight/platform (auth, consoles, catalog)
                   and @greenlight/player/server (session signalling)
shared/api.ts      Types shared by both sides
```

- The main process is bundled by esbuild straight from the `platform` and `player` TypeScript sources, so the AppImage ships no `node_modules`.
- The UI imports Greenlight's `xCloudPlayer` and `Gamepad` classes from `packages/player/src/client/lib`.
- One small change to `@greenlight/player`: `xCloudPlayer` now takes a `renderer` option (`video` | `webgpu` | `auto`), and its stats timer is cleared on destroy. The default `<video>` renderer uses VA-API hardware decoding on the Deck. WebGPU is optional and experimental.
- Your sign-in token is stored in the app's config folder. It's encrypted with the system keyring when one is available. Otherwise it's saved in a file only your user can read, which is usual in Gaming Mode.

## Frame generation (Lossless Scaling / lsfg-vk)

The app normally renders through OpenGL, and Vulkan layers like lsfg-vk can't hook OpenGL. Add `--vulkan` to the launch options to render through Vulkan instead, for example `<lsfg launch option> %command% --vulkan`. This is experimental. If video goes black or stutters, remove the flag.

## Troubleshooting

- **"Can't reach …"**: the Deck is offline, or a DNS filter is blocking Xbox/Microsoft domains.
- **Console not listed**: remote features are off, or the console is signed in to a different account.
- **Stuck on "Waking up your Xbox…"**: the console is in Energy saver mode. Switch it to Sleep.
- **Black screen with audio**: in Settings, set Video renderer to Standard.
- **App won't start from the AppImage**: try launching with `--no-sandbox`. Steam shortcut → Properties → Launch options.

## Notes

This builds on Greenlight's v3 packages, which are still alpha. Xbox's streaming APIs are unofficial and can change, so a Microsoft update can break streaming until Greenlight catches up. Not affiliated with Microsoft or Xbox.
