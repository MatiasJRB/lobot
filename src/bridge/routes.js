import crypto from "node:crypto";
import express from "express";
import { DEFAULT_OPENCLAW_EVENT_OUTBOX, readOpenclawEventPage } from "../personal-os/openclaw-event-outbox.js";
import { DEFAULT_NOTICE_OUTBOX, appendNotice, readNoticePage } from "./notice-outbox.js";
import { ALI_GROUP_SOURCE, ALI_GROUP_REPLY_CHANNEL, buildAliGroupJobInput,
  validateAliGroupAnswer } from "./ali-group.js";

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual || "");
  const expectedBuffer = Buffer.from(expected || "");
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

const COMMITMENT_REQUIRED = ["card_id", "title", "domain", "outcome", "status",
  "priority", "owner", "current_state", "next_action", "next_check_at",
  "closure_condition", "source_ref", "material_kind", "progress_state",
  "deadline_at", "identities"];

function validZonedDate(value) {
  return typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

export function validateCommitmentIntake(body) {
  if (!body || typeof body !== "object" || !body.commitment ||
      typeof body.commitment !== "object") return "commitment is required";
  if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim() ||
      body.idempotencyKey.length > 300) return "idempotencyKey is required (<=300 characters)";
  const commitment = body.commitment;
  for (const field of COMMITMENT_REQUIRED) {
    if (field === "identities") continue;
    if (typeof commitment[field] !== "string" || !commitment[field].trim()) {
      return `${field} is required`;
    }
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,199}$/.test(commitment.card_id)) return "invalid card_id";
  if (!validZonedDate(commitment.next_check_at) || !validZonedDate(commitment.deadline_at)) {
    return "next_check_at and deadline_at must be zoned ISO-8601 datetimes";
  }
  if (!Array.isArray(commitment.identities) || !commitment.identities.length ||
      commitment.identities.length > 10 || commitment.identities.some((value) =>
        typeof value !== "string" || value.length > 500 || !value.includes(":"))) {
    return "identities must contain 1-10 TYPE:VALUE strings";
  }
  if (Buffer.byteLength(JSON.stringify(commitment)) > 20_000) return "commitment is too large";
  return null;
}

export function bearerAuth(token) {
  return function requireBridgeAuth(req, res, next) {
    if (!token) {
      return res.status(503).json({ ok: false, error: "Codex bridge is not configured" });
    }
    const authorization = req.headers.authorization || "";
    const [scheme, candidate] = authorization.split(" ");
    if (scheme !== "Bearer" || !secureEqual(candidate, token)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return next();
  };
}

export function createBridgeRouter({ store, token, deliverJob = null,
  openclawEventOutbox = DEFAULT_OPENCLAW_EVENT_OUTBOX,
  noticeOutbox = DEFAULT_NOTICE_OUTBOX, noticeWriteToken = "",
  aliGroupJid = "", aliGroupIntakeEnabled = false,
  aliGroupReplyEnabled = false }) {
  const router = express.Router();
  // Producer credential is write-only: it cannot inspect cards, events, jobs or threads.
  router.post("/personal-os/notices", bearerAuth(noticeWriteToken), (req, res) => {
    try {
      const result = appendNotice(noticeOutbox, req.body);
      res.set("Cache-Control", "no-store");
      return res.status(result.created ? 202 : 200).json({ ok: true, id: result.notice.id,
        created: result.created });
    } catch (error) {
      return res.status(error instanceof TypeError ? 400 : 503)
        .json({ ok: false, error: error instanceof TypeError ? error.message : "Notice outbox unavailable" });
    }
  });
  router.post("/personal-os/commitments", bearerAuth(noticeWriteToken), (req, res) => {
    const error = validateCommitmentIntake(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    try {
      const result = store.enqueue({
        prompt: JSON.stringify(req.body.commitment),
        thread: "recent",
        mode: "workspace-write",
        idempotencyKey: `commitment-ingest:${req.body.idempotencyKey.trim()}`,
        source: "personal-os-commitment-capture",
      });
      return res.status(result.created ? 202 : 200).json({ ok: true,
        jobId: result.job.id, created: result.created });
    } catch (queueError) {
      return res.status(400).json({ ok: false, error: queueError.message });
    }
  });
  router.use(bearerAuth(token));

  router.post("/ali-group/mentions", (req, res) => {
    if (!aliGroupIntakeEnabled) return res.status(503).json({ ok: false,
      error: "ALI group intake is disabled" });
    try {
      const input = buildAliGroupJobInput(req.body, { groupJid: aliGroupJid });
      if (store.countRecentSource(ALI_GROUP_SOURCE, Date.now() - 60 * 60_000) >= 12 &&
          !store.hasIdempotencyKey(input.idempotencyKey)) {
        return res.status(429).json({ ok: false, error: "ALI group hourly limit reached" });
      }
      const result = store.enqueue(input, { trustedAliGroup: true });
      res.set("Cache-Control", "no-store");
      return res.status(result.created ? 202 : 200).json({ ok: true,
        jobId: result.job.id, created: result.created });
    } catch (error) {
      return res.status(error instanceof TypeError ? 400 : 503)
        .json({ ok: false, error: "Invalid ALI group mention" });
    }
  });

  router.get("/personal-os/notices", (req, res) => {
    try {
      const cursor = Number(req.query.cursor ?? 0);
      const limit = Number(req.query.limit ?? 50);
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, ...readNoticePage(noticeOutbox, { cursor, limit }) });
    } catch (error) {
      return res.status(error instanceof TypeError ? 400 : 503)
        .json({ ok: false, error: error instanceof TypeError ? error.message : "Notice outbox unavailable" });
    }
  });

  router.get("/personal-os/events", (req, res) => {
    try {
      const cursor = Number(req.query.cursor ?? 0);
      const limit = Number(req.query.limit ?? 50);
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, ...readOpenclawEventPage(openclawEventOutbox, { cursor, limit }) });
    } catch (error) {
      return res.status(error instanceof TypeError ? 400 : 503)
        .json({ ok: false, error: error instanceof TypeError ? error.message : "Private event outbox unavailable" });
    }
  });

  router.post("/jobs", (req, res) => {
    try {
      const result = store.enqueue(req.body || {});
      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  router.get("/jobs", (req, res) => {
    const limit = Number.parseInt(req.query.limit || "50", 10);
    return res.json({
      ok: true,
      jobs: store.listJobs({ status: req.query.status || undefined, limit }),
    });
  });

  router.get("/jobs/:jobId", (req, res) => {
    const job = store.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    return res.json({ ok: true, job });
  });

  router.post("/jobs/claim", (req, res) => {
    try {
      const job = store.claim(req.body?.workerId, { leaseMs: req.body?.leaseMs });
      return res.json({ ok: true, job });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  router.post("/jobs/:jobId/complete", async (req, res) => {
    try {
      let job = store.complete(req.params.jobId, req.body?.workerId, req.body || {});
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      const delivery = await attemptDelivery(job, store, deliverJob,
        { aliGroupJid, aliGroupReplyEnabled });
      if (delivery.ok) job = store.getJob(job.id);
      return res.json({ ok: true, job, delivery });
    } catch (error) {
      const status = error instanceof TypeError ? 400 : 409;
      return res.status(status).json({ ok: false, error: error.message });
    }
  });

  router.post("/jobs/:jobId/defer", (req, res) => {
    try {
      const job = store.defer(req.params.jobId, req.body?.workerId, {
        delayMs: req.body?.delayMs,
        reason: req.body?.reason,
      });
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      return res.json({ ok: true, job });
    } catch (error) {
      const status = error instanceof TypeError ? 400 : 409;
      return res.status(status).json({ ok: false, error: error.message });
    }
  });

  router.post("/jobs/:jobId/deliver", async (req, res) => {
    const job = store.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
    const delivery = await attemptDelivery(job, store, deliverJob,
      { aliGroupJid, aliGroupReplyEnabled });
    return res.status(delivery.ok ? 200 : 502).json({
      ok: delivery.ok,
      job: store.getJob(job.id),
      delivery,
    });
  });

  router.post("/workers/heartbeat", (req, res) => {
    try {
      const worker = store.heartbeat(req.body?.workerId, req.body?.threads, {
        version: req.body?.version,
        host: req.body?.host,
      });
      return res.json({ ok: true, worker });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  router.get("/threads", (_req, res) => {
    return res.json({ ok: true, threads: store.listThreads() });
  });

  return router;
}

async function attemptDelivery(job, store, deliverJob, { aliGroupJid,
  aliGroupReplyEnabled } = {}) {
  if (!job.reply || job.deliveredAt) {
    return { ok: true, attempted: false, reason: job.deliveredAt ? "already-delivered" : "not-requested" };
  }
  if (job.source === ALI_GROUP_SOURCE || job.reply?.channel === ALI_GROUP_REPLY_CHANNEL) {
    if (job.source !== ALI_GROUP_SOURCE || job.reply?.channel !== ALI_GROUP_REPLY_CHANNEL ||
        job.reply.conversationId !== aliGroupJid) {
      return { ok: false, attempted: false, error: "ALI group target mismatch" };
    }
    if (job.status !== "done") return { ok: false, attempted: false, error: "ALI group job not done" };
    if (job.groupReplySuppressedAt) return { ok: true, attempted: false,
      reason: "group-reply-suppressed" };
    if (!aliGroupReplyEnabled) {
      store.markGroupReplySuppressed(job.id);
      return { ok: true, attempted: false, reason: "group-replies-disabled" };
    }
    if (Date.now() - Date.parse(job.createdAt) > 30 * 60_000) {
      store.markGroupReplySuppressed(job.id);
      return { ok: true, attempted: false, reason: "stale-group-reply-suppressed" };
    }
    try { validateAliGroupAnswer(job.response); }
    catch { return { ok: false, attempted: false, error: "ALI group answer rejected" }; }
    if (!deliverJob) return { ok: false, attempted: false, error: "Delivery is not configured" };
    const claimed = store.markDeliveryAttempted(job.id);
    if (!claimed) return { ok: false, attempted: false, error: "ALI group delivery already attempted" };
    try {
      await deliverJob(claimed);
      store.markDelivered(job.id);
      return { ok: true, attempted: true };
    } catch {
      return { ok: false, attempted: true, error: "ALI group delivery failed; manual review required" };
    }
  }
  if (
    job.reply.policy === "actionable-only" &&
    !job.error &&
    job.response?.trim() === "DONT_NOTIFY"
  ) {
    store.markDelivered(job.id);
    return { ok: true, attempted: false, reason: "suppressed-not-actionable" };
  }
  if (!deliverJob) return { ok: false, attempted: false, error: "Delivery is not configured" };
  if (!job.response && !job.error) {
    return { ok: false, attempted: false, error: "Job has no result to deliver" };
  }
  try {
    await deliverJob(job);
    store.markDelivered(job.id);
    return { ok: true, attempted: true };
  } catch (error) {
    return { ok: false, attempted: true, error: error.message };
  }
}
