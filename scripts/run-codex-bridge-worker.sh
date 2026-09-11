#!/bin/zsh
set -euo pipefail

REPO_DIR="${SECRETARIO_PERSONAL_REPO:-/Users/matiasrios/Documents/GitHub/secretario-personal}"
ENV_FILE="${CODEX_BRIDGE_ENV_FILE:-${HOME}/.config/secretario-personal/codex-bridge.env}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "[codex-bridge] missing readable environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

cd "$REPO_DIR"
exec "${NODE_PATH:-$(command -v node)}" src/bridge/worker.js

