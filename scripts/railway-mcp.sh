#!/usr/bin/env bash
set -euo pipefail
NODE_BIN="/Users/matiasrios/.nvm/versions/node/v22.22.1/bin/node"
NPX_CLI="/Users/matiasrios/.nvm/versions/node/v22.22.1/lib/node_modules/npm/bin/npx-cli.js"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="/Users/matiasrios/.nvm/versions/node/v20.19.4/bin/node"
  NPX_CLI="/Users/matiasrios/.nvm/versions/node/v20.19.4/lib/node_modules/npm/bin/npx-cli.js"
fi
export PATH="$(dirname "$NODE_BIN"):/Users/matiasrios/.nvm/versions/node/v20.19.4/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
exec "$NODE_BIN" "$NPX_CLI" -y @railway/mcp-server "$@"
