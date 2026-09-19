#!/bin/zsh
set -euo pipefail

REPO_DIR="${SECRETARIO_PERSONAL_REPO:-/Users/matiasrios/Documents/Personal-GitHub/lobot}"
ENV_FILE="${CODEX_BRIDGE_ENV_FILE:-${HOME}/.config/secretario-personal/codex-bridge.env}"
SCRIPT_DIR="${0:A:h}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "[codex-bridge] missing readable environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

NODE_BIN="${CODEX_BRIDGE_NODE_PATH:-$(command -v node)}"
CODEX_BIN="${CODEX_PATH:-$(command -v codex)}"
export PATH="${NODE_BIN:h}:${CODEX_BIN:h}:${PATH}"

if [[ -f "${SCRIPT_DIR}/worker.js" ]]; then
  WORKER_ENTRY="${SCRIPT_DIR}/worker.js"
else
  WORKER_ENTRY="${REPO_DIR}/src/bridge/worker.js"
fi

cd "${CODEX_BRIDGE_DEFAULT_CWD:-$REPO_DIR}"
exec "$NODE_BIN" "$WORKER_ENTRY"
