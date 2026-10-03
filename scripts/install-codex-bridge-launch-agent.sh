#!/bin/zsh
set -euo pipefail

LABEL="com.geome7ric.secretario.codex-bridge"
REPO_DIR="${SECRETARIO_PERSONAL_REPO:-/Users/matiasrios/Documents/Personal-GitHub/lobot}"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
INSTALL_DIR="${HOME}/.local/lib/secretario-personal-codex-bridge"
RUNNER="${INSTALL_DIR}/run-codex-bridge-worker.sh"
ENV_FILE="${CODEX_BRIDGE_ENV_FILE:-${HOME}/.config/secretario-personal/codex-bridge.env}"
LOG_DIR="${HOME}/Library/Logs/secretario-personal"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/${UID}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed ${LABEL}"
  exit 0
fi

if [[ ! -r "${REPO_DIR}/scripts/run-codex-bridge-worker.sh" ]]; then
  echo "Runner source is not readable in repo: ${REPO_DIR}" >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE with CODEX_BRIDGE_URL, CODEX_BRIDGE_TOKEN and CODEX_PATH first." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "$LOG_DIR" "$INSTALL_DIR"
chmod 600 "$ENV_FILE"
cp "${REPO_DIR}/scripts/run-codex-bridge-worker.sh" "$RUNNER"
for module in worker api-client app-server-client ali-group ali-qa-context ali-qa-auth \
  commitment-cli knowledge-query personal-os-events personal-os-notices; do
  cp "${REPO_DIR}/src/bridge/${module}.js" "${INSTALL_DIR}/${module}.js"
done
cat > "${INSTALL_DIR}/package.json" <<'JSON'
{"private":true,"type":"module"}
JSON
chmod 755 "$RUNNER" "${INSTALL_DIR}/worker.js"
chmod 644 "${INSTALL_DIR}"/*.js "${INSTALL_DIR}/package.json"

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
for attempt in 1 2 3 4 5; do
  if launchctl bootstrap "gui/${UID}" "$PLIST"; then
    break
  fi
  if [[ "$attempt" == "5" ]]; then
    echo "Could not bootstrap ${LABEL} after ${attempt} attempts" >&2
    exit 1
  fi
  sleep 1
done
launchctl kickstart -k "gui/${UID}/${LABEL}"
echo "Installed and started ${LABEL}"
