#!/usr/bin/env bash
# Installs Shelf Studio as a systemd user service and an app-menu launcher for this clone.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)" || { echo "Node.js 22+ is required." >&2; exit 1; }
CODEX="$(command -v codex)" || { echo "Codex CLI not found. Install it with: npm install -g @openai/codex" >&2; exit 1; }
SAFE_PATH="$(dirname "$CODEX"):$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin"
render() { sed -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@NODE@|$NODE|g" -e "s|@CODEX@|$CODEX|g" -e "s|@PATH@|$SAFE_PATH|g" "$1"; }
mkdir -p ~/.config/systemd/user ~/.local/share/applications
render "$APP_DIR/linux/shelf-studio.service" > ~/.config/systemd/user/shelf-studio.service
if [ -n "${CODEX_MODEL:-}" ]; then sed -i "/^Environment=CODEX_BIN=/a Environment=CODEX_MODEL=$CODEX_MODEL" ~/.config/systemd/user/shelf-studio.service; fi
render "$APP_DIR/linux/shelf-studio.desktop" > ~/.local/share/applications/shelf-studio.desktop
systemctl --user daemon-reload
systemctl --user enable shelf-studio.service
systemctl --user restart shelf-studio.service
echo "Shelf Studio is running at http://localhost:4317 and starts when you sign in."
