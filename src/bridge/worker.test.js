import assert from "node:assert/strict";
import test from "node:test";

import { ThreadSelectorError } from "./app-server-client.js";
import { runWorker, runWorkerOnce, summarizeThreads } from "./worker.js";

function apiFixture(job) {
  const calls = [];
  return {
    calls,
    async heartbeat(input) {
      calls.push(["heartbeat", input]);
      return { ok: true };
    },
    async claimJob(workerId) {
      calls.push(["claim", workerId]);
      return { job };
    },
    async completeJob(jobId, result) {
      calls.push(["complete", jobId, result]);
      return { job: { id: jobId, ...result }, delivery: { ok: true } };
    },
    async deferJob(jobId, result) {
      calls.push(["defer", jobId, result]);
      return { job: { id: jobId, status: "queued", ...result } };
    },
  };
}

test("heartbeat inventory keeps previews bounded even for large Codex threads", () => {
  const threads = Array.from({ length: 100 }, (_, index) => ({
    id: `thread-${index}`,
    name: `Task ${index}`,
    preview: "x".repeat(120_000),
  }));
  const summarized = summarizeThreads(threads);
  assert.equal(summarized.length, 100);
  assert.equal(summarized[0].preview.length, 240);
  assert.ok(Buffer.byteLength(JSON.stringify(summarized)) < 100_000);
});

test("runWorkerOnce publishes threads and completes a claimed job", async () => {
  const api = apiFixture({ id: "job-1", prompt: "hola" });
  const codex = {
    async listThreads() {
      return [{ id: "thread-1", name: "Secretario", updatedAt: 10 }];
    },
    async runJob() {
      return { threadId: "thread-1", threadName: "Secretario", response: "respuesta" };
    },
  };
  const result = await runWorkerOnce({ api, codex, workerId: "mac" });
  assert.equal(result.processed, true);
  assert.equal(api.calls[0][0], "heartbeat");
  assert.equal(api.calls[2][2].status, "done");
  assert.equal(api.calls[2][2].response, "respuesta");
});

test("knowledge queries run locally without opening a Codex thread", async () => {
  const api = apiFixture({ id: "knowledge-1", source: "knowledge-hub-query", prompt: "viajes" });
  let codexJobs = 0;
  const codex = {
    async listThreads() { return []; },
    async runJob() { codexJobs += 1; },
  };
  const result = await runWorkerOnce({
    api,
    codex,
    workerId: "mac",
    knowledgeQuery(job) {
      assert.equal(job.prompt, "viajes");
      return { threadName: "Conocimiento personal", response: "resultado local" };
    },
  });

  assert.equal(result.processed, true);
  assert.equal(codexJobs, 0);
  const completion = api.calls.find(([name]) => name === "complete")[2];
  assert.equal(completion.status, "done");
  assert.equal(completion.response, "resultado local");
});

test("commitment capture runs locally without opening a Codex thread", async () => {
  const api = apiFixture({ id: "capture-1", source: "personal-os-commitment-capture",
    prompt: '{"card_id":"order"}' });
  let codexJobs = 0;
  const codex = { async listThreads() { return []; }, async runJob() { codexJobs += 1; } };
  await runWorkerOnce({ api, codex, workerId: "mac",
    commitmentCapture(job) {
      assert.equal(job.id, "capture-1");
      return { threadName: "Secretario personal", response: "Compromiso creado" };
    },
  });
  assert.equal(codexJobs, 0);
  assert.equal(api.calls.find(([name]) => name === "complete")[2].response,
    "Compromiso creado");
});

test("commitment review records WhatsApp delivery without opening a Codex thread", async () => {
  const api = apiFixture({ id: "review-1", source: "personal-os-commitment-review",
    prompt: "{}" });
  const receipts = [];
  const codex = { async listThreads() { return []; }, async runJob() {
    throw new Error("must not open Codex");
  } };
  await runWorkerOnce({ api, codex, workerId: "mac",
    commitmentReview() {
      return { threadName: "Secretario personal", response: "PUMA",
        details: { kind: "commitment-review", alertIds: [7] } };
    },
    commitmentDelivery(result, delivery) { receipts.push({ result, delivery }); },
  });
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].result.jobId, "review-1");
  assert.equal(receipts[0].delivery.ok, true);
});

test("runWorkerOnce returns candidates when a selector is ambiguous", async () => {
  const api = apiFixture({ id: "job-2", prompt: "hola" });
  const codex = {
    async listThreads() {
      return [];
    },
    async runJob() {
      throw new ThreadSelectorError("ambiguo", [{ id: "1", name: "Uno" }]);
    },
  };
  await runWorkerOnce({ api, codex, workerId: "mac" });
  const completion = api.calls.find(([name]) => name === "complete")[2];
  assert.equal(completion.status, "needs_attention");
  assert.match(completion.response, /Uno \(1\)/);
});

test("runWorkerOnce stays idle when the queue is empty", async () => {
  const api = apiFixture(null);
  const codex = { async listThreads() { return []; } };
  const result = await runWorkerOnce({ api, codex, workerId: "mac" });
  assert.deepEqual(result, { processed: false });
});

test("active writer defers a scheduled review without delivery or duplicate job", async () => {
  const api = apiFixture({ id: "weekly-job", attemptCount: 1, prompt: "revisión" });
  const codex = {
    async listThreads() { return []; },
    async runJob() { throw new Error("thread t-1 already has an active writer"); },
  };
  const result = await runWorkerOnce({ api, codex, workerId: "mac" });
  assert.equal(result.deferred, true);
  assert.equal(api.calls.find(([name]) => name === "defer")[2].delayMs, 5 * 60_000);
  assert.equal(api.calls.some(([name]) => name === "complete"), false);
});

test("persistent active writer eventually needs attention, not an infinite retry", async () => {
  const api = apiFixture({ id: "weekly-job", attemptCount: 12, prompt: "revisión" });
  const codex = {
    async listThreads() { return []; },
    async runJob() { throw new Error("thread t-1 already has an active writer"); },
  };
  await runWorkerOnce({ api, codex, workerId: "mac" });
  assert.equal(api.calls.some(([name]) => name === "defer"), false);
  const completion = api.calls.find(([name]) => name === "complete")[2];
  assert.equal(completion.status, "needs_attention");
  assert.match(completion.response, /ocupado/);
});

test("runWorker releases the Codex writer after every processed job", async () => {
  const api = apiFixture({ id: "job-3", prompt: "hola" });
  const calls = [];
  const codex = {
    async start() { calls.push("start"); },
    async listThreads() { return []; },
    async runJob() {
      return { threadId: "thread-1", threadName: "Secretario", response: "respuesta" };
    },
    stop() { calls.push("stop"); },
  };

  await runWorker({ api, codex, workerId: "mac", once: true });

  assert.deepEqual(calls, ["start", "stop"]);
});

test("runWorker releases the Codex writer after a failed loop", async () => {
  const api = apiFixture(null);
  const calls = [];
  const codex = {
    async start() { calls.push("start"); },
    async listThreads() { throw new Error("boom"); },
    stop() { calls.push("stop"); },
  };

  await runWorker({ api, codex, workerId: "mac", once: true });

  assert.deepEqual(calls, ["start", "stop"]);
});
