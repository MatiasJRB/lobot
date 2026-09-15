import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runScheduledWhatsAppJob } from "./run-scheduled-whatsapp.js";

function fixture(status = "scheduled") {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "scheduled-whatsapp-"));
  const jobFile = path.join(stateDir, "job.json");
  fs.writeFileSync(jobFile, JSON.stringify({
    status,
    target: "+5492910000000",
    message: "Texto exacto",
    timeoutSeconds: 90,
  }));
  return { stateDir, jobFile };
}

test("runner sends once and persists the accepted message id", () => {
  const { stateDir, jobFile } = fixture();
  let calls = 0;
  const run = (_node, args) => {
    calls++;
    assert.ok(args.includes("message"));
    assert.ok(args.includes("send"));
    return {
      status: 0,
      stdout: JSON.stringify({ status: "ok", messageId: "wamid-123" }),
    };
  };
  const result = runScheduledWhatsAppJob({ stateDir, jobFile, run });
  assert.deepEqual(result, { ok: true, messageId: "wamid-123" });
  assert.equal(calls, 1);
  assert.equal(JSON.parse(fs.readFileSync(jobFile, "utf8")).status, "completed");

  const duplicate = runScheduledWhatsAppJob({ stateDir, jobFile, run });
  assert.deepEqual(duplicate, {
    ok: true,
    duplicateSuppressed: true,
    messageId: "wamid-123",
  });
  assert.equal(calls, 1);
});

test("runner fails closed after an uncertain delivery", () => {
  const { stateDir, jobFile } = fixture();
  assert.throws(
    () => runScheduledWhatsAppJob({
      stateDir,
      jobFile,
      run: () => ({ status: 1, stdout: "" }),
    }),
    /delivery_state_uncertain/,
  );
  assert.equal(JSON.parse(fs.readFileSync(jobFile, "utf8")).status, "uncertain");
  assert.throws(
    () => runScheduledWhatsAppJob({ stateDir, jobFile, run: () => null }),
    /delivery_state_uncertain/,
  );
});
