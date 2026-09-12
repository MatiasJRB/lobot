import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTANT_CRON_JOBS,
  ACCOUNTANT_MESSAGING_CONTRACT_VERSION,
  acceptsAccountantMessagingContract,
  accountantCommandCreateArgs,
  accountantCommandEditArgs,
} from "./cron-schedule.js";

const opts = {
  cwd: "/app",
  nodePath: "node",
  tz: "America/Argentina/Buenos_Aires",
  timeoutSeconds: 60,
  noOutputTimeoutSeconds: 30,
  outputMaxBytes: 4000,
};

test("accountant schedules monitoring, billing and payment verification", () => {
  assert.deepEqual(
    ACCOUNTANT_CRON_JOBS.map(({ cadence, schedule }) => ({ cadence, schedule })),
    [
      { cadence: "monitor", schedule: "0 9,17 * * 1-5" },
      { cadence: "billing", schedule: "0 9 1 * *" },
      { cadence: "payment", schedule: "0 9 18,21,23 * *" },
    ],
  );
});

test("accountant cron activation requires the exact messaging contract", () => {
  assert.equal(acceptsAccountantMessagingContract({}), false);
  assert.equal(
    acceptsAccountantMessagingContract({
      confirmMessagingContract: true,
      messagingContractVersion: "old",
    }),
    false,
  );
  assert.equal(
    acceptsAccountantMessagingContract({
      confirmMessagingContract: true,
      messagingContractVersion: ACCOUNTANT_MESSAGING_CONTRACT_VERSION,
    }),
    true,
  );
});

test("accountant cron commands dispatch to Codex without OpenClaw delivery", () => {
  const monitor = ACCOUNTANT_CRON_JOBS[0];
  const created = accountantCommandCreateArgs(monitor, opts);
  const edited = accountantCommandEditArgs("job-1", monitor, opts);

  for (const args of [created, edited]) {
    assert.ok(args.includes("--no-deliver"));
    assert.equal(args.includes("--announce"), false);
    assert.equal(args.includes("--channel"), false);
    assert.equal(args.includes("--to"), false);
    const argv = JSON.parse(args[args.indexOf("--command-argv") + 1]);
    assert.deepEqual(argv, [
      "node",
      "/app/src/cron/dispatch-accountant.js",
      "--cadence",
      "monitor",
    ]);
  }
});

