#!/usr/bin/env bash
set -euo pipefail

# Install/update the three daily personal Discord digests for Secretario Personal.
# These are OpenClaw command cron jobs: the Gateway executes the local collector
# and sends stdout to Discord via cron delivery.

: "${DISCORD_PERSONAL_CHANNEL_TARGET:?Set DISCORD_PERSONAL_CHANNEL_TARGET, e.g. channel:123456789012345678}"

TZ_NAME="${OPENCLAW_CRON_TZ:-America/Argentina/Buenos_Aires}"
CHANNEL="${OPENCLAW_CRON_CHANNEL:-discord}"
TARGET="${DISCORD_PERSONAL_CHANNEL_TARGET}"
APP_DIR="${PERSONAL_ASSISTANT_APP_DIR:-/app}"
TIMEOUT_SECONDS="${PERSONAL_DIGEST_CRON_TIMEOUT_SECONDS:-240}"
NO_OUTPUT_TIMEOUT_SECONDS="${PERSONAL_DIGEST_CRON_NO_OUTPUT_TIMEOUT_SECONDS:-90}"
OUTPUT_MAX_BYTES="${PERSONAL_DIGEST_CRON_OUTPUT_MAX_BYTES:-20000}"

job_id_by_name() {
  local name="$1"
  openclaw cron list --json 2>/dev/null | node -e '
const name = process.argv[1];
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const match = input.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
  if (!match) return;
  let payload;
  try { payload = JSON.parse(match[1]); } catch { return; }
  function jobsFrom(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.jobs)) return value.jobs;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return value.data;
    if (value.data && typeof value.data === "object") return jobsFrom(value.data);
    if (value.result && typeof value.result === "object") return jobsFrom(value.result);
    return [];
  }
  const job = jobsFrom(payload).find((candidate) =>
    (candidate.name || candidate.payload?.name || candidate.title) === name
  );
  if (job) process.stdout.write(String(job.id || job.jobId || job.key || job.name || ""));
});
' "$name"
}

upsert_digest_job() {
  local schedule="$1"
  local name="$2"
  local slot="$3"
  local command_argv
  command_argv="$(node -e 'console.log(JSON.stringify(["node", process.argv[1], "--slot", process.argv[2]]))' "${APP_DIR}/src/cron/run-personal-digest.js" "$slot")"
  local existing_id
  existing_id="$(job_id_by_name "$name" || true)"

  if [ -n "$existing_id" ]; then
    echo "[edit] $name -> $schedule ($TZ_NAME), slot=$slot"
    openclaw cron edit "$existing_id" \
      --cron "$schedule" \
      --tz "$TZ_NAME" \
      --command-argv "$command_argv" \
      --command-cwd "$APP_DIR" \
      --timeout-seconds "$TIMEOUT_SECONDS" \
      --no-output-timeout-seconds "$NO_OUTPUT_TIMEOUT_SECONDS" \
      --output-max-bytes "$OUTPUT_MAX_BYTES" \
      --announce \
      --channel "$CHANNEL" \
      --to "$TARGET"
    return 0
  fi

  echo "[create] $name -> $schedule ($TZ_NAME), slot=$slot"
  openclaw cron create "$schedule" \
    --name "$name" \
    --tz "$TZ_NAME" \
    --command-argv "$command_argv" \
    --command-cwd "$APP_DIR" \
    --timeout-seconds "$TIMEOUT_SECONDS" \
    --no-output-timeout-seconds "$NO_OUTPUT_TIMEOUT_SECONDS" \
    --output-max-bytes "$OUTPUT_MAX_BYTES" \
    --announce \
    --channel "$CHANNEL" \
    --to "$TARGET"
}

upsert_digest_job "0 9 * * *" "Personal digest — mañana" "morning"
upsert_digest_job "0 15 * * *" "Personal digest — tarde" "afternoon"
upsert_digest_job "0 21 * * *" "Personal digest — noche" "night"

echo "[done] Personal command cron digests installed/updated."
