import assert from "node:assert/strict";
import test from "node:test";
import { aliGroupConfigUpdates, aliGroupDeliveryMessage } from "./ali-group-runtime.js";

const groupJid = "123456789012@g.us";
const current = { plugins: { entries: { "personal-os-events": { enabled: true } } },
  channels: { whatsapp: { groupPolicy: "disabled", groupAllowFrom: ["+5491112345678"],
    groups: { [groupJid]: { requireMention: true } }, accounts: { default: {
      groupPolicy: "disabled", groupAllowFrom: ["+5491112345678"],
      groups: { [groupJid]: { requireMention: true } },
    } } } }, messages: { groupChat: { mentionPatterns: [] } } };

test("ALI group admission changes only the exact allowlisted group, mention and policies", () => {
  const updates = Object.fromEntries(aliGroupConfigUpdates(current, { groupJid, enabled: true }));
  assert.equal(updates["channels.whatsapp.groupPolicy"], "allowlist");
  assert.equal(updates["channels.whatsapp.accounts.default.groupPolicy"], "allowlist");
  assert.deepEqual(updates["messages.groupChat.mentionPatterns"], [String.raw`@lobot\b`]);
  assert.deepEqual(updates["channels.whatsapp.accounts.default.mentionPatterns"],
    { mode: "deny", allowIn: [groupJid] });
  assert.deepEqual(aliGroupConfigUpdates(current, { groupJid, enabled: false }), [
    ["channels.whatsapp.accounts.default.groupPolicy", "disabled"],
    ["channels.whatsapp.groupPolicy", "disabled"],
  ]);
});

test("ALI group admission fails closed for extra groups, wildcard sender or missing hook", () => {
  assert.throws(() => aliGroupConfigUpdates({ ...current, channels: { whatsapp: {
    ...current.channels.whatsapp, groups: { ...current.channels.whatsapp.groups,
      "*": { requireMention: false } },
  } } }, { groupJid, enabled: true }), /only the exact/);
  assert.throws(() => aliGroupConfigUpdates({ ...current, channels: { whatsapp: {
    ...current.channels.whatsapp, groupAllowFrom: ["*"],
  } } }, { groupJid, enabled: true }), /unsafe/);
  assert.throws(() => aliGroupConfigUpdates({ ...current, plugins: {} },
    { groupJid, enabled: true }), /hook/);
});

test("ALI group message has fixed heading, fixed target and secret guard", () => {
  const job = { source: "ali-group-mention", status: "done", response: "Usá tarjeta TEST.",
    reply: { channel: "whatsapp-ali-group", conversationId: groupJid } };
  assert.equal(aliGroupDeliveryMessage(job, { groupJid, replyEnabled: true }),
    "🤖 Ali:\n\nUsá tarjeta TEST.");
  assert.equal(aliGroupDeliveryMessage({ ...job, response: "🤖 Ali:\n\nUsá tarjeta TEST." },
    { groupJid, replyEnabled: true }), "🤖 Ali:\n\nUsá tarjeta TEST.");
  assert.throws(() => aliGroupDeliveryMessage(job, { groupJid, replyEnabled: false }), TypeError);
  assert.throws(() => aliGroupDeliveryMessage({ ...job, reply: { ...job.reply,
    conversationId: "000000000000@g.us" } }, { groupJid, replyEnabled: true }), TypeError);
  assert.throws(() => aliGroupDeliveryMessage({ ...job,
    response: "Bearer abcdefghijklmnop" }, { groupJid, replyEnabled: true }), TypeError);
});
