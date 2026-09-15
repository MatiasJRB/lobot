import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildExactWhatsAppCommand,
  normalizeExactWhatsAppRequest,
  projectExactWhatsAppDelivery,
} from "../personal/whatsapp.js";

function parseJsonFromOutput(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const starts = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "{" || text[index] === "[") starts.push(index);
  }
  for (let index = starts.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(text.slice(starts[index]));
    } catch { }
  }
  return null;
}

function writeRecord(filePath, record) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function assertPrivateJobPath(filePath, rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteFile = path.resolve(filePath);
  if (path.dirname(absoluteFile) !== absoluteRoot || !absoluteFile.endsWith(".json")) {
    throw new Error("job_file_outside_private_state");
  }
  return absoluteFile;
}

export function runScheduledWhatsAppJob(options = {}) {
  const stateDir =
    options.stateDir ||
    process.env.SCHEDULED_WHATSAPP_STATE_DIR ||
    "/data/scheduled-whatsapp";
  const jobFile = assertPrivateJobPath(options.jobFile, stateDir);
  const record = JSON.parse(fs.readFileSync(jobFile, "utf8"));

  if (record.status === "completed") {
    return { ok: true, duplicateSuppressed: true, messageId: record.messageId };
  }
  if (record.status === "executing" || record.status === "uncertain") {
    throw new Error("delivery_state_uncertain");
  }
  if (record.status !== "scheduled" && record.status !== "preparing") {
    throw new Error("job_not_scheduled");
  }

  const request = normalizeExactWhatsAppRequest({
    target: record.target,
    message: record.message,
    timeoutSeconds: record.timeoutSeconds,
    dryRun: false,
  });
  const executing = {
    ...record,
    status: "executing",
    executionStartedAt: new Date().toISOString(),
  };
  writeRecord(jobFile, executing);

  const nodePath = options.nodePath || process.env.OPENCLAW_NODE || "node";
  const entryPath =
    options.entryPath ||
    process.env.OPENCLAW_ENTRY ||
    "/usr/local/lib/node_modules/openclaw/dist/entry.js";
  const run = options.run || childProcess.spawnSync;
  const result = run(
    nodePath,
    [entryPath, ...buildExactWhatsAppCommand(request)],
    {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      encoding: "utf8",
      timeout: (request.timeoutSeconds + 30) * 1000,
      maxBuffer: 1024 * 1024,
    },
  );
  const delivery = {
    code: typeof result.status === "number" ? result.status : 1,
    raw: parseJsonFromOutput(result.stdout),
  };
  const projected = projectExactWhatsAppDelivery(delivery, request);

  if (!projected.ok || !projected.messageId) {
    writeRecord(jobFile, {
      ...executing,
      status: "uncertain",
      executionFinishedAt: new Date().toISOString(),
      error: "delivery_state_uncertain",
    });
    throw new Error("delivery_state_uncertain");
  }

  writeRecord(jobFile, {
    ...executing,
    status: "completed",
    executionFinishedAt: new Date().toISOString(),
    messageId: projected.messageId,
  });
  return { ok: true, messageId: projected.messageId };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  try {
    const result = runScheduledWhatsAppJob({ jobFile: argumentValue("--job-file") });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
