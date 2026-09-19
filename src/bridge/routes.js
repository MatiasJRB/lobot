import crypto from "node:crypto";
import express from "express";
import { DEFAULT_OPENCLAW_EVENT_OUTBOX, readOpenclawEventPage } from "../personal-os/openclaw-event-outbox.js";
import { DEFAULT_NOTICE_OUTBOX, appendNotice, readNoticePage } from "./notice-outbox.js";

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual || "");
  const expectedBuffer = Buffer.from(expected || "");
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
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
  noticeOutbox = DEFAULT_NOTICE_OUTBOX, noticeWriteToken = "" }) {
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
  router.use(bearerAuth(token));

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
      const delivery = await attemptDelivery(job, store, deliverJob);
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
    const delivery = await attemptDelivery(job, store, deliverJob);
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

async function attemptDelivery(job, store, deliverJob) {
  if (!job.reply || job.deliveredAt) {
    return { ok: true, attempted: false, reason: job.deliveredAt ? "already-delivered" : "not-requested" };
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
