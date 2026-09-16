import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BridgeStore, normalizeThreadSelector, validateJobInput } from "./store.js";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-store-"));
  let now = Date.parse("2026-09-11T12:00:00Z");
  return {
    path: path.join(directory, "state.json"),
    clock: () => now,
    advance(ms) {
      now += ms;
    },
  };
}

test("normalizeThreadSelector supports recent, new, IDs and titles", () => {
  assert.deepEqual(normalizeThreadSelector(), { kind: "recent", value: null });
  assert.deepEqual(normalizeThreadSelector("new"), { kind: "new", value: null });
  assert.deepEqual(normalizeThreadSelector("0199abcd-aaaa-bbbb-cccc-123456789012"), {
    kind: "id",
    value: "0199abcd-aaaa-bbbb-cccc-123456789012",
  });
  assert.deepEqual(normalizeThreadSelector("Organiza trámites"), {
    kind: "title",
    value: "Organiza trámites",
  });
});

test("validateJobInput restricts delivery to the personal WhatsApp channel", () => {
  assert.equal(validateJobInput({ prompt: "hola" }), null);
  assert.match(
    validateJobInput({ prompt: "hola", reply: { channel: "whatsapp", target: "third-party" } }),
    /whatsapp-self/,
  );
  assert.match(validateJobInput({ prompt: "hola", mode: "danger-full-access" }), /mode/);
});

test("enqueue is idempotent and persists state", () => {
  const f = fixture();
  const store = new BridgeStore(f.path, { clock: f.clock });
  const first = store.enqueue({
    prompt: "revisá esto",
    thread: "Secretario personal",
    idempotencyKey: "wa-message-1",
  });
  const repeated = store.enqueue({
    prompt: "no debe reemplazar",
    thread: "new",
    idempotencyKey: "wa-message-1",
  });
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.job.id, first.job.id);
  assert.equal(repeated.job.prompt, "revisá esto");

  const reloaded = new BridgeStore(f.path, { clock: f.clock });
  assert.equal(reloaded.getJob(first.job.id).threadSelector.value, "Secretario personal");
});

test("claim leases one job and reclaims it only after expiry", () => {
  const f = fixture();
  const store = new BridgeStore(f.path, { clock: f.clock });
  const { job } = store.enqueue({ prompt: "trabajo" });
  assert.equal(store.claim("mac-1", { leaseMs: 1_000 }).id, job.id);
  assert.equal(store.claim("mac-2", { leaseMs: 1_000 }), null);
  f.advance(1_001);
  assert.equal(store.claim("mac-2", { leaseMs: 1_000 }).workerId, "mac-2");
});

test("deferred busy job waits, retains identity, and retries once eligible", () => {
  const f = fixture();
  const store = new BridgeStore(f.path, { clock: f.clock });
  const { job } = store.enqueue({ prompt: "revisión", idempotencyKey: "weekly:2026-09-13" });
  const first = store.claim("mac-1");
  assert.equal(first.attemptCount, 1);
  const deferred = store.defer(job.id, "mac-1", {
    reason: "thread_active_writer", delayMs: 5 * 60_000,
  });
  assert.equal(deferred.status, "queued");
  assert.equal(deferred.idempotencyKey, "weekly:2026-09-13");
  assert.equal(store.claim("mac-2"), null);
  f.advance(5 * 60_000);
  const second = store.claim("mac-2");
  assert.equal(second.id, job.id);
  assert.equal(second.attemptCount, 2);
  assert.throws(() => store.defer(job.id, "mac-1", { delayMs: 1_000 }), /leased/);
});

test("only the leasing worker can complete a job", () => {
  const f = fixture();
  const store = new BridgeStore(f.path, { clock: f.clock });
  const { job } = store.enqueue({ prompt: "trabajo" });
  store.claim("mac-1");
  assert.throws(() => store.complete(job.id, "mac-2", { status: "done" }), /leased/);
  const completed = store.complete(job.id, "mac-1", {
    status: "done",
    threadId: "thread-1",
    response: "resultado",
  });
  assert.equal(completed.status, "done");
  assert.equal(completed.response, "resultado");
});

test("thread inventory ignores stale workers and sorts by recency", () => {
  const f = fixture();
  const store = new BridgeStore(f.path, { clock: f.clock });
  store.heartbeat("mac-1", [
    { id: "old", name: "Viejo", updatedAt: 10 },
    { id: "new", name: "Nuevo", updatedAt: 20 },
  ]);
  assert.deepEqual(store.listThreads().map((thread) => thread.id), ["new", "old"]);
  f.advance(120_001);
  assert.deepEqual(store.listThreads(), []);
});
