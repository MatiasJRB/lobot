import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createBridgeRouter } from "./routes.js";
import { BridgeStore } from "./store.js";

async function fixture({ deliverJob } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-routes-"));
  const store = new BridgeStore(path.join(directory, "state.json"));
  const app = express();
  app.use(express.json());
  app.use("/bridge/api", createBridgeRouter({ store, token: "test-token", deliverJob }));
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

test("bridge routes reject missing or invalid bearer tokens", async (t) => {
  const f = await fixture();
  t.after(() => f.server.close());
  assert.equal((await fetch(`${f.url}/threads`)).status, 401);
  assert.equal(
    (await fetch(`${f.url}/threads`, { headers: { authorization: "Bearer wrong" } })).status,
    401,
  );
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

