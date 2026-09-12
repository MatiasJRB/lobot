const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const MAX_MESSAGE_LENGTH = 4000;

export function normalizeExactWhatsAppRequest(raw = {}) {
  const target = typeof raw.target === "string" ? raw.target : "";
  const message = typeof raw.message === "string" ? raw.message : "";
  if (!E164_PATTERN.test(target)) throw new Error("target must be E.164");
  if (!message.trim()) throw new Error("message is required");
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error("message is too long");

  const timeoutSeconds = raw.timeoutSeconds ?? 90;
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 30 ||
    timeoutSeconds > 180
  ) {
    throw new Error("timeoutSeconds must be an integer between 30 and 180");
  }

  return {
    target,
    message,
    dryRun: Boolean(raw.dryRun),
    timeoutSeconds,
  };
}

export function buildExactWhatsAppCommand(request) {
  const args = [
    "message",
    "send",
    "--channel",
    "whatsapp",
    "--account",
    "default",
    "--target",
    request.target,
    "--message",
    request.message,
    "--json",
  ];
  if (request.dryRun) args.push("--dry-run");
  return args;
}

function messageIdFrom(raw) {
  return (
    raw?.messageId ||
    raw?.payload?.result?.messageId ||
    raw?.result?.messageId ||
    null
  );
}

export function projectExactWhatsAppDelivery(delivery = {}, request = {}) {
  const raw = delivery.raw && typeof delivery.raw === "object" ? delivery.raw : null;
  const messageId = messageIdFrom(raw);
  const rawLooksOk =
    raw?.status === "ok" ||
    raw?.ok === true ||
    (raw?.action === "send" && raw?.dryRun === true) ||
    (raw?.action === "send" && Boolean(messageId)) ||
    raw?.result?.status === "ok" ||
    raw?.result?.ok === true ||
    raw?.result?.delivered === true ||
    Boolean(raw?.payload?.result?.messageId);
  const response = {
    ok: delivery.code === 0 && rawLooksOk,
    status: raw?.status || raw?.result?.status || null,
    channel: "whatsapp",
    dryRun: Boolean(request.dryRun),
    target: { type: "provided-target" },
  };
  if (messageId) response.messageId = String(messageId);
  if (!response.ok) response.error = "delivery_failed";
  return response;
}
