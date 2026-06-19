#!/bin/bash
set -euo pipefail

chown -R openclaw:openclaw /data
chmod 700 /data

if [ ! -d /data/.linuxbrew ]; then
  cp -a /home/linuxbrew/.linuxbrew /data/.linuxbrew
fi

rm -rf /home/linuxbrew/.linuxbrew
ln -sfn /data/.linuxbrew /home/linuxbrew/.linuxbrew
chown -h openclaw:openclaw /home/linuxbrew/.linuxbrew

OPENCLAW_VERSION_VALUE="${OPENCLAW_VERSION:-latest}"
if [ "$OPENCLAW_VERSION_VALUE" = "" ] || [ "$OPENCLAW_VERSION_VALUE" = "latest" ]; then
  OPENCLAW_INSTALL_SPEC="openclaw@latest"
elif [[ "$OPENCLAW_VERSION_VALUE" == v* ]]; then
  OPENCLAW_INSTALL_SPEC="openclaw@${OPENCLAW_VERSION_VALUE}"
else
  OPENCLAW_INSTALL_SPEC="openclaw@v${OPENCLAW_VERSION_VALUE}"
fi

echo "[entrypoint] installing ${OPENCLAW_INSTALL_SPEC}"
npm install -g "$OPENCLAW_INSTALL_SPEC"

STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/data/workspace}"
mkdir -p "$STATE_DIR" "$STATE_DIR/npm" "$STATE_DIR/npm/projects" "$WORKSPACE_DIR"
if [ -d /app/seed-workspace ]; then
  echo "[entrypoint] seeding workspace defaults into ${WORKSPACE_DIR} (non-destructive)"
  cp -an /app/seed-workspace/. "$WORKSPACE_DIR"/
fi
# Railway volumes may preserve dirs from failed prior boots; repair them every boot.
chown -R openclaw:openclaw /data "$STATE_DIR" "$WORKSPACE_DIR" /home/openclaw || true
chmod 700 /data "$STATE_DIR" "$WORKSPACE_DIR" || true
find "$STATE_DIR" "$WORKSPACE_DIR" -type d -exec chmod u+rwx {} + 2>/dev/null || true
find "$STATE_DIR" "$WORKSPACE_DIR" -type f -exec chmod u+rw {} + 2>/dev/null || true
ls -ld /data "$STATE_DIR" "$STATE_DIR/npm" "$STATE_DIR/npm/projects" "$WORKSPACE_DIR"

exec gosu openclaw node src/server.js
