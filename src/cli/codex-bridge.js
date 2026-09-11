#!/usr/bin/env node

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "../bridge/api-client.js";

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

export async function runCli(args, { client = clientFromEnv(), output = console.log } = {}) {
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
  if (command === "status") {
    const jobId = requireValue("--job-id", args);
    const { job } = await client.getJob(jobId);
    output(JSON.stringify(job, null, 2));
    return;
  }
  throw new Error(
    "Usage: codex-bridge.js threads | enqueue --thread <recent|new|id|title> --prompt <text> [--mode read-only|workspace-write] | status --job-id <id>",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`[codex-bridge] ${error.message}`);
    process.exitCode = 1;
  });
}
