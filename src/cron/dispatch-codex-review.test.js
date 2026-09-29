import assert from "node:assert/strict";
import test from "node:test";

import {
  PERSONAL_ORGANIZATION_DIR,
  PERSONAL_OS_THREAD,
  buildReviewPrompt,
  localDateKey,
  runReview,
} from "./dispatch-codex-review.js";

test("localDateKey uses Buenos Aires time rather than UTC date", () => {
  assert.equal(localDateKey(new Date("2026-09-13T02:00:00Z")), "2026-09-12");
});

test("weekly prompt names deterministic sources, output and cadence", () => {
  const prompt = buildReviewPrompt("weekly", new Date("2026-09-13T21:30:00Z"));
  assert.match(prompt, /open-loops\.md/);
  assert.match(prompt, /reviews\/weekly-current\.md/);
  assert.match(prompt, /personal-os brief --horizon-hours 168 --limit 4/);
  assert.match(prompt, /complete-cadence weekly_review/);
  assert.match(prompt, /no puede enviar mensajes a terceros/);
});

test("monthly prompt includes Norte Financiero as canonical source", () => {
  const prompt = buildReviewPrompt("monthly", new Date("2026-10-01T21:30:00Z"));
  assert.match(prompt, /gastos-automaticos/);
  assert.match(prompt, /personal-os brief --horizon-hours 744 --limit 4/);
  assert.match(prompt, /complete-cadence monthly_review/);
});

test("commitment review enqueues a local handler without choosing a Codex task", async () => {
  const calls = [];
  const client = { async enqueueJob(input) {
    calls.push(input);
    return { created: true, job: { id: "job-c", status: "queued" } };
  } };
  await runReview("commitments", {
    client, now: new Date("2026-09-29T12:30:00Z"), output: () => {},
  });
  assert.equal(calls[0].source, "personal-os-commitment-review");
  assert.equal(calls[0].thread, "recent");
  assert.deepEqual(calls[0].reply,
    { channel: "whatsapp-self", policy: "actionable-only" });
  assert.equal(calls[0].idempotencyKey, "personal-os:commitments:2026-09-29");
});

test("runReview enqueues one idempotent writable job in the exact task", async () => {
  const calls = [];
  const client = {
    async enqueueJob(input) {
      calls.push(input);
      return { created: true, job: { id: "job-1", status: "queued" } };
    },
  };
  const output = [];
  const result = await runReview("weekly", {
    client,
    now: new Date("2026-09-13T21:30:00Z"),
    output: (line) => output.push(line),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].thread, PERSONAL_OS_THREAD);
  assert.equal(calls[0].cwd, PERSONAL_ORGANIZATION_DIR);
  assert.equal(calls[0].mode, "workspace-write");
  assert.equal(calls[0].idempotencyKey, "personal-os:weekly:2026-09-13");
  assert.deepEqual(calls[0].reply, { channel: "whatsapp-self" });
  assert.equal(result.jobId, "job-1");
  assert.equal(JSON.parse(output[0]).status, "queued");
});

test("buildReviewPrompt rejects unknown cadence", () => {
  assert.throws(() => buildReviewPrompt("daily"), /Unsupported cadence/);
});
