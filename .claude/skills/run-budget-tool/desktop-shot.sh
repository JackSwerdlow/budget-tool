#!/usr/bin/env bash
# Screenshot the running Tauri desktop window (macOS).
#
# The Tauri WKWebView has no CDP, so this is the only handle on the desktop shell: raise its
# window and capture exactly its rect. Needs Screen Recording + Accessibility permission for the
# terminal/editor running it (System Settings → Privacy & Security). Launch the app first with
#   npm -w @budget/desktop run tauri dev -- --config '{"identifier":"com.budgettool.smoke"}'
#
# Usage: desktop-shot.sh [out.png]   (default /tmp/budget-shots/desktop.png)
set -euo pipefail

out="${1:-/tmp/budget-shots/desktop.png}"
mkdir -p "$(dirname "$out")"

# The dev binary's process name is "app" (target/debug/app), not "Budget Tool".
proc=app
pgrep -f 'target/debug/app' >/dev/null || { echo "desktop app is not running" >&2; exit 1; }

osascript -e "tell application \"System Events\" to set frontmost of process \"$proc\" to true"
sleep 1
rect=$(osascript -e "tell application \"System Events\" to tell process \"$proc\" to get {position, size} of window 1" | tr -d ' ')
screencapture -x -o -R"$rect" "$out"
echo "$out"
