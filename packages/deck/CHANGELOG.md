# Changelog

Each `## <version>` section becomes the release notes shown in the app's updater.

## 0.3.4
- Smooth fast scrolling: holding a direction no longer makes the list lag behind the highlight and catch up when you let go
- Scrolling back up to the top shows the whole top of the page, so the search bar and categories are no longer cut off
- Lighter on the Deck while scrolling large lists

## 0.3.3
- Fixed: controls working only some of the time. When the Xbox finished connecting, the streaming code told it the controller had disconnected, and also dropped the controller if it was already attached. Whether controls worked depended on which happened first
- Shorter debug log (long connection details are trimmed)

## 0.3.2
- Fixed: the controller not working in the Xbox stream (menus worked). Reading a controller without a Guide button (like Steam's virtual pad) crashed the input loop, which then stopped for good
- The input loop now survives any error and keeps sending your controls
- The stream combines input from every controller you actually use, so dead or phantom devices on the Steam Deck can't block your input

## 0.3.1
- Fixed: controls sometimes not working after connecting. The stream now uses the controller you're actually pressing (the Steam Deck lists more than one) and switches automatically if needed
- Fixed: closing the in-game menu could leave the controller paused if a device reported a stuck button
- Cloud library opens instantly after the first load (cached), refreshes quietly in the background, loads from your region's server, and downloads smaller box art
- Fixed: a background refresh could move the highlight while you were typing a search
- The debug log now lists connected controllers and cloud loading times

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
