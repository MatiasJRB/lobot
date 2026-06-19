#!/usr/bin/env bash
set -euo pipefail

missing=0
check_required() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "[missing] $name"
    missing=1
  else
    echo "[ok] $name is set"
  fi
}

check_optional() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "[optional-missing] $name"
  else
    echo "[ok] $name is set"
  fi
}

check_required SETUP_PASSWORD
check_required OPENCLAW_GATEWAY_TOKEN
check_required GEMINI_API_KEY
check_required DISCORD_BOT_TOKEN
check_required OPENCLAW_STATE_DIR
check_required OPENCLAW_WORKSPACE_DIR
check_optional DISCORD_GUILD_ID
check_optional DISCORD_PERSONAL_CHANNEL_ID
check_optional DISCORD_OWNER_USER_ID
check_optional DISCORD_PERSONAL_CHANNEL_TARGET
check_optional GITHUB_TOKEN

if [ "$missing" -ne 0 ]; then
  echo "One or more required variables are missing."
  exit 1
fi

echo "Environment looks ready for the personal assistant baseline."
