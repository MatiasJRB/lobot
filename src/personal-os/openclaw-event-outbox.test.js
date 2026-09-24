import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { readOpenclawEventPage } from "./openclaw-event-outbox.js";

const require = createRequire(import.meta.url);
const plugin = require("./openclaw-events-plugin/index.cjs");

test("WhatsApp transport hook writes private, stable inbound facts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-events-"));
  const filename = path.join(dir, "events.ndjson");
  try {
    const event = { messageId: "msg-1", senderId: "sender-1", content: "hola", timestamp: 1710000000 };
    const ctx = { channelId: "whatsapp", accountId: "default",
      conversationId: "chat-1", messageId: "msg-1", senderId: "sender-1" };
    const first = plugin.projectReceived(event, ctx);
    assert.equal(first.source_event_id, plugin.projectReceived(event, ctx).source_event_id);
    assert.equal(first.modality, "text");
    assert.equal(plugin.projectReceived({ ...event,
      originalMedia: [{ contentType: "audio/ogg" }], mediaStagingPending: true }, ctx).modality,
    "audio");
    assert.equal(plugin.projectReceived({ ...event,
      originalMedia: [{ contentType: "image/jpeg" }], mediaStagingPending: true }, ctx).modality,
    "unknown");
    assert.equal(first.occurred_at, "2024-03-09T16:00:00.000Z");
    assert.equal(plugin.projectReceived({ ...event, timestamp: 1710000000000 }, ctx).occurred_at,
      first.occurred_at);
    assert.equal(first.timestamp_origin, "provider");
    assert.equal(first.finance_authorization, false);
    assert.equal(plugin.projectReceived({ ...event, senderId: undefined },
      { ...ctx, senderId: undefined }), null);
    assert.equal(plugin.projectReceived(event, { ...ctx, channelId: "discord" }), null);
    plugin.appendEvent(first, filename);
    plugin.appendEvent({ ...first, source_event_id: "second" }, filename);
    assert.equal(fs.statSync(filename).mode & 0o077, 0);
    const page1 = readOpenclawEventPage(filename, { cursor: 0, limit: 1 });
    assert.equal(page1.events.length, 1);
    assert.equal(page1.events[0].message_id, "msg-1");
    assert.equal(page1.hasMore, true);
    const page2 = readOpenclawEventPage(filename, { cursor: page1.nextCursor });
    assert.equal(page2.events.length, 1);
    assert.equal(page2.hasMore, false);
    assert.throws(() => readOpenclawEventPage(filename, { cursor: -1 }), TypeError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("outbound hook distinguishes provider acceptance from uncertain and failed sends", () => {
  const hooks = [];
  const tools = [];
  plugin.register({
    on: (name) => hooks.push(name),
    registerTool: (tool, options) => tools.push({ tool, options }),
  });
  assert.deepEqual(hooks, ["message_received", "message_sent"]);
  assert.equal(tools[0].tool, plugin.knowledgeTool);
  assert.deepEqual(tools[0].options, { name: "knowledge_search" });
  const context = { channelId: "whatsapp", accountId: "default", conversationId: "chat-1" };
  const accepted = plugin.projectSent({ to: "chat-1", content: "hola",
    success: true, messageId: "provider-1" }, context);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.receipt_origin, "provider");
  assert.equal(accepted.source_event_id, plugin.projectSent({ to: "chat-1", content: "hola",
    success: true, messageId: "provider-1" }, context).source_event_id);
  assert.equal(accepted.finance_authorization, false);
  assert.equal(plugin.projectSent({ to: "chat-1", content: "hola", success: true }, context).status,
    "uncertain");
  assert.equal(plugin.projectSent({ to: "chat-1", content: "hola", success: false }, context).status,
    "failed");
  assert.equal(plugin.projectSent({ to: "chat-1", content: "hola", success: true },
    { ...context, channelId: "telegram" }), null);
  assert.equal(plugin.projectSent({ to: "other", content: "hola", success: true }, context), null);
});

test("owner-only knowledge tool waits for the local bridge result", async () => {
  assert.equal(plugin.knowledgeTool({ senderIsOwner: false }), null);
  assert.equal(plugin.bridgeBaseUrl({ PORT: "8080" }),
    "http://127.0.0.1:8080/bridge/api");
  assert.equal(plugin.bridgeBaseUrl({ PORT: "9090", CODEX_BRIDGE_URL: "  " }),
    "http://127.0.0.1:9090/bridge/api");
  assert.equal(plugin.bridgeBaseUrl({ CODEX_BRIDGE_URL: " https://bridge.example/api/ " }),
    "https://bridge.example/api/");
  const calls = [];
  let poll = 0;
  const result = await plugin.queryKnowledgeBridge("qué sabemos de viajes", "tool-1", {
    baseUrl: "https://bridge.test",
    token: "private",
    wait: async () => {},
    request: async (_base, _token, pathname, options) => {
      calls.push([pathname, options]);
      if (pathname === "/jobs") return { job: { id: "job-1" } };
      poll += 1;
      return poll === 1
        ? { job: { id: "job-1", status: "running" } }
        : { job: { id: "job-1", status: "done", response: "resultado con fuente" } };
    },
  });
  assert.equal(result, "resultado con fuente");
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.source, "knowledge-hub-query");
  assert.equal(body.mode, "read-only");
  assert.equal(body.reply, undefined);
});
