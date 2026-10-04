import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pullPersonalOsEvents } from "./personal-os-events.js";

test("ALI product conversation is excluded from Secretary inbox and quarantine while cursor advances", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-ali-exclude-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const group = "123456789012@g.us";
  const events = [{ conversation_id: group, content_preview: "ALI private product definition" },
    { event_type: "delivery_receipt", conversation_id: group, private: "receipt" }];
  const api = { async listPersonalOsEvents() { return { ok: true, events, nextCursor: 123, hasMore: false }; } };
  const result = await pullPersonalOsEvents(api, { directory, excludeConversations: [group] });
  assert.deepEqual(result, { imported: 0, quarantined: 0, cursor: 123 });
  assert.equal(fs.existsSync(path.join(directory, "openclaw-events.ndjson")), false);
  assert.equal(fs.existsSync(path.join(directory, "openclaw-events-quarantine.ndjson")), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "openclaw-event-cursor.json"))).cursor, 123);
});

test("Mac bridge durably polls private attributed events without card inference", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-pull-"));
  fs.chmodSync(directory, 0o700);
  try {
    const event = { version: 1, event_type: "incoming_message", channel: "whatsapp",
      source_event_id: crypto.createHash("sha256").update("test").digest("hex"),
      account_id: "default", conversation_id: "chat", message_id: "msg",
      sender_id: "sender", content_sha256: crypto.createHash("sha256").update("hola").digest("hex"),
      content_preview: "hola", content_truncated: false,
      modality: "text", occurred_at: "2026-09-16T10:00:00Z", timestamp_origin: "provider",
      finance_authorization: false };
    const calls = [];
    const api = { async listPersonalOsEvents(cursor) {
      calls.push(cursor);
      return cursor === 0 ? { ok: true, events: [event], nextCursor: 123, hasMore: false }
        : { ok: true, events: [], nextCursor: 123, hasMore: false };
    } };
    assert.deepEqual(await pullPersonalOsEvents(api, { directory }),
      { imported: 1, quarantined: 0, cursor: 123 });
    assert.deepEqual(await pullPersonalOsEvents(api, { directory }),
      { imported: 0, quarantined: 0, cursor: 123 });
    assert.deepEqual(calls, [0, 123]);
    assert.equal(fs.readFileSync(path.join(directory, "openclaw-events.ndjson"), "utf8")
      .split("\n").filter(Boolean).length, 1);
    assert.equal(fs.statSync(path.join(directory, "openclaw-events.ndjson")).mode & 0o077, 0);
    assert.equal(fs.statSync(path.join(directory, "openclaw-event-cursor.json")).mode & 0o077, 0);
    const receipt = { version: 1, event_type: "delivery_receipt", channel: "whatsapp",
      source_event_id: crypto.createHash("sha256").update("receipt").digest("hex"),
      account_id: "default", conversation_id: "chat", transport_receipt_id: "provider-1",
      receipt_origin: "provider", status: "accepted", occurred_at: "2026-09-16T10:01:00Z",
      timestamp_origin: "hook_observed_at", message_sha256: event.content_sha256,
      finance_authorization: false };
    const receiptApi = { async listPersonalOsEvents() {
      return { ok: true, events: [receipt], nextCursor: 456, hasMore: false };
    } };
    assert.deepEqual(await pullPersonalOsEvents(receiptApi, { directory }),
      { imported: 1, quarantined: 0, cursor: 456 });
    const cold = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-cold-"));
    fs.chmodSync(cold, 0o700);
    try {
      const mixed = { async listPersonalOsEvents() {
        return { ok: true, events: [{ ...event, occurred_at: "+058680-10-12T17:00:00.000Z",
          timestamp_origin: undefined }, event], nextCursor: 789, hasMore: false };
      } };
      assert.deepEqual(await pullPersonalOsEvents(mixed, { directory: cold }),
        { imported: 1, quarantined: 1, cursor: 789 });
      assert.equal(fs.readFileSync(path.join(cold, "openclaw-events-quarantine.ndjson"), "utf8")
        .split("\n").filter(Boolean).length, 1);
    } finally { fs.rmSync(cold, { recursive: true, force: true }); }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
