#!/usr/bin/env node

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "../bridge/api-client.js";

const KNOWLEDGE_WAIT_TIMEOUT_MS = 40_000;
const KNOWLEDGE_POLL_INTERVAL_MS = 750;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function argValue(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function requireValue(name, args) {
  const value = argValue(name, args);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function clientFromEnv() {
  const baseUrl = process.env.CODEX_BRIDGE_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 8080}/bridge/api`;
  const token = process.env.CODEX_BRIDGE_TOKEN?.trim();
  return new BridgeApiClient({ baseUrl, token });
}

function formatThreads(threads) {
  if (!threads.length) return "No hay un worker Mac conectado ni hilos disponibles.";
  return threads
    .slice(0, 20)
    .map((thread, index) => {
      const name = thread.name || thread.preview || "Sin título";
      return `${index + 1}. ${name} — ${thread.id}`;
    })
    .join("\n");
}

export async function runCli(args, {
  client = clientFromEnv(),
  output = console.log,
  wait = delay,
  now = Date.now,
} = {}) {
  const command = args[0];
  if (command === "threads") {
    const { threads } = await client.listThreads();
    output(formatThreads(threads));
    return;
  }
  if (command === "enqueue") {
    const prompt = requireValue("--prompt", args);
    const thread = argValue("--thread", args) || "recent";
    const mode = argValue("--mode", args) || "read-only";
    const idempotencyKey = argValue("--idempotency-key", args) || crypto.randomUUID();
    const reply = args.includes("--no-reply") ? undefined : { channel: "whatsapp-self" };
    const result = await client.enqueueJob({
      prompt,
      thread,
      mode,
      idempotencyKey,
      source: "openclaw-whatsapp",
      ...(reply ? { reply } : {}),
    });
    output(
      `${result.created ? "Pedido encolado" : "Pedido ya existente"}: ${result.job.id}\n` +
        `Hilo: ${thread}\nEstado: ${result.job.status}`,
    );
    return;
  }
  if (command === "knowledge") {
    const query = requireValue("--query", args);
    const idempotencyKey = argValue("--idempotency-key", args) || crypto.randomUUID();
    const shouldWait = args.includes("--wait");
    const reply = args.includes("--no-reply") || shouldWait
      ? undefined
      : { channel: "whatsapp-self" };
    const result = await client.enqueueJob({
      prompt: query,
      thread: "recent",
      mode: "read-only",
      idempotencyKey,
      source: "knowledge-hub-query",
      ...(reply ? { reply } : {}),
    });
    if (shouldWait) {
      const deadline = now() + KNOWLEDGE_WAIT_TIMEOUT_MS;
      while (now() < deadline) {
        await wait(KNOWLEDGE_POLL_INTERVAL_MS);
        const { job } = await client.getJob(result.job.id);
        if (job?.status === "done" && typeof job.response === "string") {
          output(job.response);
          return;
        }
        if (job && ["failed", "needs_attention"].includes(job.status)) {
          throw new Error(job.error || job.response || "Knowledge query failed");
        }
      }
      throw new Error("Knowledge query timed out");
    }
    output(
      `${result.created ? "Consulta encolada" : "Consulta ya existente"}: ${result.job.id}\n` +
        `Estado: ${result.job.status}. El resultado vuelve por WhatsApp sin abrir un hilo de Codex.`,
    );
    return;
  }
  if (command === "status") {
    const jobId = requireValue("--job-id", args);
    const { job } = await client.getJob(jobId);
    output(JSON.stringify(job, null, 2));
    return;
  }
  throw new Error(
    "Usage: codex-bridge.js threads | enqueue --thread <recent|new|id|title> --prompt <text> [--mode read-only|workspace-write] | knowledge --query <text> [--idempotency-key <id>] [--wait] [--no-reply] | status --job-id <id>",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`[codex-bridge] ${error.message}`);
    process.exitCode = 1;
  });
}
