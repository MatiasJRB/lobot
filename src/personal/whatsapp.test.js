import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildExactWhatsAppCommand,
  normalizeExactWhatsAppRequest,
  projectExactWhatsAppDelivery,
} from "./whatsapp.js";

test("accepts one exact E.164 recipient and preserves message bytes", () => {
  const request = normalizeExactWhatsAppRequest({
    target: "+5492910000000",
    message: "Hola\n\n¿Cómo estás? ",
    dryRun: true,
    timeoutSeconds: 60,
  });

  assert.deepEqual(request, {
    target: "+5492910000000",
    message: "Hola\n\n¿Cómo estás? ",
    dryRun: true,
    timeoutSeconds: 60,
  });
});

test("rejects free-form numbers, JIDs, empty text and oversized text", () => {
  for (const target of ["2910000000", "+54 9 291 000 0000", "123@s.whatsapp.net"]) {
    assert.throws(
      () => normalizeExactWhatsAppRequest({ target, message: "Hola" }),
      /target must be E\.164/,
    );
  }
  assert.throws(
    () => normalizeExactWhatsAppRequest({ target: "+5492910000000", message: "  " }),
    /message is required/,
  );
  assert.throws(
    () => normalizeExactWhatsAppRequest({ target: "+5492910000000", message: "x".repeat(4001) }),
    /message is too long/,
  );
});

test("builds an exact OpenClaw command and only adds dry-run when requested", () => {
  const request = normalizeExactWhatsAppRequest({
    target: "+5492910000000",
    message: "Texto exacto",
    dryRun: true,
  });
  const args = buildExactWhatsAppCommand(request);

  assert.deepEqual(args, [
    "message", "send",
    "--channel", "whatsapp",
    "--account", "default",
    "--target", "+5492910000000",
    "--message", "Texto exacto",
    "--json", "--dry-run",
  ]);
});

test("projects a delivery result without target, message or raw output", () => {
  const projected = projectExactWhatsAppDelivery(
    {
      code: 0,
      raw: {
        status: "ok",
        messageId: "message-123",
        target: "+5492910000000",
        message: "Hola",
      },
    },
    { dryRun: false },
  );

  assert.deepEqual(projected, {
    ok: true,
    status: "ok",
    channel: "whatsapp",
    dryRun: false,
    target: { type: "provided-target" },
    messageId: "message-123",
  });
  assert.doesNotMatch(JSON.stringify(projected), /2910000000|Hola/);
});

test("requires a successful OpenClaw JSON result", () => {
  assert.deepEqual(
    projectExactWhatsAppDelivery({ code: 1, raw: null }, { dryRun: true }),
    {
      ok: false,
      status: null,
      channel: "whatsapp",
      dryRun: true,
      target: { type: "provided-target" },
      error: "delivery_failed",
    },
  );
});

test("registers the exact-send endpoint behind setup authentication", () => {
  const source = fs.readFileSync("src/server.js", "utf8");
  assert.match(
    source,
    /app\.post\("\/setup\/api\/whatsapp\/send-exact",\s*requireSetupAuth,/,
  );
  assert.match(
    source,
    /app\.post\("\/setup\/api\/whatsapp\/schedule-exact",\s*requireSetupAuth,/,
  );
});
