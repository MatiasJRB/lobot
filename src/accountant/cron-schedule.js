import path from "node:path";

export const ACCOUNTANT_CRON_JOBS = [
  {
    cadence: "monitor",
    schedule: "0 9,17 * * 1-5",
    name: "Contador — monitor fiscal",
  },
  {
    cadence: "billing",
    schedule: "0 9 1 * *",
    name: "Contador — facturación mensual",
  },
  {
    cadence: "payment",
    schedule: "0 9 18,21,23 * *",
    name: "Contador — verificación de pago",
  },
];

export const ACCOUNTANT_MESSAGING_CONTRACT_VERSION = "2026-09-12-v1";

export function acceptsAccountantMessagingContract(payload) {
  return (
    payload?.confirmMessagingContract === true &&
    payload?.messagingContractVersion === ACCOUNTANT_MESSAGING_CONTRACT_VERSION
  );
}

export function accountantCommandArgv(cadence, opts = {}) {
  const nodePath = opts.nodePath || "node";
  const cwd = opts.cwd || process.cwd();
  return [
    nodePath,
    path.join(cwd, "src", "cron", "dispatch-accountant.js"),
    "--cadence",
    cadence,
  ];
}

function commandArgs(action, existingJobId, job, opts) {
  const args = ["cron", action];
  if (existingJobId) args.push(existingJobId, "--cron");
  args.push(job.schedule);
  if (!existingJobId) args.push("--name", job.name);
  args.push(
    "--tz",
    opts.tz,
    "--command-argv",
    JSON.stringify(
      accountantCommandArgv(job.cadence, {
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
  );
  return args;
}

export function accountantCommandCreateArgs(job, opts) {
  return commandArgs("create", "", job, opts);
}

export function accountantCommandEditArgs(existingJobId, job, opts) {
  return commandArgs("edit", existingJobId, job, opts);
}

