import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ALI_GROUP_REPLY_CHANNEL, ALI_GROUP_SOURCE } from "./ali-group.js";

const STATE_VERSION = 1;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_WORKER_TTL_MS = 2 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["done", "failed", "needs_attention"]);

function clone(value) {
  return structuredClone(value);
}

function nowIso(now) {
  return new Date(now).toISOString();
}

export function emptyBridgeState() {
  return { version: STATE_VERSION, jobs: [], workers: {} };
}

export function resolveBridgeStatePath() {
  const explicit = process.env.CODEX_BRIDGE_STATE_FILE?.trim();
  if (explicit) return explicit;
  const baseDir = process.env.CODEX_BRIDGE_STATE_DIR?.trim() || "/data";
  try {
    fs.accessSync(baseDir, fs.constants.W_OK);
    return path.join(baseDir, "codex-bridge-state.json");
  } catch {
    return path.join(process.cwd(), ".codex-bridge-state.json");
  }
}

export function normalizeThreadSelector(value) {
  const selector = String(value ?? "recent").trim();
  if (!selector || selector.toLowerCase() === "recent") {
    return { kind: "recent", value: null };
  }
  if (selector.toLowerCase() === "new") {
    return { kind: "new", value: null };
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(selector)) {
    return { kind: "id", value: selector };
  }
  return { kind: "title", value: selector };
}

export function validateJobInput(input, { trustedAliGroup = false } = {}) {
  if (!input || typeof input !== "object") return "Body must be an object";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) return "prompt is required";
  if (prompt.length > 20_000) return "prompt is too long";
  if (input.mode && !["read-only", "workspace-write"].includes(input.mode)) {
    return "mode must be read-only or workspace-write";
  }
  if (input.cwd !== undefined && typeof input.cwd !== "string") {
    return "cwd must be a string";
  }
  if (input.idempotencyKey !== undefined && typeof input.idempotencyKey !== "string") {
    return "idempotencyKey must be a string";
  }
  if ((input.source === ALI_GROUP_SOURCE || input.reply?.channel === ALI_GROUP_REPLY_CHANNEL) &&
      !trustedAliGroup) return "ALI group jobs require trusted intake";
  if (input.reply !== undefined) {
    if (!input.reply || typeof input.reply !== "object") return "reply must be an object";
    if (input.reply.channel !== "whatsapp-self" &&
        !(trustedAliGroup && input.reply.channel === ALI_GROUP_REPLY_CHANNEL)) {
      return "reply.channel must be whatsapp-self unless trusted ALI group intake";
    }
    if (
      input.reply.policy !== undefined &&
      !["always", "actionable-only"].includes(input.reply.policy)
    ) {
      return "reply.policy must be always or actionable-only";
    }
  }
  if (input.source === ALI_GROUP_SOURCE || input.reply?.channel === ALI_GROUP_REPLY_CHANNEL) {
    if (!trustedAliGroup) return "ALI group jobs require trusted intake";
    if (input.source !== ALI_GROUP_SOURCE || input.reply?.channel !== ALI_GROUP_REPLY_CHANNEL)
      return "ALI group source and reply must match";
    if (input.mode !== "read-only") return "ALI group jobs must be read-only";
    if (input.thread !== "ali-group-dedicated") return "ALI group jobs require dedicated thread";
    if (input.cwd !== undefined) return "ALI group cwd is fixed by worker";
    if (!/^ali-group:[a-f0-9]{64}$/.test(input.idempotencyKey || ""))
      return "ALI group idempotency key is invalid";
    if (!/^\d{10,25}@g\.us$/.test(input.reply?.conversationId || "") ||
        typeof input.reply?.sourceMessageId !== "string")
      return "ALI group reply target is invalid";
  }
  return null;
}

export class BridgeStore {
  constructor(statePath, { clock = () => Date.now() } = {}) {
    this.statePath = statePath;
    this.clock = clock;
    this.state = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
      if (parsed?.version === STATE_VERSION && Array.isArray(parsed.jobs) && parsed.workers) {
        return parsed;
      }
    } catch {
      // Missing or corrupt state starts empty. The next mutation rewrites it atomically.
    }
    return emptyBridgeState();
  }

  #save() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.statePath);
  }

  enqueue(input, { trustedAliGroup = false } = {}) {
    const validationError = validateJobInput(input, { trustedAliGroup });
    if (validationError) throw new TypeError(validationError);

    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = this.state.jobs.find((job) => job.idempotencyKey === idempotencyKey);
      if (existing) return { job: clone(existing), created: false };
    }

    const timestamp = nowIso(this.clock());
    const job = {
      id: crypto.randomUUID(),
      idempotencyKey,
      status: "queued",
      prompt: input.prompt.trim(),
      threadSelector: normalizeThreadSelector(input.thread),
      cwd: input.cwd?.trim() || null,
      mode: input.mode || "read-only",
      reply: input.reply || null,
      source: input.source?.trim?.() || "openclaw",
      createdAt: timestamp,
      updatedAt: timestamp,
      workerId: null,
      leaseExpiresAt: null,
      availableAt: null,
      attemptCount: 0,
      threadId: null,
      threadName: null,
      response: null,
      error: null,
      deliveredAt: null,
      deliveryAttemptedAt: null,
      groupReplySuppressedAt: null,
    };
    this.state.jobs.push(job);
    this.#save();
    return { job: clone(job), created: true };
  }

  getJob(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    return job ? clone(job) : null;
  }

  listJobs({ status, limit = 50 } = {}) {
    return this.state.jobs
      .filter((job) => !status || job.status === status)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 200)))
      .map(clone);
  }

  countRecentSource(source, sinceMs) {
    return this.state.jobs.filter((job) => job.source === source &&
      Date.parse(job.createdAt) > sinceMs).length;
  }

  hasIdempotencyKey(idempotencyKey) {
    return this.state.jobs.some((job) => job.idempotencyKey === idempotencyKey);
  }

  claim(workerId, { leaseMs = DEFAULT_LEASE_MS } = {}) {
    if (!workerId?.trim?.()) throw new TypeError("workerId is required");
    const now = this.clock();
    const candidate = this.state.jobs.find((job) => {
      if (job.status === "queued") return !job.availableAt || Date.parse(job.availableAt) <= now;
      return job.status === "running" && Date.parse(job.leaseExpiresAt || "") <= now;
    });
    if (!candidate) return null;

    candidate.status = "running";
    candidate.attemptCount = (candidate.attemptCount || 0) + 1;
    candidate.availableAt = null;
    candidate.workerId = workerId.trim();
    candidate.updatedAt = nowIso(now);
    candidate.leaseExpiresAt = nowIso(now + leaseMs);
    candidate.error = null;
    this.#save();
    return clone(candidate);
  }

  defer(jobId, workerId, { delayMs, reason } = {}) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return null;
    if (job.workerId !== workerId || job.status !== "running") {
      throw new Error("job is not leased by this worker");
    }
    if (!Number.isInteger(delayMs) || delayMs < 1_000 || delayMs > 60 * 60 * 1_000) {
      throw new TypeError("delayMs must be between one second and one hour");
    }
    const now = this.clock();
    job.status = "queued";
    job.workerId = null;
    job.leaseExpiresAt = null;
    job.availableAt = nowIso(now + delayMs);
    job.updatedAt = nowIso(now);
    job.error = String(reason || "temporarily_busy").slice(0, 200);
    this.#save();
    return clone(job);
  }

  complete(jobId, workerId, result) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return null;
    if (job.workerId !== workerId || job.status !== "running") {
      throw new Error("job is not leased by this worker");
    }
    const status = result?.status || "done";
    if (!TERMINAL_STATUSES.has(status)) throw new TypeError("invalid terminal status");

    job.status = status;
    job.threadId = result.threadId || job.threadId;
    job.threadName = result.threadName || job.threadName;
    job.response = result.response ?? null;
    job.error = result.error ?? null;
    job.updatedAt = nowIso(this.clock());
    job.leaseExpiresAt = null;
    this.#save();
    return clone(job);
  }

  markDelivered(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return null;
    if (!job.deliveredAt) {
      job.deliveredAt = nowIso(this.clock());
      job.updatedAt = job.deliveredAt;
      this.#save();
    }
    return clone(job);
  }

  // Claim *before* calling WhatsApp. A lost/ambiguous provider response must
  // never cause an automatic second group message.
  markDeliveryAttempted(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.deliveryAttemptedAt || job.groupReplySuppressedAt) return null;
    if (job.source !== ALI_GROUP_SOURCE || job.status !== "done") return null;
    job.deliveryAttemptedAt = nowIso(this.clock());
    job.updatedAt = job.deliveryAttemptedAt;
    this.#save();
    return clone(job);
  }

  markGroupReplySuppressed(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.source !== ALI_GROUP_SOURCE || job.status !== "done" ||
        job.deliveryAttemptedAt) return null;
    if (!job.groupReplySuppressedAt) {
      job.groupReplySuppressedAt = nowIso(this.clock());
      job.updatedAt = job.groupReplySuppressedAt;
      this.#save();
    }
    return clone(job);
  }

  heartbeat(workerId, threads, metadata = {}) {
    if (!workerId?.trim?.()) throw new TypeError("workerId is required");
    if (!Array.isArray(threads)) throw new TypeError("threads must be an array");
    const timestamp = nowIso(this.clock());
    this.state.workers[workerId.trim()] = {
      workerId: workerId.trim(),
      lastSeenAt: timestamp,
      version: metadata.version || null,
      host: metadata.host || null,
      threads: threads.map((thread) => ({
        id: String(thread.id),
        name: thread.name || null,
        preview: thread.preview || "",
        cwd: thread.cwd || null,
        updatedAt: thread.updatedAt || null,
        status: thread.status || null,
      })),
    };
    this.#save();
    return clone(this.state.workers[workerId.trim()]);
  }

  listThreads({ workerTtlMs = DEFAULT_WORKER_TTL_MS } = {}) {
    const cutoff = this.clock() - workerTtlMs;
    const byId = new Map();
    for (const worker of Object.values(this.state.workers)) {
      if (Date.parse(worker.lastSeenAt) < cutoff) continue;
      for (const thread of worker.threads || []) {
        const existing = byId.get(thread.id);
        if (!existing || Number(thread.updatedAt || 0) > Number(existing.updatedAt || 0)) {
          byId.set(thread.id, { ...thread, workerId: worker.workerId });
        }
      }
    }
    return [...byId.values()].sort(
      (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
    );
  }
}
