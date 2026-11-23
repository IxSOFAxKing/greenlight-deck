# Changelog

Each `## <version>` section becomes the release notes shown in the app's updater.

## 0.3.0
- Reconnects automatically when the connection drops mid-game (up to 3 tries, waits for Wi-Fi to come back)
- Detects a frozen stream even when the connection still looks fine
- New stream settings: max bitrate (5–30 Mbps or Auto) and video profile (High quality, Balanced, Low latency)
- Cloud library: search with an on-screen keyboard, genre filters, bigger box art, game details with estimated wait time
- Debug log in Settings: copy or save it when something goes wrong (tokens are removed automatically)

## 0.2.0
- In-app updates: Settings → Check for updates (also checks quietly at launch)
- `--vulkan` launch option for Lossless Scaling frame generation (lsfg-vk)
- Installer finds the AppImage even when it's saved as `.appimage`

## 0.1.0
- First version: controller-first UI, QR sign-in, console wake and stream, xCloud library, in-game menu
