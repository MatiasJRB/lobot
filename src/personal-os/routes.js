import express from "express";

import {
  PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
  acceptsPersonalOsMessagingContract,
} from "./cron-schedule.js";

export function createPersonalOsCronRouter({ installCrons }) {
  if (typeof installCrons !== "function") {
    throw new Error("installCrons is required");
  }

  const router = express.Router();
  router.post("/install-personal-os", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!acceptsPersonalOsMessagingContract(payload)) {
        return res.status(400).json({
          ok: false,
          output:
            "Explicit messaging contract confirmation is required before installing Personal OS review crons.",
          messagingContractVersion: PERSONAL_OS_MESSAGING_CONTRACT_VERSION,
        });
      }
      const result = await installCrons({
        tz: payload.tz,
        timeoutSeconds: payload.timeoutSeconds,
        noOutputTimeoutSeconds: payload.noOutputTimeoutSeconds,
        outputMaxBytes: payload.outputMaxBytes,
      });
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        output: `Internal error: ${String(error)}`,
      });
    }
  });
  return router;
}
