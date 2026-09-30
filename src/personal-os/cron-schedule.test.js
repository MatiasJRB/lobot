import assert from "node:assert/strict";
import test from "node:test";

import {
  PERSONAL_OS_CRON_JOBS,
  PERSONAL_OS_MANUAL_CODEX_CADENCES,
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

test("low-quota V1 schedules only the deterministic daily review", () => {
  assert.deepEqual(
    PERSONAL_OS_CRON_JOBS.map(({ cadence, schedule }) => ({ cadence, schedule })),
    [
      { cadence: "commitments", schedule: "30 9 * * *" },
    ],
  );
  assert.deepEqual(PERSONAL_OS_MANUAL_CODEX_CADENCES, ["weekly", "monthly"]);
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

test("personal OS cron command dispatches through the bridge without direct delivery", () => {
  const commitments = PERSONAL_OS_CRON_JOBS[0];
  const created = personalOsCommandCreateArgs(commitments, opts);
  const edited = personalOsCommandEditArgs("job-1", commitments, opts);

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
      "commitments",
    ]);
  }
});
