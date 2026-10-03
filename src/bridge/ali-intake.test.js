import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AliIntakeState, parseAliIntakeEnvelope } from "./ali-intake-state.js";
import { flushAliIntakeOutbox, aliIntakeGh } from "./ali-intake-github.js";
import { runWorkerOnce } from "./worker.js";
import { ALI_QA_CODEX_CONFIG } from "./ali-group.js";

const group = "123456789012@g.us";
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ali-intake-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = Date.parse("2026-10-03T03:00:00Z");
  const options = { groupJid: group, senders: { "+5491112345678": "Joaquín" }, clock: () => now };
  const journal = new AliIntakeState(path.join(dir, "state.json"), options);
  const event = (id, body = "El reintegro desde la salida debe ser cero", overrides = {}) => ({
    version: 1, event_type: "incoming_message", channel: "whatsapp", account_id: "default",
    conversation_id: group, sender_id: "+5491112345678", message_id: id,
    source_event_id: crypto.createHash("sha256").update(["whatsapp", "default", group, id].join("\0")).digest("hex"),
    occurred_at: new Date(now).toISOString(), timestamp_origin: "provider", modality: "text",
    content_preview: body, content_truncated: false, finance_authorization: false, ...overrides });
  return { journal, event, advance: (ms) => { now += ms; }, reload: () => new AliIntakeState(journal.filename, options) };
}

test("capture discards other groups, senders, bot messages, historical backlog and duplicate sources", (t) => {
  const f = fixture(t);
  assert.equal(f.journal.ingest(f.event("old", "x", { occurred_at: "2026-10-02T00:00:00Z" })), false);
  assert.equal(f.journal.ingest(f.event("other", "x", { conversation_id: "987654321098@g.us" })), false);
  assert.equal(f.journal.ingest(f.event("sender", "x", { sender_id: "+5491999999999" })), false);
  assert.equal(f.journal.ingest(f.event("bot", "🤖 Ali: Registrado en #494")), false);
  assert.equal(f.journal.ingest(f.event("1")), true);
  assert.equal(f.journal.ingest(f.event("1")), false);
  assert.equal(f.reload().state.messages.length, 0); // Caller persists event and cursor together.
  f.journal.save();
  assert.equal(f.reload().state.messages.length, 1);
});

test("incremental polling persists only ALI messages and resumes its separate cursor", async (t) => {
  const f = fixture(t);
  const api = { async listPersonalOsEvents(cursor) {
    assert.equal(cursor, 0);
    return { ok: true, events: [f.event("1"), f.event("private", "private", { conversation_id: "personal" })], nextCursor: 123, hasMore: false };
  } };
  await f.journal.poll(api);
  assert.equal(f.reload().state.cursor, 123);
  assert.equal(f.reload().state.messages.length, 1);
  assert.doesNotMatch(fs.readFileSync(f.journal.filename, "utf8"), /personal|private/);
});

test("quiet window batches followups, has a fixed ceiling, and idle reserves no model call", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.journal.dueMessages(), []);
  assert.equal(f.journal.reserve([]), false);
  f.journal.ingest(f.event("1")); f.advance(110_000);
  f.journal.ingest(f.event("2", "Y el asiento completo va al conductor"));
  f.advance(119_000); assert.deepEqual(f.journal.dueMessages(), []);
  f.advance(1000); assert.equal(f.journal.dueMessages().length, 2);
  assert.equal(f.journal.reserve(f.journal.dueMessages()), true);
  assert.equal(f.journal.health().callsToday, 1);
});

test("model crash is preserved for attention rather than silently consuming work or retrying", (t) => {
  const f = fixture(t); f.journal.ingest(f.event("1")); f.journal.save();
  f.journal.reserve(f.journal.state.messages);
  const restarted = f.reload(); restarted.recoverInterrupted();
  assert.equal(restarted.state.messages[0].reason, "interrupted_model_call");
  assert.equal(restarted.health().callsToday, 1);
});

test("context and per-window model budgets preserve overflow for human supervision", (t) => {
  const f = fixture(t); f.journal.ingest(f.event("1"));
  const w = f.journal.state.windows[0]; w.calls = 2;
  assert.equal(f.journal.reserve(f.journal.state.messages), false);
  assert.equal(f.journal.health().needsAttention, 1);
});

test("audio and truncated text are retained without inventing their meaning", (t) => {
  const f = fixture(t);
  f.journal.ingest(f.event("audio", "transcript", { modality: "audio" }));
  f.journal.ingest(f.event("truncated", "x", { content_truncated: true }));
  assert.equal(f.journal.health().needsAttention, 2);
});

function classified(f, issue = 494) {
  f.journal.ingest(f.event("1"));
  const messages = f.journal.state.messages;
  const envelope = { answer: "Entendido.", items: [{ kind: "definition", title: "Reintegro desde salida",
    summary: "Pasajero recibe cero desde la salida; registrar reparto.", sourceIds: [messages[0].id], confidence: .98, issue }] };
  f.journal.finish(messages, parseAliIntakeEnvelope(JSON.stringify(envelope), messages, { allowedIssues: [494] }));
  return envelope;
}

test("classification rejects invented evidence and turns uncertainty into clarification", (t) => {
  const f = fixture(t); const envelope = classified(f);
  envelope.items[0].confidence = .7;
  assert.equal(parseAliIntakeEnvelope(JSON.stringify(envelope), f.journal.state.messages, { allowedIssues: [494] }).items[0].kind, "clarify");
  assert.throws(() => parseAliIntakeEnvelope(JSON.stringify(envelope), f.journal.state.messages), /evidence/);
  envelope.items[0].sourceIds = ["invented"];
  assert.throws(() => parseAliIntakeEnvelope(JSON.stringify(envelope), f.journal.state.messages), /evidence/);
});

test("native plugin events are accepted without reconstructing their source identity", async (t) => {
  const { createRequire } = await import("node:module");
  const { projectReceived } = createRequire(import.meta.url)("../personal-os/openclaw-events-plugin/index.cjs");
  const f = fixture(t);
  const event = projectReceived({ content: "(@lobot ¿cómo cancelo?)", timestamp: Date.parse("2026-10-03T03:00:00Z") },
    { channelId: "whatsapp", accountId: "default", conversationId: group, messageId: "native-1", senderId: "+5491112345678" });
  assert.equal(f.journal.ingest(event), true);
  assert.equal(f.journal.state.messages[0].mention, true);
});

test("classifier cannot claim completed mutations or unreceipted registration", () => {
  assert.throws(() => parseAliIntakeEnvelope(JSON.stringify({ answer: "Ya lo registré en #494 y está implementado.", items: [] }), []), /unverified action/);
});

test("known issue gets a traced pending comment and Project item, then no duplicate write", async (t) => {
  const f = fixture(t); classified(f); const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args.includes("POST")) return { html_url: "https://github.com/MatiasJRB/asiento-libre/issues/494#issuecomment-123" };
    if (args[0] === "project") return { id: "item" };
    if (args[1].includes("comments?")) return [[]];
    return { number: 494, state: "open", body: "" };
  };
  const receipts = await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  assert.equal(receipts[0].issue, 494);
  const body = calls.find((c) => c.input)?.input.body;
  assert.match(body, /Joaquín/); assert.match(body, /pendiente de implementación/);
  assert.equal(f.journal.health().written, 1);
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => { throw new Error("idle must not call GitHub"); } });
});

test("uncertain successful provider write is reconciled by marker without another POST", async (t) => {
  const f = fixture(t); classified(f); let writes = 0;
  let marker = null;
  const gh = (args, input) => {
    if (args.includes("POST")) { writes++; marker = input.body; throw new Error("timeout after commit"); }
    if (args[0] === "project") return {};
    if (args[1].includes("comments?")) return [marker ? [{ body: marker, html_url: "https://github.com/MatiasJRB/asiento-libre/issues/494#issuecomment-1" }] : []];
    return { state: "open" };
  };
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  assert.equal(f.journal.state.outbox[0].status, "writing");
  f.advance(300_000);
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  assert.equal(writes, 1); assert.equal(f.journal.health().written, 1);
});

test("missing uncertain receipt never causes a second POST", async (t) => {
  const f = fixture(t); classified(f); let writes = 0;
  const gh = (args) => {
    if (args.includes("POST")) { writes++; throw new Error("timeout"); }
    if (args[1].includes("comments?")) return [[]];
    return { state: "open" };
  };
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  f.advance(300_000);
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  assert.equal(writes, 1);
});

test("new issue lost receipt recovers its issue number without creating a duplicate", async (t) => {
  const f = fixture(t); classified(f, null); let writes = 0; let body = null;
  const gh = (args, input) => {
    if (args.includes("POST")) { writes++; body = input.body; throw new Error("lost receipt after creation"); }
    if (args[0] === "project") return { id: "project-item" };
    if (args[1].includes("issues?")) return [body ? [{ number: 510, body, html_url: "https://github.com/MatiasJRB/asiento-libre/issues/510" }] : []];
    throw new Error("unexpected call");
  };
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  f.advance(300_000);
  await flushAliIntakeOutbox(f.journal, { ghFactory: () => gh });
  assert.equal(writes, 1); assert.equal(f.journal.state.outbox[0].targetIssue, 510);
  assert.equal(f.journal.state.outbox[0].status, "written");
});

test("GitHub adapter rejects another account and never falls back to ambient token", () => {
  const envs = [];
  assert.throws(() => aliIntakeGh({ env: { GH_TOKEN: "other-token" }, exec(_cmd, args, options) {
    envs.push(options.env);
    return args[0] === "auth" ? "ali-token" : "OtherAccount";
  } }), /identity mismatch/);
  assert.equal(envs[0].GH_TOKEN, undefined);
  assert.equal(envs[1].GH_TOKEN, "ali-token");
});

test("corrupt state cannot silently reset cursor and reprocess historical messages", (t) => {
  const f = fixture(t); fs.writeFileSync(f.journal.filename, "corrupt");
  assert.throws(f.reload);
});

function workerFixture(t, f, job) {
  const home = path.join(path.dirname(f.journal.filename), "qa-home");
  fs.mkdirSync(home, { mode: 0o700 });
  fs.writeFileSync(path.join(home, "auth.json"), "{}", { mode: 0o600 });
  fs.writeFileSync(path.join(home, "config.toml"), ALI_QA_CODEX_CONFIG);
  const calls = [];
  const api = { async listPersonalOsEvents(cursor) { return { ok: true, events: [], nextCursor: cursor, hasMore: false }; },
    async claimJob() { return { job }; }, async heartbeat() {},
    async completeJob(_id, result) { calls.push(["complete", result]); return { job: result }; } };
  const qaCodex = { async start() {}, async stop() {}, async runAliQaJob(_job, options) {
    calls.push(["model", options]);
    return { response: JSON.stringify({ answer: "Entendido.", items: [] }) };
  } };
  return { calls, options: { api, codex: { async listThreads() { return []; }, async runJob() { throw new Error("personal forbidden"); } },
    qaCodex, workerId: "mac", aliIntake: f.journal, personalOsSync: false,
    aliThreadId: "0199abcd-aaaa-bbbb-cccc-123456789012", aliRepoCwd: "/ali", aliCodexHome: home,
    aliAuthSync: () => {}, aliContext: () => ({}), aliFlush: async () => [] } };
}

test("a real-shaped mention answers and classifies in one isolated call, with no replay on reclaimed job", async (t) => {
  const f = fixture(t); f.journal.ingest(f.event("mention", "@lobot ¿qué pasa al cancelar?")); f.journal.save();
  const w = workerFixture(t, f, { id: "job", source: "ali-group-mention", mode: "read-only",
    prompt: '{"body":"@lobot qué pasa"}', reply: { channel: "whatsapp-ali-group", sourceMessageId: "mention" } });
  await runWorkerOnce(w.options);
  assert.equal(w.calls.filter(([name]) => name === "model").length, 1);
  assert.equal(f.journal.health().classified, 1);
  assert.equal(w.calls.find(([name]) => name === "complete")[1].response, "Entendido.");
  await runWorkerOnce(w.options);
  assert.equal(w.calls.filter(([name]) => name === "model").length, 1);
});

test("unmentioned conversation consolidates silently and never calls queue delivery", async (t) => {
  const f = fixture(t); f.journal.ingest(f.event("1")); f.journal.save(); f.advance(120_000);
  const w = workerFixture(t, f, null);
  const result = await runWorkerOnce(w.options);
  assert.equal(result.intakeOnly, true);
  assert.equal(w.calls.filter(([name]) => name === "model").length, 1);
  assert.equal(w.calls.filter(([name]) => name === "complete").length, 0);
});

test("idle observation consumes zero model calls and no writes", async (t) => {
  const f = fixture(t); const w = workerFixture(t, f, null);
  assert.deepEqual(await runWorkerOnce(w.options), { processed: false });
  assert.equal(w.calls.length, 0);
});

test("missing source cannot fall back to an unbudgeted model call", async (t) => {
  const f = fixture(t);
  const w = workerFixture(t, f, { id: "missing", source: "ali-group-mention", mode: "read-only",
    prompt: '{"body":"@lobot hola"}', reply: { channel: "whatsapp-ali-group", sourceMessageId: "absent" } });
  await runWorkerOnce(w.options);
  assert.equal(w.calls.filter(([name]) => name === "model").length, 0);
  assert.equal(w.calls.find(([name]) => name === "complete")[1].status, "failed");
  assert.equal(f.journal.health().lastError, "mention_source_not_captured");
});

test("structured model contract supplies bounded evidence while tools remain disabled", async () => {
  const { CodexAppServerClient } = await import("./app-server-client.js");
  const c = new CodexAppServerClient(); const calls = [];
  const tid = "0199abcd-aaaa-bbbb-cccc-123456789012";
  c.request = async (method, params) => { calls.push(params); return method === "thread/resume" ? { thread: { id: tid } } : { turn: { id: "t" } }; };
  c.waitForTurn = async () => ({ status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: '{"answer":"Sí","items":[]}' }] });
  await c.runAliQaJob({ id: "x", source: "ali-group-mention", mode: "read-only", reply: { channel: "whatsapp-ali-group" }, prompt: '{}' },
    { threadId: tid, cwd: "/ali", context: {}, intakeMessages: [{ id: "id1", body: "Definition", author: "Joaquín", at: "2026-10-03T03:00:00Z" }] });
  assert.match(calls[0].developerInstructions, /Salida obligatoria JSON/);
  assert.match(calls[1].input[0].text, /id1/);
  assert.deepEqual(calls[1].sandboxPolicy, { type: "readOnly", networkAccess: false });
});
