import { collectCalendar } from "./calendar.js";
import { collectGitHub } from "./github.js";
import { collectGmail } from "./gmail.js";
import { boolFromEnv, envValue, firstEnv, intFromEnv, normalizeModelName } from "./env.js";
import { googleCredentialsStatus } from "./google.js";
import { fetchJson, safeErrorMessage } from "./http.js";
import { digestWindow, formatDateOnly, formatWhen } from "./time.js";

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

function dedupeSignals(signals) {
  const seen = new Set();
  const deduped = [];
  for (const signal of signals) {
    const key = [
      signal.source || "",
      signal.url || "",
      signal.title || "",
      signal.when || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(signal);
  }
  return deduped;
}

export function getPersonalSourceStatus() {
  const gmailGoogle = googleCredentialsStatus("gmail");
  const calendarGoogle = googleCredentialsStatus("calendar");
  return {
    gmail: {
      enabled: boolFromEnv("GMAIL_ENABLED", true),
      configured: gmailGoogle.configured,
      needs: gmailGoogle.configured
        ? []
        : ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REFRESH_TOKEN"],
    },
    calendar: {
      enabled: boolFromEnv("GOOGLE_CALENDAR_ENABLED", true),
      configured: calendarGoogle.configured,
      needs: calendarGoogle.configured
        ? []
        : [
            "GOOGLE_CALENDAR_OAUTH_CLIENT_ID",
            "GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET",
            "GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN",
          ],
    },
    github: {
      enabled: boolFromEnv("GITHUB_ENABLED", true),
      configured: Boolean(envValue("GITHUB_USERNAME", "MatiasJRB")),
      tokenConfigured: Boolean(firstEnv(["GITHUB_TOKEN", "GH_TOKEN"])),
      needs: firstEnv(["GITHUB_TOKEN", "GH_TOKEN"]) ? [] : ["GITHUB_TOKEN para notificaciones privadas"],
    },
    gemini: {
      enabled: boolFromEnv("PERSONAL_DIGEST_USE_GEMINI", true),
      configured: Boolean(firstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"])),
      model: geminiModel(),
    },
  };
}

export async function collectPersonalDigest(opts = {}) {
  const window = digestWindow(opts.slot || "manual", opts.now || new Date());
  const sources = await Promise.allSettled([
    collectGmail({ window }),
    collectCalendar({ window }),
    collectGitHub({ window }),
  ]);

  const normalizedSources = {};
  for (const result of sources) {
    if (result.status === "fulfilled") {
      normalizedSources[result.value.name] = result.value;
    }
  }
  for (const [name, result] of [
    ["gmail", sources[0]],
    ["calendar", sources[1]],
    ["github", sources[2]],
  ]) {
    if (result.status === "rejected") {
      normalizedSources[name] = {
        name,
        enabled: true,
        configured: true,
        status: "error",
        items: [],
        signals: [],
        warnings: [`Collector ${name} falló: ${safeErrorMessage(result.reason)}`],
      };
    }
  }

  const signals = dedupeSignals(Object.values(normalizedSources)
    .flatMap((source) => source.signals || []))
    .sort((a, b) => {
      const priority = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (priority !== 0) return priority;
      return Date.parse(b.when || 0) - Date.parse(a.when || 0);
    });

  return {
    generatedAt: window.generatedAt,
    window,
    sourceStatus: getPersonalSourceStatus(),
    sources: normalizedSources,
    signals,
    warnings: Object.values(normalizedSources).flatMap((source) =>
      (source.warnings || []).map((warning) => `${source.name}: ${warning}`),
    ),
  };
}

function lineForSignal(signal, tz) {
  const when = signal.when ? ` — ${formatWhen(signal.when, tz)}` : "";
  const action = signal.action ? ` — ${signal.action}` : "";
  const link = signal.url ? ` — ${signal.url}` : "";
  return `- [${signal.priority}] ${signal.title}${when}${action} — ${signal.source}${link}`;
}

function truncate(text, maxChars) {
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n\n…recortado para Discord. Revisá /setup/api/personal/digest para más detalle.`;
}

export function renderDeterministicDigest(data, opts = {}) {
  const maxSignals = opts.maxSignals || intFromEnv("PERSONAL_DIGEST_MAX_SIGNALS", 12, { min: 1, max: 50 });
  const tz = data.window?.timezone || "America/Argentina/Buenos_Aires";
  const nowMatters = data.signals.filter((s) => ["P0", "P1"].includes(s.priority)).slice(0, maxSignals);
  const radar = data.signals.filter((s) => s.priority === "P2").slice(0, maxSignals);
  const warnings = data.warnings || [];
  const itemCounts = Object.fromEntries(
    Object.entries(data.sources || {}).map(([key, source]) => [key, source.items?.length || 0]),
  );

  if (!nowMatters.length && !radar.length && !warnings.length) {
    return "Sin pendientes importantes por ahora.";
  }

  const lines = [];
  const slotLabel = data.window?.slot ? ` (${data.window.slot})` : "";
  lines.push(`## Digest personal${slotLabel}`);
  lines.push(`Ventana: ${formatDateOnly(data.window?.since, tz)} → ${formatWhen(data.window?.until, tz)}`);
  lines.push("");
  lines.push("## Ahora importa");
  if (nowMatters.length) {
    lines.push(...nowMatters.map((signal) => lineForSignal(signal, tz)));
  } else {
    lines.push("- Sin P0/P1 detectados.");
  }
  lines.push("");
  lines.push("## Para tener en radar");
  if (radar.length) {
    lines.push(...radar.map((signal) => lineForSignal(signal, tz)));
  } else {
    lines.push("- Sin P2 relevantes.");
  }
  lines.push("");
  lines.push("## Ruido / cobertura");
  lines.push(
    `- Revisados: Gmail ${itemCounts.gmail || 0}, Calendar ${itemCounts.calendar || 0}, GitHub ${itemCounts.github || 0}.`,
  );
  for (const warning of warnings.slice(0, 6)) {
    lines.push(`- Aviso: ${warning}`);
  }
  lines.push("");
  lines.push("## Automatizaciones candidatas");
  if (warnings.some((warning) => /credenciales|GITHUB_TOKEN|OAuth/i.test(warning))) {
    lines.push("- Completar credenciales faltantes para que el digest cubra todas las fuentes reales.");
  } else {
    lines.push("- Si se repite una señal P1/P2, convertirla en alerta reactiva dedicada.");
  }

  return truncate(lines.join("\n"), opts.maxChars || intFromEnv("DISCORD_MESSAGE_MAX_CHARS", 1900, { min: 500, max: 8000 }));
}

function geminiModel() {
  return normalizeModelName(
    envValue("PERSONAL_DIGEST_GEMINI_MODEL") ||
      envValue("GEMINI_API_MODEL") ||
      envValue("GEMINI_MODEL") ||
      "gemini-2.5-flash-lite",
  );
}

function minimalDataForModel(data) {
  return {
    generatedAt: data.generatedAt,
    window: data.window,
    warnings: data.warnings,
    signals: data.signals.slice(0, 30),
    sources: Object.fromEntries(
      Object.entries(data.sources || {}).map(([key, source]) => [
        key,
        {
          status: source.status,
          itemCount: source.items?.length || 0,
          warnings: source.warnings || [],
          items: (source.items || []).slice(0, 12).map((item) => ({
            subject: item.subject,
            from: item.from,
            title: item.title,
            summary: item.summary,
            start: item.start,
            end: item.end,
            status: item.status,
            priority: item.priority,
            labels: item.labels,
            url: item.url || item.htmlLink || item.html_url,
            snippet: item.snippet ? String(item.snippet).slice(0, 180) : undefined,
          })),
        },
      ]),
    ),
  };
}

async function renderWithGemini(data, opts = {}) {
  const apiKey = firstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  if (!apiKey) throw new Error("GEMINI_API_KEY/GOOGLE_API_KEY no configurada");
  const model = geminiModel();
  const maxChars = opts.maxChars || intFromEnv("DISCORD_MESSAGE_MAX_CHARS", 1900, { min: 500, max: 8000 });
  const prompt = `Sos el secretario personal de Matías. Con estos datos normalizados de Gmail, Calendar y GitHub, redactá un digest breve para Discord en español rioplatense.\n\nReglas:\n- Separá en exactamente estas secciones: ## Ahora importa, ## Para tener en radar, ## Ruido ignorado, ## Automatizaciones candidatas.\n- Prioridad: P0/P1 en Ahora importa; P2 en radar; P3/ruido resumido.\n- No inventes datos ni acciones.\n- No mezcles Mango/trabajo salvo impacto personal claro.\n- Si faltan credenciales, decilo una vez como cobertura faltante.\n- Si no hay nada relevante, respondé solo: Sin pendientes importantes por ahora.\n- Máximo ${maxChars} caracteres.\n\nDatos JSON:\n${JSON.stringify(minimalDataForModel(data), null, 2)}`;

  const response = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: intFromEnv("PERSONAL_DIGEST_GEMINI_MAX_OUTPUT_TOKENS", 900, {
            min: 128,
            max: 4096,
          }),
        },
      }),
      timeoutMs: intFromEnv("PERSONAL_DIGEST_GEMINI_TIMEOUT_MS", 25_000, {
        min: 1000,
        max: 120_000,
      }),
    },
  );

  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini no devolvió texto");
  return truncate(text, maxChars);
}

export async function renderPersonalDigest(data, opts = {}) {
  const useGemini = opts.useGemini ?? boolFromEnv("PERSONAL_DIGEST_USE_GEMINI", true);
  if (!useGemini) return renderDeterministicDigest(data, opts);

  try {
    return await renderWithGemini(data, opts);
  } catch (err) {
    const fallback = renderDeterministicDigest(data, opts);
    if (boolFromEnv("PERSONAL_DIGEST_SHOW_AI_FALLBACK_WARNING", true)) {
      return truncate(
        `${fallback}\n\n_Aviso interno: Gemini no pudo redactar el digest (${safeErrorMessage(err)}); usé fallback determinístico._`,
        opts.maxChars || intFromEnv("DISCORD_MESSAGE_MAX_CHARS", 1900, { min: 500, max: 8000 }),
      );
    }
    return fallback;
  }
}
