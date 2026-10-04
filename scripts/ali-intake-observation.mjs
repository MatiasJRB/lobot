#!/usr/bin/env node
// Run on the existing Lobot host as the gateway owner, never against another service.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function configureAliObservation({ sdk, config, stateDir, groupJid,
  mode = "inspect", pluginSource, clock = Date.now }) {
  if (!["inspect", "enable", "disable"].includes(mode) ||
      !/^\d{10,25}@g\.us$/.test(groupJid || "")) throw new Error("invalid observation scope");
  const whatsapp = config.channels?.whatsapp;
  const account = whatsapp?.accounts?.default;
  for (const surface of [whatsapp, account]) {
    if (surface?.groupPolicy !== "allowlist" || Object.keys(surface.groups || {}).length !== 1 ||
        surface.groups[groupJid]?.requireMention !== true || !surface.groupAllowFrom?.length ||
        surface.groupAllowFrom.includes("*")) throw new Error("ALI native allowlist unsafe");
  }
  if (config.plugins?.entries?.["personal-os-events"]?.enabled !== true ||
      !pluginSource.includes("Always claim this exact group") ||
      !pluginSource.includes("api.on('before_dispatch'") ||
      !pluginSource.includes("api.on('message_sending'")) throw new Error("ALI bridge guards unavailable");
  const scope = { storePath: sdk.resolveStorePath(config.session?.store, { agentId: "main" }), agentId: "main" };
  const keys = [`agent:main:whatsapp:group:${groupJid}`, `agent:main:whatsapp:default:group:${groupJid}`];
  const existing = keys.map((sessionKey) => ({ sessionKey, entry: sdk.getSessionEntry({ ...scope, sessionKey }) }));
  if (!existing.some(({ entry }) => typeof entry?.sessionId === "string")) throw new Error("ALI existing session unavailable");
  const dir = path.join(stateDir, "ali-intake");
  const backupFile = path.join(dir, "native-observation.json");
  const groupHash = crypto.createHash("sha256").update(groupJid).digest("hex");
  let backup = null;
  if (fs.existsSync(backupFile)) {
    const st = fs.lstatSync(backupFile);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077)) throw new Error("observation backup unsafe");
    backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    if (backup.groupHash !== groupHash) throw new Error("observation backup scope mismatch");
  }
  if (mode === "enable" && !backup) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077)) throw new Error("observation directory unsafe");
    backup = { groupHash, createdAt: clock(), previous: existing.map(({ sessionKey, entry }) =>
      ({ sessionKey, activation: entry?.groupActivation ?? null })) };
    const fd = fs.openSync(backupFile, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(backup)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  if (mode === "disable" && !backup) throw new Error("observation rollback unavailable");
  if (mode !== "inspect") for (const { sessionKey, entry } of existing) {
    if (!entry) continue;
    // Native SDK patches one metadata field transactionally. No whole-store JSON rewriting.
    await sdk.patchSessionEntry({ ...scope, sessionKey, replaceEntry: true, update: (current) => {
      const updated = { ...current };
      if (mode === "enable") updated.groupActivation = "always";
      else {
        const previous = backup.previous.find((p) => p.sessionKey === sessionKey)?.activation;
        if (previous) updated.groupActivation = previous;
        else delete updated.groupActivation;
      }
      return updated;
    } });
  }
  const entries = keys.map((sessionKey) => sdk.getSessionEntry({ ...scope, sessionKey })).filter(Boolean);
  const result = { mode, exactGroup: true, senderCount: account.groupAllowFrom.length,
    sessionCount: entries.length, activation: entries.map((e) => e.groupActivation ?? "mention-default") };
  if (mode === "enable" && entries.some((e) => e.groupActivation !== "always")) throw new Error("observation readback failed");
  return result;
}

async function main() {
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  if (stateDir !== "/data/.openclaw" || process.env.ALI_GROUP_MENTIONS_ENABLED !== "true") throw new Error("not the active Lobot ALI host");
  const require = createRequire("/usr/local/lib/node_modules/openclaw/package.json");
  const sdk = await import(require.resolve("openclaw/plugin-sdk/session-store-runtime"));
  const config = JSON.parse(fs.readFileSync(path.join(stateDir, "openclaw.json"), "utf8"));
  const mode = process.argv.includes("--enable") ? "enable" : process.argv.includes("--disable") ? "disable" : "inspect";
  const result = await configureAliObservation({ sdk, config, stateDir, groupJid: process.env.ALI_GROUP_JID, mode,
    pluginSource: fs.readFileSync("/app/src/personal-os/openclaw-events-plugin/index.cjs", "utf8") });
  console.log(JSON.stringify(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch(() => {
  console.log(JSON.stringify({ error: "ali_native_observation_failed" })); process.exitCode = 1;
});
