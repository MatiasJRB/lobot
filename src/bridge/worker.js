#!/usr/bin/env node

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "./api-client.js";
import {
  CodexAppServerClient,
  ThreadSelectorError,
} from "./app-server-client.js";
import { pullPersonalOsEvents } from "./personal-os-events.js";
import { pullPersonalOsNotices } from "./personal-os-notices.js";
import { runKnowledgeQuery } from "./knowledge-query.js";
import { collectAliQaContext } from "./ali-qa-context.js";
import { syncAliQaAuth } from "./ali-qa-auth.js";
import { ALI_GROUP_SOURCE, ALI_QA_CODEX_CONFIG } from "./ali-group.js";
import {
  captureCommitmentJob,
  recordCommitmentDelivery,
  runCommitmentReview,
} from "./commitment-cli.js";

export const WORKER_VERSION = "0.1.1";
const MAX_BUSY_ATTEMPTS = 12;
const MAX_HEARTBEAT_PREVIEW_CHARS = 240;

function activeWriterConflict(error) {
  return /already has an active writer/i.test(String(error?.message || ""));
}

function busyRetryDelayMs(attemptCount) {
  return Math.min(5 * 60_000 * 2 ** Math.max(0, attemptCount - 1), 60 * 60_000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function aliQaChildEnv(env = process.env) {
  const allowed = ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL",
    "TMPDIR"];
  return { ...Object.fromEntries(allowed.filter((name) => env[name])
    .map((name) => [name, env[name]])),
  ...(env.ALI_GROUP_CODEX_HOME ? { CODEX_HOME: env.ALI_GROUP_CODEX_HOME } : {}) };
}

export function assertAliQaHome(home) {
  if (!home || !fs.statSync(home, { throwIfNoEntry: false })?.isDirectory() ||
      !fs.statSync(path.join(home, "auth.json"), { throwIfNoEntry: false })?.isFile()) {
    throw new Error("ALI QA isolated Codex home is not provisioned");
  }
  if (fs.readFileSync(path.join(home, "config.toml"), "utf8") !== ALI_QA_CODEX_CONFIG) {
    throw new Error("ALI QA isolated Codex config is unsafe");
  }
}

export function summarizeThreads(threads) {
  return threads.map((thread) => ({
    id: thread.id,
    name: thread.name || null,
    preview: String(thread.preview || "").slice(0, MAX_HEARTBEAT_PREVIEW_CHARS),
    cwd: thread.cwd || null,
    updatedAt: thread.updatedAt || null,
    status: thread.status || null,
  }));
}

function selectorFailure(error) {
  if (!(error instanceof ThreadSelectorError)) return null;
  const candidates = error.candidates?.length
    ? `\nOpciones:\n${error.candidates.map((item) => `- ${item.name} (${item.id})`).join("\n")}`
    : "";
  return `${error.message}.${candidates}`;
}

export async function runWorkerOnce({ api, codex, workerId, leaseMs = 35 * 60 * 1000,
  qaCodex = null, aliContext = collectAliQaContext, aliAuthSync = syncAliQaAuth,
  aliThreadId = process.env.ALI_GROUP_CODEX_THREAD_ID,
  aliRepoCwd = process.env.ALI_GROUP_REPO_CWD,
  aliCodexHome = process.env.ALI_GROUP_CODEX_HOME,
  personalOsSync = true,
  knowledgeQuery = runKnowledgeQuery, commitmentCapture = captureCommitmentJob,
  commitmentReview = runCommitmentReview,
  commitmentDelivery = recordCommitmentDelivery }) {
  if (personalOsSync && typeof api.listPersonalOsNotices === "function") {
    try {
      await pullPersonalOsNotices(api);
    } catch (error) {
      console.error(`[codex-bridge] Personal OS notice pull failed: ${error.message}`);
    }
  }
  if (personalOsSync) {
    try {
      const pulled = await pullPersonalOsEvents(api);
      if (pulled.quarantined) {
        console.error(`[codex-bridge] quarantined ${pulled.quarantined} invalid OpenClaw events`);
      }
    } catch (error) {
      console.error(`[codex-bridge] Personal OS event pull failed: ${error.message}`);
    }
  }
  const { job } = await api.claimJob(workerId, leaseMs);
  const localOnly = job && [ALI_GROUP_SOURCE, "knowledge-hub-query", "personal-os-commitment-capture",
    "personal-os-commitment-review"].includes(job.source);
  let threads = [];
  if (!localOnly) {
    if (typeof codex.start === "function") await codex.start();
    threads = await codex.listThreads({ limit: 100 });
  }
  await api.heartbeat({
    workerId,
    version: WORKER_VERSION,
    host: os.hostname(),
    threads: summarizeThreads(threads),
  });
  if (!job) return { processed: false };

  try {
    const result = job.source === "knowledge-hub-query"
      ? await knowledgeQuery(job)
      : job.source === "personal-os-commitment-capture"
        ? await commitmentCapture(job)
      : job.source === "personal-os-commitment-review"
          ? await commitmentReview(job)
          : job.source === ALI_GROUP_SOURCE
            ? await (async () => {
                if (!qaCodex || !aliThreadId || !aliRepoCwd)
                  throw new Error("ALI QA dedicated runner is not configured");
                // Drop any in-memory login before refreshing the private cache.
                if (typeof qaCodex.stop === "function") await qaCodex.stop();
                assertAliQaHome(aliCodexHome);
                await aliAuthSync(aliCodexHome);
                const context = await aliContext(job.prompt, { cwd: aliRepoCwd });
                await qaCodex.start();
                return qaCodex.runAliQaJob(job, { threadId: aliThreadId,
                  cwd: aliRepoCwd, context, timeoutMs: leaseMs - 60_000 });
              })()
          : await codex.runJob(job, { timeoutMs: leaseMs - 60_000 });
    const completed = await api.completeJob(job.id, {
      workerId,
      status: "done",
      ...result,
    });
    if (job.source === "personal-os-commitment-review") {
      try {
        await commitmentDelivery({ ...result, jobId: job.id }, completed.delivery);
      } catch (error) {
        console.error(`[codex-bridge] commitment delivery receipt failed: ${error.message}`);
      }
    }
    return { processed: true, job: completed.job, delivery: completed.delivery };
  } catch (error) {
    if (activeWriterConflict(error) && (job.attemptCount || 1) < MAX_BUSY_ATTEMPTS) {
      const deferred = await api.deferJob(job.id, {
        workerId,
        reason: "thread_active_writer",
        delayMs: busyRetryDelayMs(job.attemptCount || 1),
      });
      return { processed: true, deferred: true, job: deferred.job };
    }
    const selectionError = selectorFailure(error);
    const response = selectionError
      ? `No pude elegir el hilo. ${selectionError}`
      : activeWriterConflict(error)
        ? "El hilo siguió ocupado tras varios intentos; la revisión requiere atención."
      : null;
    const completed = await api.completeJob(job.id, {
      workerId,
      status: selectionError || activeWriterConflict(error) ? "needs_attention" : "failed",
      response,
      error: error.message,
    });
    return { processed: true, job: completed.job, delivery: completed.delivery };
  }
}

export async function runWorker({ api, codex, qaCodex = null, workerId,
  pollMs = 5_000, once = false }) {
  do {
    try {
      const result = await runWorkerOnce({ api, codex, qaCodex, workerId });
      if (result.processed) {
        // Resuming a Codex thread gives this app-server process its writer lock.
        // The app-server keeps that lock until the process exits, even after the
        // turn completes, so recycle it after every claimed job. Otherwise a
        // WhatsApp dispatch can leave the pinned desktop task unusable forever.
        codex.stop();
        qaCodex?.stop();
      } else if (!once) {
        await sleep(pollMs);
      }
    } catch (error) {
      // A timed-out/failed turn can retain the same writer lock. Always discard
      // the client before retrying so the next loop starts with a clean server.
      codex.stop();
      qaCodex?.stop();
      console.error(`[codex-bridge] ${error.message}`);
      if (!once) await sleep(Math.max(pollMs, 10_000));
    }
  } while (!once);
}

function env(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  const baseUrl = env("CODEX_BRIDGE_URL");
  const token = env("CODEX_BRIDGE_TOKEN");
  const workerId = env("CODEX_BRIDGE_WORKER_ID", `mac-${os.hostname()}`);
  const once = process.argv.includes("--once");
  const api = new BridgeApiClient({ baseUrl, token });
  const codex = new CodexAppServerClient({ codexPath: env("CODEX_PATH", "codex") });
  const qaCodex = new CodexAppServerClient({ codexPath: env("CODEX_PATH", "codex"),
    childEnv: aliQaChildEnv() });
  const stop = () => {
    codex.stop();
    qaCodex.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await runWorker({ api, codex, qaCodex, workerId, once });
  codex.stop();
  qaCodex.stop();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`[codex-bridge] fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
