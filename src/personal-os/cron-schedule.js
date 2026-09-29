import path from "node:path";

export const PERSONAL_OS_CRON_JOBS = [
  {
    cadence: "commitments",
    schedule: "30 9 * * *",
    name: "Personal OS — compromisos y plazos",
  },
  {
    cadence: "weekly",
    schedule: "30 18 * * 0",
    name: "Personal OS — revisión semanal",
  },
  {
    cadence: "monthly",
    schedule: "30 18 1 * *",
    name: "Personal OS — cierre mensual",
  },
];

export const PERSONAL_OS_MESSAGING_CONTRACT_VERSION = "2026-09-12-v1";

export function acceptsPersonalOsMessagingContract(payload) {
  return (
    payload?.confirmMessagingContract === true &&
    payload?.messagingContractVersion === PERSONAL_OS_MESSAGING_CONTRACT_VERSION
  );
}

export function personalOsCommandArgv(cadence, opts = {}) {
  const nodePath = opts.nodePath || "node";
  const cwd = opts.cwd || process.cwd();
  return [
    nodePath,
    path.join(cwd, "src", "cron", "dispatch-codex-review.js"),
    "--cadence",
    cadence,
  ];
}

export function personalOsCommandCreateArgs(job, opts) {
  return [
    "cron",
    "create",
    job.schedule,
    "--name",
    job.name,
    "--tz",
    opts.tz,
    "--command-argv",
    JSON.stringify(
      personalOsCommandArgv(job.cadence, {
        nodePath: opts.nodePath,
        cwd: opts.cwd,
      }),
    ),
    "--command-cwd",
    opts.cwd,
    "--timeout-seconds",
    String(opts.timeoutSeconds),
    "--no-output-timeout-seconds",
    String(opts.noOutputTimeoutSeconds),
    "--output-max-bytes",
    String(opts.outputMaxBytes),
    "--no-deliver",
  ];
}

export function personalOsCommandEditArgs(existingJobId, job, opts) {
  return [
    "cron",
    "edit",
    existingJobId,
    "--cron",
    job.schedule,
    "--tz",
    opts.tz,
    "--command-argv",
    JSON.stringify(
      personalOsCommandArgv(job.cadence, {
        nodePath: opts.nodePath,
        cwd: opts.cwd,
      }),
    ),
    "--command-cwd",
    opts.cwd,
    "--timeout-seconds",
    String(opts.timeoutSeconds),
    "--no-output-timeout-seconds",
    String(opts.noOutputTimeoutSeconds),
    "--output-max-bytes",
    String(opts.outputMaxBytes),
    "--no-deliver",
  ];
}
