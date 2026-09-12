import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import { PERSONAL_OS_MESSAGING_CONTRACT_VERSION } from "./cron-schedule.js";
import { createPersonalOsCronRouter } from "./routes.js";

async function fixture(installCrons) {
  const app = express();
  app.use(express.json());
  app.use("/setup/api/crons", createPersonalOsCronRouter({ installCrons }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    server,
    request(body) {
      return fetch(
        `http://127.0.0.1:${port}/setup/api/crons/install-personal-os`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
  };
}

test("personal OS cron route rejects activation without exact contract", async (t) => {
  let called = false;
  const app = await fixture(async () => {
    called = true;
    return { ok: true };
  });
  t.after(() => app.server.close());

  const response = await app.request({ confirmMessagingContract: true });
  assert.equal(response.status, 400);
  assert.equal(called, false);
  const payload = await response.json();
  assert.equal(
    payload.messagingContractVersion,
    PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
  );
});

test("personal OS cron route installs jobs after exact contract approval", async (t) => {
  const calls = [];
  const app = await fixture(async (options) => {
    calls.push(options);
    return { ok: true, output: "installed" };
  });
  t.after(() => app.server.close());

  const response = await app.request({
    confirmMessagingContract: true,
    messagingContractVersion: PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
    tz: "America/Argentina/Buenos_Aires",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      tz: "America/Argentina/Buenos_Aires",
      timeoutSeconds: undefined,
      noOutputTimeoutSeconds: undefined,
      outputMaxBytes: undefined,
    },
  ]);
  assert.deepEqual(await response.json(), { ok: true, output: "installed" });
});
