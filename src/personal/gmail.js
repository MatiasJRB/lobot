import { boolFromEnv, envValue, intFromEnv } from "./env.js";
import { googleApiGet, googleCredentialsStatus } from "./google.js";
import { safeErrorMessage } from "./http.js";

const IMPORTANT_PATTERNS = [
  /security|seguridad|suspicious|sospech|unauthorized|no autorizado|new sign.?in|nuevo inicio|password|contraseñ|2fa|two.?factor|verification|verificaci[oó]n/i,
  /payment failed|pago rechazado|cobro fall|overdue|vencid|vencimiento|due|factura|invoice|receipt|recibo|renewal|renovaci[oó]n|subscription|suscripci[oó]n|tarjeta|bank|banco|mercado pago|afip|impuesto/i,
  /action required|requires action|requiere acci[oó]n|urgente|important|importante|confirm|confirmar|verify|verificar/i,
];

const SECURITY_PATTERNS = /security|seguridad|suspicious|sospech|unauthorized|no autorizado|new sign.?in|nuevo inicio|password|contraseñ|2fa|two.?factor|verification|verificaci[oó]n|recovery|recuperaci[oó]n/i;
const MONEY_PATTERNS = /payment failed|pago rechazado|cobro fall|overdue|vencid|vencimiento|due|factura|invoice|receipt|recibo|renewal|renovaci[oó]n|subscription|suscripci[oó]n|tarjeta|bank|banco|mercado pago|afip|impuesto|billing|cuenta/i;
const NEEDS_REPLY_PATTERNS = /respond|reply|respuesta|confirmar|confirm|revisar|review|action required|requires action|requiere acci[oó]n|can you|pod[eé]s|podr[ií]as|\?/i;
const NOREPLY_PATTERNS = /no-?reply|noreply|notifications?|notificaciones|mailer|donotreply/i;

function header(headers, name) {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

function classifyMessage(message) {
  const haystack = `${message.subject}\n${message.from}\n${message.snippet}`;
  const labels = [];
  if (SECURITY_PATTERNS.test(haystack)) labels.push("seguridad/cuenta");
  if (MONEY_PATTERNS.test(haystack)) labels.push("plata/pago/vencimiento");
  const humanSender = message.from && !NOREPLY_PATTERNS.test(message.from);
  if (humanSender && NEEDS_REPLY_PATTERNS.test(haystack)) labels.push("posible respuesta");

  if (labels.includes("seguridad/cuenta")) return { priority: "P0", labels };
  if (labels.includes("plata/pago/vencimiento")) return { priority: "P1", labels };
  if (labels.includes("posible respuesta")) return { priority: "P2", labels };
  if (IMPORTANT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { priority: "P2", labels: ["importante"] };
  }
  return { priority: "P3", labels };
}

function normalizeMessage(payload) {
  const headers = payload.payload?.headers || [];
  const internalDate = payload.internalDate
    ? new Date(Number(payload.internalDate)).toISOString()
    : header(headers, "Date");
  const normalized = {
    id: payload.id,
    threadId: payload.threadId,
    subject: header(headers, "Subject") || "(sin asunto)",
    from: header(headers, "From"),
    to: header(headers, "To"),
    date: internalDate,
    snippet: payload.snippet || "",
    labelIds: payload.labelIds || [],
    url: payload.id ? `https://mail.google.com/mail/u/0/#inbox/${payload.id}` : undefined,
  };
  const classification = classifyMessage(normalized);
  return { ...normalized, ...classification };
}

export async function collectGmail({ window }) {
  const source = {
    name: "gmail",
    enabled: boolFromEnv("GMAIL_ENABLED", true),
    configured: googleCredentialsStatus("gmail").configured,
    status: "disabled",
    items: [],
    signals: [],
    warnings: [],
  };

  if (!source.enabled) return source;
  if (!source.configured) {
    source.status = "missing_credentials";
    source.warnings.push(
      "Faltan credenciales Google OAuth para Gmail/Calendar (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN).",
    );
    return source;
  }

  const maxResults = intFromEnv("GMAIL_MAX_RESULTS", 20, { min: 1, max: 50 });
  const query = envValue(
    "GMAIL_QUERY",
    "in:inbox newer_than:7d -category:promotions -category:social -category:forums",
  );
  const sinceMs = Date.parse(window.since);

  try {
    const list = await googleApiGet("https://gmail.googleapis.com/gmail/v1/users/me/messages", {
      q: query,
      maxResults,
      includeSpamTrash: false,
    }, { service: "gmail" });

    const messageRefs = list?.messages || [];
    const messages = [];
    for (const ref of messageRefs.slice(0, maxResults)) {
      const data = await googleApiGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}`,
        {
          format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date", "Reply-To"],
        },
        { service: "gmail" },
      );
      const normalized = normalizeMessage(data);
      if (Number.isFinite(sinceMs) && Date.parse(normalized.date) < sinceMs) continue;
      messages.push(normalized);
    }

    source.items = messages;
    source.signals = messages
      .filter((message) => ["P0", "P1", "P2"].includes(message.priority))
      .map((message) => ({
        source: "Gmail",
        priority: message.priority,
        title: message.subject,
        summary: `${message.from || "remitente desconocido"}${message.labels.length ? ` — ${message.labels.join(", ")}` : ""}`,
        when: message.date,
        url: message.url,
        action: message.priority === "P0" ? "Revisar ya" : "Revisar en el próximo bloque personal",
      }));
    source.status = "ok";
    return source;
  } catch (err) {
    source.status = "error";
    source.warnings.push(`Gmail API falló: ${safeErrorMessage(err)}`);
    return source;
  }
}
