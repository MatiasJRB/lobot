#!/usr/bin/env node

// Synthetic local end-to-end: OpenClaw hook -> authenticated intake -> queue ->
// isolated Codex thread -> completion. No WhatsApp provider call is possible.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import express from "express";
import { BridgeApiClient } from "../src/bridge/api-client.js";
import { CodexAppServerClient } from "../src/bridge/app-server-client.js";
import { validateAliGroupAnswer } from "../src/bridge/ali-group.js";
import { createBridgeRouter } from "../src/bridge/routes.js";
import { BridgeStore } from "../src/bridge/store.js";
import { aliQaChildEnv, assertAliQaHome, runWorkerOnce } from "../src/bridge/worker.js";

const require = createRequire(import.meta.url);
const plugin = require("../src/personal-os/openclaw-events-plugin/index.cjs");
const groupJid = process.env.ALI_GROUP_JID?.trim();
const threadId = process.env.ALI_GROUP_CODEX_THREAD_ID?.trim();
const cwd = process.env.ALI_GROUP_REPO_CWD?.trim();
const home = process.env.ALI_GROUP_CODEX_HOME?.trim();
if (!/^\d{10,25}@g\.us$/.test(groupJid || "") || !threadId || !cwd) {
  throw new Error("ALI_GROUP_JID, ALI_GROUP_CODEX_THREAD_ID and ALI_GROUP_REPO_CWD are required");
}
assertAliQaHome(home);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ali-qa-smoke-"));
const token = crypto.randomBytes(24).toString("hex");
const store = new BridgeStore(path.join(directory, "state.json"));
let attemptedProviderSend = false;
const app = express();
app.use(express.json());
app.use("/bridge/api", createBridgeRouter({ store, token, aliGroupJid: groupJid,
  aliGroupIntakeEnabled: true, aliGroupReplyEnabled: false,
  deliverJob: async () => { attemptedProviderSend = true;
    throw new Error("Smoke must never send WhatsApp"); } }));
const server = http.createServer(app);
const qaCodex = new CodexAppServerClient({ codexPath: process.env.CODEX_PATH || "codex",
  childEnv: aliQaChildEnv(), requestTimeoutMs: 60_000 });
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/bridge/api`;
  const messageId = `smoke-${crypto.randomUUID()}`;
  const body = "@lobot ¿cómo distinguimos la tarjeta de débito TEST nueva de la guardada en MP?";
  const handled = await plugin.handleAliGroupMention({ isGroup: true, body, content: body,
    timestamp: Date.now() }, { channelId: "whatsapp", accountId: "default",
    conversationId: groupJid, messageId, senderId: "+5491112345678" },
  { env: { ALI_GROUP_JID: groupJid, ALI_GROUP_MENTIONS_ENABLED: "true" },
    baseUrl, token });
  if (handled?.handled !== true) throw new Error("OpenClaw hook did not suppress group dispatch");
  const api = new BridgeApiClient({ baseUrl, token });
  const result = await runWorkerOnce({ api, codex: { async listThreads() { return []; } },
    qaCodex, workerId: "ali-qa-smoke", aliThreadId: threadId, aliRepoCwd: cwd,
    aliCodexHome: home, personalOsSync: false });
  validateAliGroupAnswer(result.job?.response);
  if (attemptedProviderSend || result.delivery?.attempted ||
      result.delivery?.reason !== "group-replies-disabled") {
    throw new Error("Smoke unexpectedly attempted group delivery");
  }
  console.log(JSON.stringify({ ok: true, jobId: result.job.id,
    status: result.job.status, threadId: result.job.threadId,
    delivery: result.delivery.reason, providerSendAttempted: false }));
} finally {
  qaCodex.stop();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}
