import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScheduledWhatsAppCronArgs,
  normalizeScheduledWhatsAppRequest,
  projectScheduledWhatsApp,
  scheduledWhatsAppDigest,
  scheduledWhatsAppJobPath,
} from "./scheduled-whatsapp.js";

const raw = {
  target: "+5492910000000",
  message: "Texto exacto\nsegunda línea",
  sendAt: "2026-09-15T09:00:00-03:00",
  idempotencyKey: "followup-20260915-0900",
  confirmExternal: true,
  timeoutSeconds: 90,
};

test("normalizes an explicitly authorized future schedule to UTC", () => {
  const request = normalizeScheduledWhatsAppRequest(raw, {
    now: new Date("2026-09-14T12:00:00Z"),
  });
  assert.equal(request.sendAt, "2026-09-15T12:00:00.000Z");
  assert.equal(request.message, raw.message);
  assert.equal(request.target, raw.target);
});

test("rejects missing authorization, ambiguous timezone and past timestamps", () => {
  assert.throws(
    () => normalizeScheduledWhatsAppRequest({ ...raw, confirmExternal: false }),
    /confirmExternal must be true/,
  );
  assert.throws(
    () => normalizeScheduledWhatsAppRequest({ ...raw, sendAt: "2026-09-15T09:00:00" }),
    /explicit timezone/,
  );
  assert.throws(
    () => normalizeScheduledWhatsAppRequest(raw, {
      now: new Date("2026-09-16T12:00:00Z"),
    }),
    /future/,
  );
});

test("cron payload contains only the private job file, never target or message", () => {
  const request = normalizeScheduledWhatsAppRequest(raw, {
    now: new Date("2026-09-14T12:00:00Z"),
  });
  const record = {
    ...request,
    digest: scheduledWhatsAppDigest(request),
    jobFile: scheduledWhatsAppJobPath("/data/private", request.idempotencyKey),
  };
  const args = buildScheduledWhatsAppCronArgs(record, {
    cwd: "/app",
    nodePath: "node",
  });
  const serialized = JSON.stringify(args);

  assert.ok(args.includes("--at"));
  assert.ok(args.includes("--delete-after-run"));
  assert.ok(args.includes("--no-deliver"));
  assert.doesNotMatch(serialized, /\+5492910000000/);
  assert.doesNotMatch(serialized, /Texto exacto/);
  const argv = JSON.parse(args[args.indexOf("--command-argv") + 1]);
  assert.deepEqual(argv, [
    "node",
    "/app/src/cron/run-scheduled-whatsapp.js",
    "--job-file",
    record.jobFile,
  ]);
});

test("status projection proves OpenClaw ownership without PII", () => {
  const projected = projectScheduledWhatsApp({
    status: "scheduled",
    idempotencyKey: raw.idempotencyKey,
    sendAt: "2026-09-15T12:00:00.000Z",
    cronJobId: "job-123",
    target: raw.target,
    message: raw.message,
  });
  assert.deepEqual(projected, {
    ok: true,
    owner: "lobot-openclaw",
    scheduler: "openclaw",
    executor: "lobot-openclaw",
    idempotencyKey: raw.idempotencyKey,
    sendAt: "2026-09-15T12:00:00.000Z",
    status: "scheduled",
    jobId: "job-123",
  });
  assert.doesNotMatch(JSON.stringify(projected), /2910000000|Texto exacto/);
});
