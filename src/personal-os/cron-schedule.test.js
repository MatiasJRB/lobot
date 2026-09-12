import assert from "node:assert/strict";
import test from "node:test";

import {
  PERSONAL_OS_CRON_JOBS,
  PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
  acceptsPersonalOsMessagingContract,
  personalOsCommandCreateArgs,
  personalOsCommandEditArgs,
} from "./cron-schedule.js";

const opts = {
  cwd: "/app",
  nodePath: "node",
  tz: "America/Argentina/Buenos_Aires",
  timeoutSeconds: 60,
  noOutputTimeoutSeconds: 30,
  outputMaxBytes: 4000,
};

test("personal OS schedules weekly Sunday and monthly day one reviews", () => {
  assert.deepEqual(
    PERSONAL_OS_CRON_JOBS.map(({ cadence, schedule }) => ({ cadence, schedule })),
    [
      { cadence: "weekly", schedule: "30 18 * * 0" },
      { cadence: "monthly", schedule: "30 18 1 * *" },
    ],
  );
});

test("personal OS cron activation requires the exact messaging contract", () => {
  assert.equal(acceptsPersonalOsMessagingContract({}), false);
  assert.equal(
    acceptsPersonalOsMessagingContract({
      confirmMessagingContract: true,
      messagingContractVersion: "old",
    }),
    false,
  );
  assert.equal(
    acceptsPersonalOsMessagingContract({
      confirmMessagingContract: true,
      messagingContractVersion: PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
    }),
    true,
  );
});

test("personal OS cron commands dispatch to Codex without OpenClaw delivery", () => {
  const weekly = PERSONAL_OS_CRON_JOBS[0];
  const created = personalOsCommandCreateArgs(weekly, opts);
  const edited = personalOsCommandEditArgs("job-1", weekly, opts);

  for (const args of [created, edited]) {
    assert.ok(args.includes("--no-deliver"));
    assert.equal(args.includes("--announce"), false);
    assert.equal(args.includes("--channel"), false);
    assert.equal(args.includes("--to"), false);
    const argv = JSON.parse(args[args.indexOf("--command-argv") + 1]);
    assert.deepEqual(argv, [
      "node",
      "/app/src/cron/dispatch-codex-review.js",
      "--cadence",
      "weekly",
    ]);
  }
});
