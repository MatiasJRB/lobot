#!/usr/bin/env bash
set -euo pipefail
# Optional local Railway MCP fallback. The project MCP config uses Railway's hosted MCP:
#   https://mcp.railway.com
# This script is kept for local stdio usage if Railway CLI is upgraded to a version with `railway mcp`.
NODE_BIN="/Users/matiasrios/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
RAILWAY_JS="/Users/matiasrios/.nvm/versions/node/v20.19.4/lib/node_modules/@railway/cli/bin/railway.js"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="/Users/matiasrios/.nvm/versions/node/v22.22.1/bin/node"
fi
if [[ ! -f "$RAILWAY_JS" ]]; then
  echo "Railway CLI not found at $RAILWAY_JS" >&2
  exit 127
fi
exec "$NODE_BIN" "$RAILWAY_JS" mcp "$@"
