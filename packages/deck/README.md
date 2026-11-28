# Greenlight Deck

A controller-first, handheld-friendly frontend for streaming your Xbox (and Xbox Cloud Gaming) to a Steam Deck. The streaming itself is Greenlight's: this app uses the `@greenlight/platform` and `@greenlight/player` packages from this repo and puts a new UI on top.

- **My Xbox**: lists your consoles, shows whether each one is on or asleep, and can wake one up before streaming
- **Cloud**: your Xbox Cloud Gaming library, with search, genre filters, game details and estimated wait times. Only shown if your account has cloud gaming
- **Settings**: 720p/1080p, max bitrate, video profile, fit or stretch the picture, performance stats, vibration, auto-reconnect, updates, a debug log, and signing out
- **Profiles**: keep several Xbox accounts signed in and switch between them with the View button
- **Auto-reconnect**: if Wi-Fi drops mid-game, the app rejoins your Xbox on its own
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
5. Open it once and it gives itself library artwork (cover, banner, header and logo). Restart Steam if the art doesn't appear right away. Any art you set yourself is left alone.

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
| | View (on Home) | Switch profile |
| | X (on a console) | Wake it up |
| | X (in Cloud) | Search |
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
yarn deck test:ui      # UI smoke test with mock data (run under xvfb-run on a headless box)
```

Every push to `main` runs the **Greenlight Deck CI** workflow: typecheck, build, the UI smoke test, and a test AppImage you can download from the run's Artifacts.

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

When something goes wrong, open **Settings → Debug log** and choose **Copy to clipboard** or **Save to Downloads**. Tokens are removed from the log automatically.

- **"Can't reach …"**: the Deck is offline, or a DNS filter is blocking Xbox/Microsoft domains.
- **Console not listed**: remote features are off, or the console is signed in to a different account.
- **Stuck on "Waking up your Xbox…"**: the console is in Energy saver mode. Switch it to Sleep.
- **Controls don't respond in a game**: press any button once. The stream switches to the controller you're using. If it still doesn't respond, the debug log's `Controllers:` line shows which controllers the app can see.
- **Stream ends when you're away**: Xbox ends remote play sessions after a while with no input. The app shows "Stream ended by your Xbox": press A to reconnect. If the console also goes to sleep, set **Settings → General → Power options → "Turn off after"** on the Xbox to a longer time.
- **Black screen with audio**: in Settings, set Video renderer to Standard.
- **App won't start from the AppImage**: try launching with `--no-sandbox`. Steam shortcut → Properties → Launch options.

## Notes

This builds on Greenlight's v3 packages, which are still alpha. Xbox's streaming APIs are unofficial and can change, so a Microsoft update can break streaming until Greenlight catches up. Not affiliated with Microsoft or Xbox.
