import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  captureCommitmentJob,
  recordCommitmentDelivery,
  runCommitmentReview,
} from "./commitment-cli.js";

test("capture commitment uses a private payload and returns canonical disposition", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-cli-"));
  fs.mkdirSync(path.join(directory, "private"));
  try {
    const seen = [];
    const result = await captureCommitmentJob({ id: "job-1",
      prompt: JSON.stringify({ card_id: "puma", identities: ["order:1"] }) }, {
      directory,
      async execute(argv) {
        const filename = argv.at(-1);
        seen.push({ mode: fs.statSync(filename).mode & 0o777,
          payload: JSON.parse(fs.readFileSync(filename, "utf8")) });
        return { created: true, deduplicated: false, adopted: false,
          card: { id: "puma", title: "Devolución PUMA" } };
      },
    });
    assert.equal(seen[0].mode, 0o600);
    assert.equal(seen[0].payload.card_id, "puma");
    assert.match(result.response, /creado/);
    assert.equal(result.details.cardId, "puma");
    assert.equal(fs.readdirSync(path.join(directory, "private")).length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("09:30 review renders autonomous actions first and exposes alert ids", async () => {
  const result = await runCommitmentReview({ id: "review" }, {
    now: new Date("2026-09-29T12:30:00Z"),
    async execute() {
      return {
        recommended_actions: [
          { autonomous: true, title: "PUMA", next_action: "Comprobar recibo",
            why: ["costo material"] },
          { autonomous: false, title: "Fotos", next_action: "Sacar dos fotos", why: [] },
        ],
        capture_failures: [],
        alerts: { prepared: [{ alert_id: 7 }], retrying: [] },
      };
    },
  });
  assert.match(result.response, /Puedo mover: PUMA/);
  assert.match(result.response, /Necesito de vos: Fotos/);
  assert.deepEqual(result.details.alertIds, [7]);
});

test("delivery receipts preserve prepared versus sent versus failed", async () => {
  const calls = [];
  const base = { details: { kind: "commitment-review", alertIds: [7, 8] }, jobId: "job-2" };
  const sent = await recordCommitmentDelivery(base, { ok: true, attempted: true }, {
    now: new Date("2026-09-29T12:31:00Z"),
    async execute(argv) { calls.push(argv); return { ok: true }; },
  });
  assert.deepEqual(sent, { recorded: 2, state: "sent" });
  assert.equal(calls.every((argv) => argv.includes("--receipt-ref")), true);
  calls.length = 0;
  const failed = await recordCommitmentDelivery(base,
    { ok: false, attempted: true, error: "gateway down" }, {
      async execute(argv) { calls.push(argv); return { ok: true }; },
    });
  assert.deepEqual(failed, { recorded: 2, state: "failed" });
  assert.equal(calls.every((argv) => argv.includes("--error")), true);
});
