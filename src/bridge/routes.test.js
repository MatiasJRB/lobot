import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createBridgeRouter } from "./routes.js";
import { BridgeStore } from "./store.js";

async function fixture({ deliverJob, openclawEventOutbox, noticeOutbox,
  aliGroupJid = "", aliGroupIntakeEnabled = true,
  aliGroupReplyEnabled = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-routes-"));
  const store = new BridgeStore(path.join(directory, "state.json"));
  const app = express();
  app.use(express.json());
  app.use("/bridge/api", createBridgeRouter({ store, token: "test-token", deliverJob,
    openclawEventOutbox, noticeOutbox, noticeWriteToken: "notice-only",
    aliGroupJid, aliGroupIntakeEnabled, aliGroupReplyEnabled }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    store,
    server,
    url: `http://127.0.0.1:${port}/bridge/api`,
    request(pathname, options = {}) {
      return fetch(`${this.url}${pathname}`, {
        ...options,
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
    },
  };
}

test("ALI group intake is exact, idempotent, read-only and cannot be forged through /jobs", async (t) => {
  const groupJid = "123456789012@g.us";
  const f = await fixture({ aliGroupJid: groupJid });
  t.after(() => f.server.close());
  const mention = { accountId: "default", conversationId: groupJid,
    messageId: "msg-1", senderId: "+5491112345678", timestamp: Date.now(),
    body: "@lobot ¿cómo se usa débito TEST?" };
  assert.equal((await fetch(`${f.url}/ali-group/mentions`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(mention) })).status, 401);
  assert.equal((await f.request("/jobs", { method: "POST", body: JSON.stringify({
    source: "ali-group-mention", prompt: "x", mode: "read-only",
  }) })).status, 400);
  assert.equal((await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ ...mention, conversationId: "other@g.us" }) })).status, 400);
  const first = await f.request("/ali-group/mentions", { method: "POST", body: JSON.stringify(mention) });
  const second = await f.request("/ali-group/mentions", { method: "POST", body: JSON.stringify(mention) });
  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  const one = await first.json();
  assert.equal(one.jobId, (await second.json()).jobId);
  const job = f.store.getJob(one.jobId);
  assert.equal(job.mode, "read-only");
  assert.equal(job.reply.conversationId, groupJid);
});

test("ALI group intake flag blocks even an authenticated direct POST", async (t) => {
  const groupJid = "123456789012@g.us";
  const f = await fixture({ aliGroupJid: groupJid, aliGroupIntakeEnabled: false });
  t.after(() => f.server.close());
  const result = await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ accountId: "default", conversationId: groupJid,
      messageId: "disabled", senderId: "+5491112345678", timestamp: Date.now(),
      body: "@lobot TEST" }) });
  assert.equal(result.status, 503);
  assert.equal(f.store.listJobs().length, 0);
});

test("ALI group reply stays off by default and sends at most once when enabled", async (t) => {
  const groupJid = "123456789012@g.us";
  const deliveries = [];
  const f = await fixture({ aliGroupJid: groupJid, deliverJob: async (job) => {
    deliveries.push(job.id);
    throw new Error("uncertain provider result");
  } });
  t.after(() => f.server.close());
  const mention = { accountId: "default", conversationId: groupJid,
    messageId: "msg-2", senderId: "+5491112345678", timestamp: Date.now(), body: "@lobot TEST" };
  const created = await (await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify(mention) })).json();
  await f.request("/jobs/claim", { method: "POST", body: JSON.stringify({ workerId: "mac" }) });
  const complete = await (await f.request(`/jobs/${created.jobId}/complete`, { method: "POST",
    body: JSON.stringify({ workerId: "mac", status: "done", response: "Usá una tarjeta TEST." }) })).json();
  assert.equal(complete.delivery.reason, "group-replies-disabled");
  assert.deepEqual(deliveries, []);
  assert.ok(f.store.getJob(created.jobId).groupReplySuppressedAt);
  const suppressed = await (await f.request(`/jobs/${created.jobId}/deliver`,
    { method: "POST" })).json();
  assert.equal(suppressed.delivery.reason, "group-reply-suppressed");
  const enabled = await fixture({ aliGroupJid: groupJid, aliGroupReplyEnabled: true,
    deliverJob: async (job) => { deliveries.push(job.id); throw new Error("uncertain provider result"); } });
  t.after(() => enabled.server.close());
  const other = await (await enabled.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ ...mention, messageId: "msg-3" }) })).json();
  await enabled.request("/jobs/claim", { method: "POST", body: JSON.stringify({ workerId: "mac" }) });
  const failed = await (await enabled.request(`/jobs/${other.jobId}/complete`, { method: "POST",
    body: JSON.stringify({ workerId: "mac", status: "done", response: "Usá una tarjeta TEST." }) })).json();
  assert.equal(failed.delivery.attempted, true);
  assert.equal(deliveries.length, 1);
  const retry = await (await enabled.request(`/jobs/${other.jobId}/deliver`, { method: "POST" })).json();
  assert.equal(retry.delivery.attempted, false);
  assert.equal(deliveries.length, 1);
});

test("ALI group never sends an old completed answer after a delayed worker", async (t) => {
  const groupJid = "123456789012@g.us";
  const delivered = [];
  const f = await fixture({ aliGroupJid: groupJid, aliGroupReplyEnabled: true,
    deliverJob: async (job) => delivered.push(job.id) });
  t.after(() => f.server.close());
  const created = await (await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ accountId: "default", conversationId: groupJid,
      messageId: "msg-old", senderId: "+5491112345678", timestamp: Date.now(),
      body: "@lobot TEST" }) })).json();
  f.store.state.jobs[0].createdAt = new Date(Date.now() - 60 * 60_000).toISOString();
  await f.request("/jobs/claim", { method: "POST", body: JSON.stringify({ workerId: "mac" }) });
  const complete = await (await f.request(`/jobs/${created.jobId}/complete`, { method: "POST",
    body: JSON.stringify({ workerId: "mac", status: "done", response: "Respuesta" }) })).json();
  assert.equal(complete.delivery.reason, "stale-group-reply-suppressed");
  assert.deepEqual(delivered, []);
});

test("ALI group intake caps unique mentions but accepts duplicate IDs", async (t) => {
  const groupJid = "123456789012@g.us";
  const f = await fixture({ aliGroupJid: groupJid });
  t.after(() => f.server.close());
  const event = { accountId: "default", conversationId: groupJid,
    senderId: "+5491112345678", timestamp: Date.now(), body: "@lobot TEST" };
  for (let index = 0; index < 12; index += 1) {
    const result = await f.request("/ali-group/mentions", { method: "POST",
      body: JSON.stringify({ ...event, messageId: `rate-${index}` }) });
    assert.equal(result.status, 202);
  }
  assert.equal((await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ ...event, messageId: "rate-0" }) })).status, 200);
  assert.equal((await f.request("/ali-group/mentions", { method: "POST",
    body: JSON.stringify({ ...event, messageId: "rate-12" }) })).status, 429);
});

test("notices use a separate write-only token, durable feed and idempotency", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-notices-"));
  const f = await fixture({ noticeOutbox: path.join(directory, "notices.ndjson") });
  t.after(() => { f.server.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const input = { source: "test-system", eventId: "event-1", title: "Revisar prueba",
    summary: "Un sistema informa un cambio; sin acción automática.",
    occurredAt: "2026-09-17T12:00:00Z" };
  const post = (body, token = "notice-only") => fetch(`${f.url}/personal-os/notices`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await post(input, "test-token")).status, 401);
  assert.equal((await fetch(`${f.url}/jobs`, { headers: { authorization: "Bearer notice-only" } })).status, 401);
  const first = await post(input);
  assert.equal(first.status, 202);
  assert.equal((await post(input)).status, 200);
  assert.equal((await post({ ...input, title: "Otro" })).status, 400);
  const page = await (await f.request("/personal-os/notices")).json();
  assert.equal(page.notices.length, 1);
  assert.equal(page.notices[0].source, "test-system");
  assert.equal((await fetch(`${f.url}/personal-os/notices`,
    { headers: { authorization: "Bearer notice-only" } })).status, 401);
});

test("authorized systems can enqueue a write-only idempotent commitment capture", async (t) => {
  const f = await fixture();
  t.after(() => f.server.close());
  const commitment = {
    card_id: "puma_return", title: "Devolución PUMA", domain: "shopping",
    outcome: "Recibir reintegro", status: "ready_for_secretary", priority: "high",
    owner: "secretario", current_state: "Formulario preparado", next_action: "Enviar fotos",
    next_check_at: "2026-09-29T09:30:00-03:00",
    closure_condition: "Retiro y reintegro confirmados", source_ref: "system:event-1",
    material_kind: "return", progress_state: "prepared",
    deadline_at: "2026-10-23T23:59:00-03:00", identities: ["order_id:5401117575"],
  };
  const post = (body, token = "notice-only") => fetch(`${f.url}/personal-os/commitments`, {
    method: "POST", headers: { authorization: `Bearer ${token}`,
      "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await post({ idempotencyKey: "event-1", commitment }, "test-token")).status, 401);
  const first = await post({ idempotencyKey: "event-1", commitment });
  const second = await post({ idempotencyKey: "event-1", commitment });
  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  const body = await first.json();
  const job = f.store.getJob(body.jobId);
  assert.equal(job.source, "personal-os-commitment-capture");
  assert.equal(JSON.parse(job.prompt).card_id, "puma_return");
  assert.equal(job.reply, null);
  assert.equal((await post({ idempotencyKey: "event-2",
    commitment: { ...commitment, deadline_at: "2026-10-23" } })).status, 400);
  assert.equal((await fetch(`${f.url}/jobs`,
    { headers: { authorization: "Bearer notice-only" } })).status, 401);
});

test("bridge routes reject missing or invalid bearer tokens", async (t) => {
  const f = await fixture();
  t.after(() => f.server.close());
  assert.equal((await fetch(`${f.url}/threads`)).status, 401);
  assert.equal(
    (await fetch(`${f.url}/threads`, { headers: { authorization: "Bearer wrong" } })).status,
    401,
  );
});

test("private OpenClaw event feed requires bearer and paginates by durable byte cursor", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-bridge-feed-"));
  const filename = path.join(directory, "events.ndjson");
  fs.writeFileSync(filename, '{"source_event_id":"one"}\n{"source_event_id":"two"}\n',
    { mode: 0o600 });
  const f = await fixture({ openclawEventOutbox: filename });
  t.after(() => { f.server.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  assert.equal((await fetch(`${f.url}/personal-os/events`)).status, 401);
  const first = await (await f.request("/personal-os/events?cursor=0&limit=1")).json();
  assert.equal(first.events[0].source_event_id, "one");
  assert.equal(first.hasMore, true);
  const second = await (await f.request(`/personal-os/events?cursor=${first.nextCursor}`)).json();
  assert.equal(second.events[0].source_event_id, "two");
  assert.equal(second.hasMore, false);
  assert.equal((await f.request("/personal-os/events?cursor=-1")).status, 400);
});

test("enqueue, heartbeat, claim and complete a job over HTTP", async (t) => {
  const delivered = [];
  const f = await fixture({ deliverJob: async (job) => delivered.push(job.id) });
  t.after(() => f.server.close());

  const heartbeat = await f.request("/workers/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      workerId: "mac",
      threads: [{ id: "thread-1", name: "Secretario", updatedAt: 20 }],
    }),
  });
  assert.equal(heartbeat.status, 200);
  const threads = await (await f.request("/threads")).json();
  assert.equal(threads.threads[0].name, "Secretario");

  const createdResponse = await f.request("/jobs", {
    method: "POST",
    body: JSON.stringify({
      prompt: "seguí con salud",
      thread: "Secretario",
      reply: { channel: "whatsapp-self" },
      idempotencyKey: "message-1",
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const claim = await (
    await f.request("/jobs/claim", {
      method: "POST",
      body: JSON.stringify({ workerId: "mac" }),
    })
  ).json();
  assert.equal(claim.job.id, created.job.id);

  const complete = await (
    await f.request(`/jobs/${created.job.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        workerId: "mac",
        status: "done",
        threadId: "thread-1",
        response: "respuesta",
      }),
    })
  ).json();
  assert.equal(complete.job.status, "done");
  assert.equal(complete.delivery.ok, true);
  assert.equal(complete.job.deliveredAt !== null, true);
  assert.deepEqual(delivered, [created.job.id]);

  const redelivery = await (
    await f.request(`/jobs/${created.job.id}/deliver`, { method: "POST", body: "{}" })
  ).json();
  assert.equal(redelivery.delivery.reason, "already-delivered");
  assert.deepEqual(delivered, [created.job.id]);
});

test("idempotency is preserved over HTTP", async (t) => {
  const f = await fixture();
  t.after(() => f.server.close());
  const body = JSON.stringify({ prompt: "uno", idempotencyKey: "same" });
  const first = await f.request("/jobs", { method: "POST", body });
  const second = await f.request("/jobs", { method: "POST", body });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).job.id, (await second.json()).job.id);
});

test("defer endpoint keeps a busy job queued without attempting delivery", async (t) => {
  const delivered = [];
  const f = await fixture({ deliverJob: async (job) => delivered.push(job.id) });
  t.after(() => f.server.close());
  const created = await (await f.request("/jobs", {
    method: "POST", body: JSON.stringify({ prompt: "revisión", reply: { channel: "whatsapp-self" } }),
  })).json();
  await f.request("/jobs/claim", { method: "POST", body: JSON.stringify({ workerId: "mac" }) });
  const deferred = await (await f.request(`/jobs/${created.job.id}/defer`, {
    method: "POST", body: JSON.stringify({
      workerId: "mac", delayMs: 300_000, reason: "thread_active_writer",
    }),
  })).json();
  assert.equal(deferred.job.status, "queued");
  assert.equal(deferred.job.attemptCount, 1);
  assert.equal(delivered.length, 0);
  const unclaimable = await (await f.request("/jobs/claim", {
    method: "POST", body: JSON.stringify({ workerId: "mac-2" }),
  })).json();
  assert.equal(unclaimable.job, null);
});

test("actionable-only delivery suppresses an exact DONT_NOTIFY response", async (t) => {
  const delivered = [];
  const f = await fixture({ deliverJob: async (job) => delivered.push(job.id) });
  t.after(() => f.server.close());

  const created = await (
    await f.request("/jobs", {
      method: "POST",
      body: JSON.stringify({
        prompt: "control fiscal",
        thread: "Contador",
        reply: { channel: "whatsapp-self", policy: "actionable-only" },
      }),
    })
  ).json();
  await f.request("/workers/heartbeat", {
    method: "POST",
    body: JSON.stringify({ workerId: "mac", threads: [] }),
  });
  await f.request("/jobs/claim", {
    method: "POST",
    body: JSON.stringify({ workerId: "mac" }),
  });
  const completed = await (
    await f.request(`/jobs/${created.job.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        workerId: "mac",
        status: "done",
        response: "DONT_NOTIFY",
      }),
    })
  ).json();

  assert.equal(completed.delivery.ok, true);
  assert.equal(completed.delivery.attempted, false);
  assert.equal(completed.delivery.reason, "suppressed-not-actionable");
  assert.equal(completed.job.deliveredAt !== null, true);
  assert.deepEqual(delivered, []);
});

test("actionable-only delivery still sends exceptions", async (t) => {
  const delivered = [];
  const f = await fixture({ deliverJob: async (job) => delivered.push(job.response) });
  t.after(() => f.server.close());

  const created = await (
    await f.request("/jobs", {
      method: "POST",
      body: JSON.stringify({
        prompt: "control fiscal",
        reply: { channel: "whatsapp-self", policy: "actionable-only" },
      }),
    })
  ).json();
  await f.request("/jobs/claim", {
    method: "POST",
    body: JSON.stringify({ workerId: "mac" }),
  });
  const completed = await (
    await f.request(`/jobs/${created.job.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        workerId: "mac",
        status: "done",
        response: "Deuda nueva detectada",
      }),
    })
  ).json();

  assert.equal(completed.delivery.attempted, true);
  assert.deepEqual(delivered, ["Deuda nueva detectada"]);
});
