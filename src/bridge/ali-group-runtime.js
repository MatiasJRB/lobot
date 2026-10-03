import { validateAliGroupAnswer } from "./ali-group.js";

const GROUP_JID = /^\d{10,25}@g\.us$/;
const MENTION_PATTERN = String.raw`@lobot\b`;

export function aliGroupConfigUpdates(current, { groupJid, enabled } = {}) {
  if (!GROUP_JID.test(groupJid || "")) throw new TypeError("ALI group JID is invalid");
  if (!enabled) return [
    ["channels.whatsapp.accounts.default.groupPolicy", "disabled"],
    ["channels.whatsapp.groupPolicy", "disabled"],
  ];
  const whatsapp = current?.channels?.whatsapp;
  const account = whatsapp?.accounts?.default;
  if (current?.plugins?.entries?.["personal-os-events"]?.enabled !== true ||
      !whatsapp || !account) throw new Error("ALI group hook is not configured");
  for (const groups of [whatsapp.groups, account.groups]) {
    if (!groups || Object.keys(groups).length !== 1 || !groups[groupJid] ||
        groups[groupJid].requireMention !== true) {
      throw new Error("ALI group allowlist must contain only the exact mention-gated group");
    }
  }
  const allowedSenders = account.groupAllowFrom?.length
    ? account.groupAllowFrom : whatsapp.groupAllowFrom;
  if (!Array.isArray(allowedSenders) || !allowedSenders.length ||
      allowedSenders.includes("*") ||
      (whatsapp.groupAllowFrom || []).includes("*")) {
    throw new Error("ALI group sender allowlist is unsafe");
  }
  const patterns = current?.messages?.groupChat?.mentionPatterns || [];
  if (!Array.isArray(patterns)) throw new Error("Group mention patterns are invalid");
  return [
    ["messages.groupChat.mentionPatterns", [...new Set([...patterns, MENTION_PATTERN])]],
    ["channels.whatsapp.mentionPatterns", { mode: "deny", allowIn: [groupJid] }],
    ["channels.whatsapp.accounts.default.mentionPatterns", { mode: "deny", allowIn: [groupJid] }],
    ["channels.whatsapp.groupPolicy", "allowlist"],
    ["channels.whatsapp.accounts.default.groupPolicy", "allowlist"],
  ];
}

export function aliGroupDeliveryMessage(job, { groupJid, replyEnabled } = {}) {
  if (!replyEnabled || !GROUP_JID.test(groupJid || "") ||
      job?.source !== "ali-group-mention" ||
      job?.reply?.channel !== "whatsapp-ali-group" ||
      job.reply.conversationId !== groupJid || job.status !== "done") {
    throw new TypeError("ALI group delivery is disabled or target is invalid");
  }
  const answer = validateAliGroupAnswer(job.response).replace(/^(?:🤖 Ali:\s*)+/u, "");
  return `🤖 Ali:\n\n${validateAliGroupAnswer(answer)}`;
}
