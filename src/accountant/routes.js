import express from "express";

import {
  ACCOUNTANT_MESSAGING_CONTRACT_VERSION,
  acceptsAccountantMessagingContract,
} from "./cron-schedule.js";

export function createAccountantCronRouter({ installCrons }) {
  if (typeof installCrons !== "function") {
    throw new Error("installCrons is required");
  }

  const router = express.Router();
  router.post("/install-accountant", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!acceptsAccountantMessagingContract(payload)) {
        return res.status(400).json({
          ok: false,
          output:
            "Explicit messaging contract confirmation is required before installing accountant crons.",
          messagingContractVersion: ACCOUNTANT_MESSAGING_CONTRACT_VERSION,
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

