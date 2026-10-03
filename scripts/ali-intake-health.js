#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AliIntakeState } from "../src/bridge/ali-intake-state.js";

try {
  const envFile = path.join(os.homedir(), ".config/secretario-personal/codex-bridge.env");
  const stat = fs.lstatSync(envFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("unsafe env");
  const env = {};
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^(?:export\s+)?(ALI_INTAKE_[A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  if (env.ALI_INTAKE_ENABLED !== "true") {
    console.log(JSON.stringify({ enabled: false }));
  } else {
    const filename = env.ALI_INTAKE_STATE_FILE || path.join(os.homedir(), ".config/secretario-personal/ali-intake/state.json");
    if (!fs.existsSync(filename)) throw new Error("missing state");
    const journal = new AliIntakeState(filename, { groupJid: env.ALI_INTAKE_GROUP_JID,
      senders: JSON.parse(env.ALI_INTAKE_SENDERS_JSON) });
    console.log(JSON.stringify({ enabled: true, ...journal.health() }));
  }
} catch {
  console.log(JSON.stringify({ enabled: null, error: "private_intake_state_unavailable" }));
  process.exitCode = 1;
}
