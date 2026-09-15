import crypto from "node:crypto";
import path from "node:path";

import { normalizeExactWhatsAppRequest } from "./whatsapp.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const EXPLICIT_ZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;
const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export function normalizeScheduledWhatsAppRequest(raw = {}, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const exact = normalizeExactWhatsAppRequest({
    target: raw.target,
    message: raw.message,
    timeoutSeconds: raw.timeoutSeconds,
    dryRun: false,
  });
  const idempotencyKey =
    typeof raw.idempotencyKey === "string" ? raw.idempotencyKey.trim() : "";
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error("idempotencyKey is invalid");
  }
  if (raw.confirmExternal !== true) {
    throw new Error("confirmExternal must be true");
  }

  const sendAt = typeof raw.sendAt === "string" ? raw.sendAt.trim() : "";
  if (!sendAt || !EXPLICIT_ZONE_PATTERN.test(sendAt)) {
    throw new Error("sendAt must be an ISO timestamp with an explicit timezone");
  }
  const sendAtMs = Date.parse(sendAt);
  if (!Number.isFinite(sendAtMs)) {
    throw new Error("sendAt must be a valid ISO timestamp");
  }
  if (sendAtMs <= now.getTime()) {
    throw new Error("sendAt must be in the future");
  }
  if (sendAtMs - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
    throw new Error("sendAt is too far in the future");
  }

  return {
    ...exact,
    sendAt: new Date(sendAtMs).toISOString(),
    idempotencyKey,
  };
}

export function scheduledWhatsAppDigest(request) {
  return crypto
    .createHash("sha256")
    .update(request.idempotencyKey)
    .update("\0")
    .update(request.target)
    .update("\0")
    .update(request.message)
    .update("\0")
    .update(request.sendAt)
    .digest("hex");
}

export function scheduledWhatsAppJobPath(rootDir, idempotencyKey) {
  const fileName = crypto
    .createHash("sha256")
    .update(idempotencyKey)
    .digest("hex");
  return path.join(rootDir, `${fileName}.json`);
}

export function buildScheduledWhatsAppCronArgs(record, opts = {}) {
  const nodePath = opts.nodePath || "node";
  const cwd = opts.cwd || process.cwd();
  const runnerPath =
    opts.runnerPath || path.join(cwd, "src", "cron", "run-scheduled-whatsapp.js");
  const commandArgv = [nodePath, runnerPath, "--job-file", record.jobFile];
  const safeSuffix = record.digest.slice(0, 12);

  return [
    "cron",
    "add",
    "--name",
    `WhatsApp programado · ${safeSuffix}`,
    "--declaration-key",
    `scheduled-whatsapp:${record.idempotencyKey}`,
    "--at",
    record.sendAt,
    "--delete-after-run",
    "--command-argv",
    JSON.stringify(commandArgv),
    "--command-cwd",
    cwd,
    "--timeout-seconds",
    String(opts.timeoutSeconds || 180),
    "--no-output-timeout-seconds",
    String(opts.noOutputTimeoutSeconds || 120),
    "--output-max-bytes",
    String(opts.outputMaxBytes || 4000),
    "--no-deliver",
    "--json",
  ];
}

export function buildScheduledWhatsAppFailureAlertArgs(jobId, target) {
  const cleanJobId = typeof jobId === "string" ? jobId.trim() : "";
  const cleanTarget = typeof target === "string" ? target.trim() : "";
  if (!cleanJobId) throw new Error("cron job id is required");
  if (!cleanTarget) throw new Error("failure alert target is required");
  return [
    "cron",
    "edit",
    cleanJobId,
    "--failure-alert",
    "--failure-alert-after",
    "1",
    "--failure-alert-cooldown",
    "1h",
    "--failure-alert-channel",
    "whatsapp",
    "--failure-alert-to",
    cleanTarget,
    "--failure-alert-exclude-skipped",
    "--json",
  ];
}

export function cronJobIdFrom(raw) {
  return (
    raw?.id ||
    raw?.job?.id ||
    raw?.result?.id ||
    raw?.data?.id ||
    raw?.result?.job?.id ||
    null
  );
}

export function projectScheduledWhatsApp(record, opts = {}) {
  const response = {
    ok: ["scheduled", "completed"].includes(record.status),
    owner: "lobot-openclaw",
    scheduler: "openclaw",
    executor: "lobot-openclaw",
    idempotencyKey: record.idempotencyKey,
    sendAt: record.sendAt,
    status: record.status,
  };
  if (record.cronJobId) response.jobId = record.cronJobId;
  if (record.messageId) response.messageId = record.messageId;
  if (opts.duplicateSuppressed) response.duplicateSuppressed = true;
  return response;
}
