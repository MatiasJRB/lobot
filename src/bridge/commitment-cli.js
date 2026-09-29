import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const PERSONAL_OS_DIR =
  process.env.PERSONAL_OS_DIR?.trim() ||
  path.join(os.homedir(), "Documents", "Codex", "personal-organization");

function run(argv, { cwd = PERSONAL_OS_DIR, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PERSONAL_OS_ROOT: cwd },
    });
    const stdout = [];
    const stderr = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Personal OS command timed out"));
    }, timeoutMs);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1_000_000) child.kill("SIGKILL");
        else chunks.push(chunk);
      });
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      const error = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) return reject(new Error(error || output || `Personal OS exited ${code}`));
      try {
        return resolve(JSON.parse(output));
      } catch {
        return reject(new Error("Personal OS returned invalid JSON"));
      }
    });
  });
}

async function withPrivatePayload(payload, callback, { directory = PERSONAL_OS_DIR } = {}) {
  const privateDir = path.join(directory, "private");
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const filename = path.join(privateDir,
    `.commitment-${process.pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(filename, `${JSON.stringify(payload)}\n`, { mode: 0o600, flag: "wx" });
  try {
    return await callback(filename);
  } finally {
    fs.unlinkSync(filename);
  }
}

export async function captureCommitmentJob(job, { directory = PERSONAL_OS_DIR,
  execute = run } = {}) {
  let payload;
  try {
    payload = JSON.parse(job.prompt);
  } catch {
    throw new Error("Commitment capture payload is not valid JSON");
  }
  try {
    const result = await withPrivatePayload(payload, (filename) => execute([
      path.join(directory, "bin", "personal-os"),
      "capture-commitment", "--file", filename,
    ], { cwd: directory }), { directory });
    const disposition = result.deduplicated ? "ya existía" : result.adopted ? "vinculado" : "creado";
    return {
      threadName: "Secretario personal",
      response: `Compromiso ${disposition}: ${result.card.title} (${result.card.id}).`,
      details: { kind: "commitment-capture", cardId: result.card.id,
        created: Boolean(result.created), deduplicated: Boolean(result.deduplicated) },
    };
  } catch (error) {
    const failure = {
      source: "openclaw",
      external_id: job.id,
      occurred_at: new Date().toISOString(),
      error: String(error.message || error).slice(0, 1000),
      payload: job.prompt,
      card_id_hint: payload?.card_id || null,
    };
    await withPrivatePayload(failure, (filename) => execute([
      path.join(directory, "bin", "personal-os"),
      "record-capture-failure", "--file", filename,
    ], { cwd: directory }), { directory }).catch(() => {});
    throw error;
  }
}

function actionLine(action, index) {
  const marker = action.autonomous ? "Puedo mover" : "Necesito de vos";
  const why = action.why?.length ? ` (${action.why.join(", ")})` : "";
  return `${index + 1}. ${marker}: ${action.title} — ${action.next_action}${why}`;
}

export async function runCommitmentReview(job, { directory = PERSONAL_OS_DIR,
  execute = run, now = new Date() } = {}) {
  const review = await execute([
    path.join(directory, "bin", "personal-os"),
    "executive-review", "--at", now.toISOString(), "--horizon-hours", "24",
  ], { cwd: directory });
  const actions = review.recommended_actions || [];
  const failures = review.capture_failures || [];
  const alertRows = [...(review.alerts?.prepared || []), ...(review.alerts?.retrying || [])];
  if (!actions.length && !failures.length && !alertRows.length) {
    return { threadName: "Secretario personal", response: "DONT_NOTIFY",
      details: { kind: "commitment-review", alertIds: [] } };
  }
  const lines = ["Revisión ejecutiva de las 09:30:"];
  if (failures.length) lines.push(`• Hay ${failures.length} falla(s) de captura o envío para revisar.`);
  lines.push(...actions.slice(0, 3).map(actionLine));
  if (alertRows.length) lines.push(`• ${alertRows.length} aviso(s) de plazo quedaron preparados.`);
  return {
    threadName: "Secretario personal",
    response: lines.join("\n").slice(0, 3600),
    details: { kind: "commitment-review", alertIds: alertRows.map((row) => row.alert_id) },
  };
}

export async function recordCommitmentDelivery(result, delivery, { directory = PERSONAL_OS_DIR,
  execute = run, now = new Date() } = {}) {
  const ids = result?.details?.kind === "commitment-review" ? result.details.alertIds || [] : [];
  if (!ids.length) return { recorded: 0 };
  const state = delivery?.ok && delivery?.attempted ? "sent" : "failed";
  let recorded = 0;
  for (const alertId of ids) {
    const argv = [path.join(directory, "bin", "personal-os"), "record-alert-delivery",
      String(alertId), "--state", state, "--at", now.toISOString()];
    if (state === "sent") argv.push("--receipt-ref", `bridge-job:${result.jobId || "unknown"}`);
    else argv.push("--error", delivery?.error || "WhatsApp delivery was not attempted");
    await execute(argv, { cwd: directory });
    recorded += 1;
  }
  return { recorded, state };
}
