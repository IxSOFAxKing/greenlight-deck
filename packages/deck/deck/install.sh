#!/usr/bin/env bash
# Installs Greenlight Deck on a Steam Deck (or any Linux handheld).
# Run from Desktop Mode in Konsole:   bash install.sh GreenlightDeck-*.AppImage
set -euo pipefail

APPIMAGE="${1:-}"
if [[ -z "$APPIMAGE" ]]; then
  # Case-insensitive: some browsers save it as .appimage
  APPIMAGE="$(find "$(dirname "$0")" "$HOME/Downloads" -maxdepth 1 -iname 'GreenlightDeck*.appimage' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2- || true)"
fi
if [[ -z "$APPIMAGE" || ! -f "$APPIMAGE" ]]; then
  echo "Usage: bash install.sh /path/to/GreenlightDeck-x86_64.AppImage" >&2
  exit 1
fi

DEST_DIR="$HOME/Applications"
DEST="$DEST_DIR/GreenlightDeck.AppImage"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP="$HOME/.local/share/applications/greenlight-deck.desktop"

mkdir -p "$DEST_DIR" "$ICON_DIR" "$(dirname "$DESKTOP")"
cp -f "$APPIMAGE" "$DEST"
chmod +x "$DEST"

# Pull the icon out of the AppImage so Steam and the app menu can show it.
# (The top-level icon is a symlink, so extract its target too.)
TMP="$(mktemp -d)"
(
  cd "$TMP"
  "$DEST" --appimage-extract 'greenlight-deck.png' >/dev/null 2>&1 || true
  TARGET="$(readlink squashfs-root/greenlight-deck.png 2>/dev/null || true)"
  if [[ -n "$TARGET" ]]; then "$DEST" --appimage-extract "${TARGET#./}" >/dev/null 2>&1 || true; fi
) || true
if [[ -f "$TMP/squashfs-root/greenlight-deck.png" ]]; then
  cp -fL "$TMP/squashfs-root/greenlight-deck.png" "$ICON_DIR/greenlight-deck.png" || true
fi
rm -rf "$TMP"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Greenlight Deck
Comment=Stream your Xbox to your handheld
Exec="$DEST" %U
Icon=greenlight-deck
Categories=Game;
Terminal=false
StartupWMClass=greenlight-deck
EOF
update-desktop-database "$(dirname "$DESKTOP")" >/dev/null 2>&1 || true

cat <<MSG

Installed to $DEST

Next: add it to Steam so it shows up in Gaming Mode
  1. Open Steam (still in Desktop Mode)
  2. Games  →  Add a Non-Steam Game to My Library…
  3. Tick "Greenlight Deck" and click Add Selected Programs
  4. Switch back to Gaming Mode. It's in Library → Non-Steam.

Tip: in the game's controller settings, pick the "Gamepad" layout so
every button goes to your Xbox. Hold L3 + R3 in-game for the menu.
MSG
