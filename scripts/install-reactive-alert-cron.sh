#!/usr/bin/env bash
set -euo pipefail

# Install/update the reactive personal alert cron for Secretario Personal.
# High-frequency OpenClaw command cron: runs the reactive collector and only
# emits output (delivered to the channel) when a NEW P0/P1 signal appears.
# The dedup store keeps it silent otherwise, so a short interval is safe.

: "${DISCORD_PERSONAL_CHANNEL_TARGET:?Set DISCORD_PERSONAL_CHANNEL_TARGET, e.g. channel:123456789012345678}"

TZ_NAME="${OPENCLAW_CRON_TZ:-America/Argentina/Buenos_Aires}"
CHANNEL="${OPENCLAW_CRON_CHANNEL:-discord}"
TARGET="${DISCORD_PERSONAL_CHANNEL_TARGET}"
APP_DIR="${PERSONAL_ASSISTANT_APP_DIR:-/app}"
SCHEDULE="${REACTIVE_ALERT_CRON:-*/15 * * * *}"
JOB_NAME="${REACTIVE_ALERT_JOB_NAME:-Personal reactive alerts}"
TIMEOUT_SECONDS="${REACTIVE_ALERT_CRON_TIMEOUT_SECONDS:-120}"
NO_OUTPUT_TIMEOUT_SECONDS="${REACTIVE_ALERT_CRON_NO_OUTPUT_TIMEOUT_SECONDS:-60}"
OUTPUT_MAX_BYTES="${REACTIVE_ALERT_CRON_OUTPUT_MAX_BYTES:-8000}"

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

command_argv="$(node -e 'console.log(JSON.stringify(["node", process.argv[1]]))' "${APP_DIR}/src/cron/run-reactive-alert.js")"
existing_id="$(job_id_by_name "$JOB_NAME" || true)"

if [ -n "$existing_id" ]; then
  echo "[edit] $JOB_NAME -> $SCHEDULE ($TZ_NAME)"
  openclaw cron edit "$existing_id" \
    --cron "$SCHEDULE" \
    --tz "$TZ_NAME" \
    --command-argv "$command_argv" \
    --command-cwd "$APP_DIR" \
    --timeout-seconds "$TIMEOUT_SECONDS" \
    --no-output-timeout-seconds "$NO_OUTPUT_TIMEOUT_SECONDS" \
    --output-max-bytes "$OUTPUT_MAX_BYTES" \
    --announce \
    --channel "$CHANNEL" \
    --to "$TARGET"
else
  echo "[create] $JOB_NAME -> $SCHEDULE ($TZ_NAME)"
  openclaw cron create "$SCHEDULE" \
    --name "$JOB_NAME" \
    --tz "$TZ_NAME" \
    --command-argv "$command_argv" \
    --command-cwd "$APP_DIR" \
    --timeout-seconds "$TIMEOUT_SECONDS" \
    --no-output-timeout-seconds "$NO_OUTPUT_TIMEOUT_SECONDS" \
    --output-max-bytes "$OUTPUT_MAX_BYTES" \
    --announce \
    --channel "$CHANNEL" \
    --to "$TARGET"
fi

echo "[done] Reactive alert command cron installed/updated."
echo "[note] Verificá en Railway que una corrida sin novedades NO postee mensaje vacío;"
echo "[note] si postea vacío, bajá la frecuencia o migrá a push por webhook (issue #18)."
