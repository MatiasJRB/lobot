#!/usr/bin/env node

import os from "node:os";
import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "./api-client.js";
import {
  CodexAppServerClient,
  ThreadSelectorError,
} from "./app-server-client.js";

export const WORKER_VERSION = "0.1.0";
const MAX_BUSY_ATTEMPTS = 12;

function activeWriterConflict(error) {
  return /already has an active writer/i.test(String(error?.message || ""));
}

function busyRetryDelayMs(attemptCount) {
  return Math.min(5 * 60_000 * 2 ** Math.max(0, attemptCount - 1), 60 * 60_000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarizeThreads(threads) {
  return threads.map((thread) => ({
    id: thread.id,
    name: thread.name || null,
    preview: thread.preview || "",
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

export async function runWorkerOnce({ api, codex, workerId, leaseMs = 35 * 60 * 1000 }) {
  const threads = await codex.listThreads({ limit: 100 });
  await api.heartbeat({
    workerId,
    version: WORKER_VERSION,
    host: os.hostname(),
    threads: summarizeThreads(threads),
  });

  const { job } = await api.claimJob(workerId, leaseMs);
  if (!job) return { processed: false };

  try {
    const result = await codex.runJob(job, { timeoutMs: leaseMs - 60_000 });
    const completed = await api.completeJob(job.id, {
      workerId,
      status: "done",
      ...result,
    });
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

export async function runWorker({ api, codex, workerId, pollMs = 5_000, once = false }) {
  do {
    try {
      await codex.start();
      const result = await runWorkerOnce({ api, codex, workerId });
      if (!result.processed && !once) await sleep(pollMs);
    } catch (error) {
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
  const stop = () => {
    codex.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await runWorker({ api, codex, workerId, once });
  codex.stop();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`[codex-bridge] fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
