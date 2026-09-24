import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "./codex-bridge.js";

test("knowledge command enqueues a local read-only query", async () => {
  const calls = [];
  const output = [];
  const client = {
    async enqueueJob(input) {
      calls.push(input);
      return { created: true, job: { id: "job-1", status: "queued" } };
    },
  };

  await runCli([
    "knowledge",
    "--query",
    "qué sabemos de viajes",
    "--idempotency-key",
    "message-1",
  ], { client, output: (line) => output.push(line) });

  assert.equal(calls[0].source, "knowledge-hub-query");
  assert.equal(calls[0].mode, "read-only");
  assert.equal(calls[0].reply.channel, "whatsapp-self");
  assert.equal(calls[0].prompt, "qué sabemos de viajes");
  assert.match(output[0], /sin abrir un hilo de Codex/);
});

test("knowledge --wait returns the Hub result without scheduling a second WhatsApp reply", async () => {
  const calls = [];
  const output = [];
  const client = {
    async enqueueJob(input) {
      calls.push(input);
      return { created: true, job: { id: "job-2", status: "queued" } };
    },
    async getJob(id) {
      assert.equal(id, "job-2");
      return {
        job: {
          id,
          status: "done",
          response: "Viajes — Preferencias y decisiones de viaje. Fuente: 30 Wiki/Viajes.md",
        },
      };
    },
  };

  await runCli([
    "knowledge",
    "--query",
    "qué sabemos de viajes",
    "--idempotency-key",
    "message-2",
    "--wait",
  ], {
    client,
    output: (line) => output.push(line),
    wait: async () => {},
  });

  assert.equal("reply" in calls[0], false);
  assert.deepEqual(output, [
    "Viajes — Preferencias y decisiones de viaje. Fuente: 30 Wiki/Viajes.md",
  ]);
});
