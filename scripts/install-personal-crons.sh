#!/usr/bin/env bash
set -euo pipefail

# Install the initial three daily Discord digests for Clawbot Personal.
# Run this inside the Railway shell/container or OpenClaw environment after setup.

: "${DISCORD_PERSONAL_CHANNEL_TARGET:?Set DISCORD_PERSONAL_CHANNEL_TARGET, e.g. channel:123456789012345678}"

TZ_NAME="${OPENCLAW_CRON_TZ:-America/Argentina/Buenos_Aires}"
CHANNEL="${OPENCLAW_CRON_CHANNEL:-discord}"
TARGET="${DISCORD_PERSONAL_CHANNEL_TARGET}"

create_if_missing() {
  local schedule="$1"
  local name="$2"
  local prompt="$3"

  if openclaw cron list 2>/dev/null | grep -Fq "$name"; then
    echo "[skip] cron already exists: $name"
    return 0
  fi

  echo "[create] $name -> $schedule ($TZ_NAME)"
  openclaw cron create "$schedule" "$prompt" \
    --name "$name" \
    --tz "$TZ_NAME" \
    --session isolated \
    --announce \
    --channel "$CHANNEL" \
    --to "$TARGET"
}

create_if_missing "0 9 * * *" \
  "Personal digest — mañana" \
  "Usá seed-workspace/prompts/digest.md. Prepará el digest personal de la mañana para Matías: agenda de hoy, mails/GitHub importantes, vencimientos, seguridad y próximos pasos. No mezcles Mango salvo impacto personal claro."

create_if_missing "0 15 * * *" \
  "Personal digest — tarde" \
  "Usá seed-workspace/prompts/digest.md. Revisá novedades personales desde la mañana y marcá solo lo que cambia prioridades de Matías para la tarde/noche."

create_if_missing "0 21 * * *" \
  "Personal digest — noche" \
  "Usá seed-workspace/prompts/digest.md. Cerrá el día personal de Matías: pendientes que quedan, agenda de mañana, alertas de dinero/seguridad/servicios y automatizaciones candidatas."

echo "[done] Personal cron digests installed/listed."
