import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTANT_CWD,
  ACCOUNTANT_THREAD,
  buildAccountantPrompt,
  localDateTimeKey,
  runAccountant,
} from "./dispatch-accountant.js";

test("localDateTimeKey uses Buenos Aires date and hour", () => {
  assert.deepEqual(localDateTimeKey(new Date("2026-09-13T02:30:00Z")), {
    date: "2026-09-12",
    hour: "23",
  });
});

test("monitor prompt owns the routine loop and stays quiet when healthy", () => {
  const prompt = buildAccountantPrompt("monitor", new Date("2026-09-14T12:00:00Z"));
  assert.match(prompt, /sin esperar que Matías/);
  assert.match(prompt, /DFE/);
  assert.match(prompt, /CCMA/);
  assert.match(prompt, /npm run doctor/);
  assert.match(prompt, /DONT_NOTIFY/);
  assert.match(prompt, /monitoring-state\.json/);
});

test("billing prompt prepares one approval batch without emitting", () => {
  const prompt = buildAccountantPrompt("billing", new Date("2026-10-01T12:00:00Z"));
  assert.match(prompt, /una única bandeja de aprobación/);
  assert.match(prompt, /dry-runs/);
  assert.match(prompt, /No emitas/);
});

test("payment prompt sends a healthy close only on day 23", () => {
  const before = buildAccountantPrompt("payment", new Date("2026-09-18T12:00:00Z"));
  const close = buildAccountantPrompt("payment", new Date("2026-09-23T12:00:00Z"));
  assert.match(before, /DONT_NOTIFY/);
  assert.match(close, /mes en orden/);
});

test("runAccountant enqueues idempotent monitor jobs per local hour", async () => {
  const calls = [];
  const client = {
    async enqueueJob(input) {
      calls.push(input);
      return { created: true, job: { id: "job-1", status: "queued" } };
    },
  };
  const output = [];

  const result = await runAccountant("monitor", {
    client,
    now: new Date("2026-09-14T12:00:00Z"),
    output: (line) => output.push(line),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].thread, ACCOUNTANT_THREAD);
  assert.equal(calls[0].cwd, ACCOUNTANT_CWD);
  assert.equal(calls[0].mode, "workspace-write");
  assert.equal(calls[0].idempotencyKey, "accountant:monitor:2026-09-14:09");
  assert.deepEqual(calls[0].reply, {
    channel: "whatsapp-self",
    policy: "actionable-only",
  });
  assert.equal(result.jobId, "job-1");
  assert.equal(JSON.parse(output[0]).status, "queued");
});

test("billing jobs always return the monthly approval package", async () => {
  const calls = [];
  const client = {
    async enqueueJob(input) {
      calls.push(input);
      return { created: true, job: { id: "job-2", status: "queued" } };
    },
  };

  await runAccountant("billing", {
    client,
    now: new Date("2026-10-01T12:00:00Z"),
    output: () => {},
  });

  assert.equal(calls[0].idempotencyKey, "accountant:billing:2026-10-01");
  assert.deepEqual(calls[0].reply, {
    channel: "whatsapp-self",
    policy: "always",
  });
});

test("buildAccountantPrompt rejects unknown cadence", () => {
  assert.throws(() => buildAccountantPrompt("daily"), /Unsupported cadence/);
});
