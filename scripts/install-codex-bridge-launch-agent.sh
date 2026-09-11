#!/bin/zsh
set -euo pipefail

LABEL="com.geome7ric.secretario.codex-bridge"
REPO_DIR="${SECRETARIO_PERSONAL_REPO:-/Users/matiasrios/Documents/GitHub/secretario-personal}"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
RUNNER="${REPO_DIR}/scripts/run-codex-bridge-worker.sh"
ENV_FILE="${CODEX_BRIDGE_ENV_FILE:-${HOME}/.config/secretario-personal/codex-bridge.env}"
LOG_DIR="${HOME}/Library/Logs/secretario-personal"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/${UID}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed ${LABEL}"
  exit 0
fi

if [[ ! -x "$RUNNER" ]]; then
  echo "Runner is not executable: $RUNNER" >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE with CODEX_BRIDGE_URL, CODEX_BRIDGE_TOKEN and CODEX_PATH first." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "$LOG_DIR"
chmod 600 "$ENV_FILE"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${RUNNER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/codex-bridge.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/codex-bridge.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST"
launchctl bootout "gui/${UID}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID}" "$PLIST"
launchctl kickstart -k "gui/${UID}/${LABEL}"
echo "Installed and started ${LABEL}"

