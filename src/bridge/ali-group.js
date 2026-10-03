import crypto from "node:crypto";

export const ALI_GROUP_SOURCE = "ali-group-mention";
export const ALI_GROUP_REPLY_CHANNEL = "whatsapp-ali-group";
export const ALI_QA_CODEX_CONFIG = [
  'model = "gpt-6-sol"',
  'approval_policy = "never"',
  'sandbox_mode = "read-only"',
  'web_search = "disabled"',
  '',
  '[features]',
  'shell_tool = false',
  'unified_exec = false',
  'apps = false',
  'multi_agent = false',
  'remote_plugin = false',
  'hooks = false',
  '',
].join("\n");

const MENTION = /(?:^|[\s([{"'])@lobot\b/i;
const GROUP_JID = /^\d{10,25}@g\.us$/;
const MAX_AGE_MS = 15 * 60_000;
const SENSITIVE = [
  /\b(?:APP_USR|TEST)-[a-z0-9_-]{10,}\b/gi,
  /\bBearer\s+[a-z0-9._~+/-]{12,}\b/gi,
  /\b[A-Z_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*\S+/gi,
  /\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{20,}(?:\.[a-z0-9_-]*)?\b/gi,
  /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g,
  /\b(?:CVV|CVC|c[oó]digo de seguridad)\s*[:=]?\s*\d{3,4}\b/gi,
  /\bDNI\s*[:=]?\s*\d{7,8}\b/gi,
];

export function sanitizeAliGroupText(value, maxLength) {
  if (typeof value !== "string") return "";
  let text = value.slice(0, maxLength);
  for (const pattern of SENSITIVE) text = text.replace(pattern, "[dato reservado]");
  return text;
}

function boundedId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    /^[a-zA-Z0-9+@._:-]+$/.test(value);
}

export function buildAliGroupJobInput(raw, { groupJid, now = Date.now() } = {}) {
  if (!GROUP_JID.test(groupJid || "")) throw new TypeError("ALI group is not configured");
  if (!raw || typeof raw !== "object" || raw.accountId !== "default" ||
      raw.conversationId !== groupJid || !boundedId(raw.messageId) ||
      !boundedId(raw.senderId) || typeof raw.body !== "string" ||
      raw.body.length > 1500 || !MENTION.test(raw.body)) {
    throw new TypeError("invalid ALI group mention");
  }
  const timestamp = Number(raw.timestamp);
  const timeMs = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timeMs) || timeMs < now - MAX_AGE_MS || timeMs > now + 2 * 60_000) {
    throw new TypeError("stale ALI group mention");
  }
  const digest = crypto.createHash("sha256")
    .update([raw.accountId, groupJid, raw.messageId].join("\0")).digest("hex");
  const prompt = JSON.stringify({
    body: sanitizeAliGroupText(raw.body.trim(), 1500),
    context: sanitizeAliGroupText(raw.context, 2500),
    replyToBody: sanitizeAliGroupText(raw.replyToBody, 800),
    receivedAt: new Date(timeMs).toISOString(),
  });
  return {
    source: ALI_GROUP_SOURCE,
    thread: "ali-group-dedicated",
    mode: "read-only",
    prompt,
    idempotencyKey: `ali-group:${digest}`,
    reply: {
      channel: ALI_GROUP_REPLY_CHANNEL,
      conversationId: groupJid,
      sourceMessageId: raw.messageId,
    },
  };
}

export function validateAliGroupAnswer(value) {
  const answer = typeof value === "string" ? value.trim() : "";
  if (!answer || answer.length > 3500) throw new TypeError("invalid ALI group answer length");
  if (SENSITIVE.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(answer);
  })) throw new TypeError("ALI group answer contains sensitive data");
  for (const match of answer.matchAll(/https?:\/\/[^\s)\]>]+/gi)) {
    const url = new URL(match[0].replace(/[.,;]$/, ""));
    if (url.protocol !== "https:" ||
        !(url.hostname === "www.mercadopago.com.ar" &&
          url.pathname.startsWith("/developers/")) &&
        !(url.hostname === "github.com" &&
          url.pathname.startsWith("/MatiasJRB/asiento-libre/issues/"))) {
      throw new TypeError("ALI group answer contains an unapproved URL");
    }
  }
  return answer;
}
