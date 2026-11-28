# Changelog

Each `## <version>` section becomes the release notes shown in the app's updater.

## 0.4.5
- Greenlight Deck now has its own artwork in your Steam library: cover, wide banner, header background and logo
- It's added automatically the first time you open the app after adding it to Steam. If it doesn't show straight away, restart Steam (or the Deck)
- Art you've set yourself is never replaced

## 0.4.4
- Fixed: the stream going black after being idle. When your Xbox ends the session (usually after a while with no input), the app now says so and offers Reconnect, instead of leaving a black screen
- Fixed: messages from your Xbox (like inactivity warnings) froze the app behind an invisible pop-up. They now appear as a controller-friendly dialog over the stream
- If the stream stops for any other reason, the app notices and reconnects automatically

## 0.4.3
- The About section on game details no longer expands when you scroll past it. Press A on it to open the full description in a pop-up
- The pop-up scrolls smoothly with either stick (speed follows how far you push), steadily with the D-pad, and a page at a time with LB/RB

## 0.4.2
- Bigger, richer game details page: large background art, age rating, star rating, release year, player count, full description, publisher and developer, a features list, and screenshots you can open full screen (LB/RB to flip through)
- Details come from the Microsoft Store catalog, which also fills in covers, logos and backgrounds the Game Pass catalog doesn't have
- Fixed: some covers didn't load because the link used http (the app only loads images over https)
- The debug log now records which covers fail to load and why, plus a summary of where covers came from

## 0.4.1
- Redesigned game details: full-screen background art, the game's logo as its title, and the box art at its proper shape (it was squashed thin)
- Fewer missing covers: the app looks for art under more names, only asks for resized images where that's supported, and falls back to the full-size image if a resized one fails
- Games with no art at all get a clean title card instead of two letters
- Xbox One X, One S and the original Xbox One each get their own picture (they all showed a Series X before)
- The debug log notes how many cloud games had no art, to help track down the rest

## 0.4.0
- Multiple Xbox accounts: add as many as you like. Each stays signed in, so switching never needs a new sign-in
- "Who's playing?" picker at launch when more than one account is saved (can be turned off in Settings)
- Switch profiles from the home screen with the View button, or tap your gamertag in the top right
- Remove an account from the picker (Y). Sign out now only removes the current account
- Your existing sign-in carries over automatically
- Clearer stream quality options: "720p (less data)" and "Up to 1440p (sharpest)". The second asks your Xbox for PC quality, which is up to 1440p on a Series X
- If the Deck is offline at launch, the app says so and offers Try again, instead of saying your sign-in expired

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
