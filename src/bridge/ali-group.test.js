import assert from "node:assert/strict";
import test from "node:test";

import { buildAliGroupJobInput, validateAliGroupAnswer } from "./ali-group.js";

const groupJid = "123456789012@g.us";
const now = Date.parse("2026-09-30T01:00:00Z");
const event = {
  accountId: "default",
  conversationId: groupJid,
  messageId: "provider-message-1",
  senderId: "+5491112345678",
  timestamp: now - 60_000,
  body: "@lobot ¿cómo probamos débito en TEST?",
  context: "Joaquín preguntó por una tarjeta guardada.\n@lobot ¿cómo probamos débito en TEST?",
};

test("ALI mention maps to one fixed read-only job and same-group reply", () => {
  const job = buildAliGroupJobInput(event, { groupJid, now });
  assert.equal(job.source, "ali-group-mention");
  assert.equal(job.mode, "read-only");
  assert.equal(job.thread, "ali-group-dedicated");
  assert.deepEqual(job.reply, { channel: "whatsapp-ali-group", conversationId: groupJid,
    sourceMessageId: event.messageId });
  assert.equal(JSON.parse(job.prompt).body, event.body);
  assert.equal(job.idempotencyKey,
    buildAliGroupJobInput({ ...event, body: "@lobot otra pregunta" }, { groupJid, now }).idempotencyKey);
});

test("ALI mention rejects wrong group, stale event, missing identity and fake mention", () => {
  for (const changed of [
    { conversationId: "other@g.us" },
    { accountId: "other" },
    { senderId: "" },
    { messageId: "" },
    { timestamp: now - 30 * 60_000 },
    { body: "hola lobot" },
    { body: "https://site.example/@lobot" },
  ]) {
    assert.throws(() => buildAliGroupJobInput({ ...event, ...changed }, { groupJid, now }),
      TypeError);
  }
});

test("ALI group answer rejects secrets, full card numbers and oversized text", () => {
  assert.equal(validateAliGroupAnswer("Leé la issue #463."), "Leé la issue #463.");
  for (const text of ["", "x".repeat(3800), "token TEST-12345678901234567890",
    "Bearer abcdefghijklmnop", "Tarjeta 5287338310253304",
    "SUPABASE_SERVICE_ROLE_KEY=secret-value", "CVV 123", "DNI 12345678",
    "Link https://evil.example/qa"])
    assert.throws(() => validateAliGroupAnswer(text), TypeError);
});
