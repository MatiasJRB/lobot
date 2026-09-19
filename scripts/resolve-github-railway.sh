#!/usr/bin/env bash
set -euo pipefail

# One-shot resolver for Clawbot Personal:
# 1) create a NEW GitHub repo with gh CLI
# 2) push this local repo
# 3) create/link Railway project/service
# 4) configure Railway vars + /data volume + public domain
#
# Requires working network + valid auth:
#   gh auth login -h github.com
#   railway login
# Optional env before running:
#   DISCORD_BOT_TOKEN=...
#   DISCORD_GUILD_ID=...
#   DISCORD_PERSONAL_CHANNEL_ID=...
#   DISCORD_OWNER_USER_ID=...

REPO_OWNER="${REPO_OWNER:-MatiasJRB}"
REPO_NAME="${REPO_NAME:-lobot}"
REPO_FULL="${REPO_OWNER}/${REPO_NAME}"
PROJECT_NAME="${RAILWAY_PROJECT_NAME:-lobot}"
SERVICE_NAME="${RAILWAY_SERVICE_NAME:-clawbot-personal-openclaw}"
SECRET_FILE="${GEMINI_SECRET_FILE:-/Users/matiasrios/Documents/Personal-GitHub/personal-assistant-secrets/gemini-api-key-details.txt}"
BUNDLED_NODE="${BUNDLED_NODE:-/Users/matiasrios/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
RAILWAY_JS="${RAILWAY_JS:-/Users/matiasrios/.nvm/versions/node/v20.19.4/lib/node_modules/@railway/cli/bin/railway.js}"

railway_cmd() {
  if [ -x "$BUNDLED_NODE" ] && [ -f "$RAILWAY_JS" ]; then
    "$BUNDLED_NODE" "$RAILWAY_JS" "$@"
  else
    railway "$@"
  fi
}

redact() {
  sed -E 's/(token|secret|key|password)([^[:alnum:]]+)[^[:space:]]+/\1\2[REDACTED]/Ig'
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1" >&2; exit 1; }
}

extract_gemini_key() {
  if [ ! -f "$SECRET_FILE" ]; then
    echo "Gemini secret file not found: $SECRET_FILE" >&2
    exit 1
  fi
  awk 'found {print; exit} /Clave de API/ {found=1}' "$SECRET_FILE" | tr -d '\r\n'
}

require_cmd git

if [ "${SKIP_GITHUB:-0}" = "1" ]; then
  printf '[1-3/8] Skipping GitHub repo creation/push because SKIP_GITHUB=1...\n'
  git remote -v || true
else
  require_cmd gh
  printf '[1/8] Checking GitHub CLI auth...\n'
  gh auth status >/dev/null

  printf '[2/8] Creating new GitHub repo %s if needed...\n' "$REPO_FULL"
  if gh repo view "$REPO_FULL" >/dev/null 2>&1; then
    echo "Repo already exists: $REPO_FULL"
  else
    gh repo create "$REPO_FULL" \
      --private \
      --description "Personal OpenClaw assistant on Railway with Gemini and Discord"
  fi

  printf '[3/8] Pushing local repo to GitHub...\n'
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "https://github.com/${REPO_FULL}.git"
  else
    git remote add origin "https://github.com/${REPO_FULL}.git"
  fi
  git branch -M main
  git push -u origin main
fi

printf '[4/8] Checking Railway CLI auth...\n'
railway_cmd whoami >/dev/null

printf '[5/8] Creating/linking Railway project...\n'
if railway_cmd status >/dev/null 2>&1; then
  echo "Railway project already linked:"
  railway_cmd status | redact
elif [ -n "${RAILWAY_PROJECT_ID:-}" ]; then
  railway_cmd link \
    --project "$RAILWAY_PROJECT_ID" \
    ${RAILWAY_SERVICE_ID:+--service "$RAILWAY_SERVICE_ID"} \
    ${RAILWAY_ENVIRONMENT:+--environment "$RAILWAY_ENVIRONMENT"} \
    ${RAILWAY_WORKSPACE:+--workspace "$RAILWAY_WORKSPACE"} \
    --json | redact
else
  railway_cmd init \
    --name "$PROJECT_NAME" \
    ${RAILWAY_WORKSPACE:+--workspace "$RAILWAY_WORKSPACE"} \
    --json | redact || railway_cmd link ${RAILWAY_WORKSPACE:+--workspace "$RAILWAY_WORKSPACE"}
fi

printf '[6/8] Creating/linking Railway service...\n'
# If service already exists, this may fail; then link/select manually with railway service link.
railway_cmd add --service "$SERVICE_NAME" --json 2>/tmp/railway-add-service.json || true
cat /tmp/railway-add-service.json 2>/dev/null | redact || true
railway_cmd service "$SERVICE_NAME" >/dev/null 2>&1 || true

printf '[7/8] Setting Railway variables and volume...\n'
SETUP_PASSWORD_VALUE="${SETUP_PASSWORD:-$(openssl rand -base64 24 | tr -d '\n')}"
GATEWAY_TOKEN_VALUE="${OPENCLAW_GATEWAY_TOKEN:-$(openssl rand -hex 32)}"
GEMINI_KEY_VALUE="${GEMINI_API_KEY:-$(extract_gemini_key)}"

railway_cmd variable set \
  "SETUP_PASSWORD=${SETUP_PASSWORD_VALUE}" \
  "OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN_VALUE}" \
  "PORT=8080" \
  "OPENCLAW_GATEWAY_PORT=8080" \
  "OPENCLAW_STATE_DIR=/data/.openclaw" \
  "OPENCLAW_WORKSPACE_DIR=/data/workspace" \
  "OPENCLAW_VERSION=latest" \
  "GEMINI_MODEL=${GEMINI_MODEL:-google/gemini-3.1-flash-lite}" \
  "OPENCLAW_DEFAULT_MODEL=${OPENCLAW_DEFAULT_MODEL:-google/gemini-3.1-flash-lite}" \
  "DISCORD_REQUIRE_MENTION=${DISCORD_REQUIRE_MENTION:-false}" \
  --skip-deploys >/dev/null

printf '%s' "$GEMINI_KEY_VALUE" | railway_cmd variable set GEMINI_API_KEY --stdin --skip-deploys >/dev/null

if [ -n "${DISCORD_BOT_TOKEN:-}" ]; then
  printf '%s' "$DISCORD_BOT_TOKEN" | railway_cmd variable set DISCORD_BOT_TOKEN --stdin --skip-deploys >/dev/null
fi
[ -n "${DISCORD_GUILD_ID:-}" ] && railway_cmd variable set "DISCORD_GUILD_ID=${DISCORD_GUILD_ID}" --skip-deploys >/dev/null || true
[ -n "${DISCORD_PERSONAL_CHANNEL_ID:-}" ] && railway_cmd variable set "DISCORD_PERSONAL_CHANNEL_ID=${DISCORD_PERSONAL_CHANNEL_ID}" "DISCORD_PERSONAL_CHANNEL_TARGET=channel:${DISCORD_PERSONAL_CHANNEL_ID}" --skip-deploys >/dev/null || true
[ -n "${DISCORD_OWNER_USER_ID:-}" ] && railway_cmd variable set "DISCORD_OWNER_USER_ID=${DISCORD_OWNER_USER_ID}" --skip-deploys >/dev/null || true

railway_cmd volume add --mount-path /data --json 2>/tmp/railway-volume.json || true
cat /tmp/railway-volume.json 2>/dev/null | redact || true

printf '[8/8] Deploying and generating public domain...\n'
railway_cmd up --detach
railway_cmd domain --port 8080 --service "$SERVICE_NAME" --json | tee /tmp/secretario-personal-railway-domain.json | redact || true

cat <<SUMMARY

DONE.
GitHub repo: https://github.com/${REPO_FULL}
Railway setup URL: open the generated Railway domain + /setup
Setup password was generated/set in Railway; if you did not pass SETUP_PASSWORD env, retrieve it from Railway Variables.
SUMMARY
