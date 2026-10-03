import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configureAliObservation } from "../../scripts/ali-intake-observation.mjs";

test("native observation changes only existing ALI activation and rollback preserves other metadata", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "ali-observe-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const groupJid = "123456789012@g.us";
  const key = `agent:main:whatsapp:group:${groupJid}`;
  const entries = { [key]: { sessionId: "existing", updatedAt: 42, unrelated: "preserved" }, personal: { private: "untouched" } };
  const sdk = { resolveStorePath: () => "/store", getSessionEntry: ({ sessionKey }) => entries[sessionKey],
    async patchSessionEntry({ sessionKey, update }) { entries[sessionKey] = update(entries[sessionKey]); } };
  const surface = { groupPolicy: "allowlist", groupAllowFrom: ["+5491112345678"], groups: { [groupJid]: { requireMention: true } } };
  const config = { channels: { whatsapp: { ...surface, accounts: { default: structuredClone(surface) } } },
    plugins: { entries: { "personal-os-events": { enabled: true } } } };
  const options = { sdk, config, stateDir, groupJid,
    pluginSource: "Always claim this exact group; api.on('before_dispatch'; api.on('message_sending'" };
  await configureAliObservation({ ...options, mode: "enable" });
  assert.equal(entries[key].groupActivation, "always");
  assert.equal(entries[key].updatedAt, 42); assert.equal(entries.personal.private, "untouched");
  await configureAliObservation({ ...options, mode: "disable" });
  assert.equal(entries[key].groupActivation, undefined);
  assert.equal(entries[key].unrelated, "preserved");
  await assert.rejects(() => configureAliObservation({ ...options,
    config: { ...config, channels: { whatsapp: { ...config.channels.whatsapp, groupAllowFrom: ["*"] } } }, mode: "enable" }), /unsafe/);
});
