#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "../bridge/api-client.js";

export const PERSONAL_ORGANIZATION_DIR =
  "/Users/matiasrios/Documents/Codex/personal-organization";
export const PERSONAL_OS_THREAD = "Secretario personal";
export const PERSONAL_OS_TIMEZONE = "America/Argentina/Buenos_Aires";

function argValue(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export function localDateKey(now = new Date(), timeZone = PERSONAL_OS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function buildReviewPrompt(cadence, now = new Date()) {
  if (!["weekly", "monthly"].includes(cadence)) {
    throw new Error(`Unsupported cadence: ${cadence}`);
  }
  const date = localDateKey(now);
  const isWeekly = cadence === "weekly";
  const cadenceId = isWeekly ? "weekly_review" : "monthly_review";
  const briefHorizonHours = isWeekly ? 168 : 744;
  const reviewFile = isWeekly
    ? "reviews/weekly-current.md"
    : "reviews/monthly-current.md";
  const extraSources = isWeekly
    ? "Revisá también health/registry.md, home/assets.md, relationships/people.md y documents/registry.md."
    : "Revisá también health/registry.md, finance/monthly-close.md, home/assets.md, relationships/people.md, documents/registry.md y, sin duplicar movimientos, el estado canónico de /Users/matiasrios/Documents/GitHub/gastos-automaticos.";

  return [
    `Ejecutá la ${isWeekly ? "revisión semanal" : "revisión mensual"} del Sistema Operativo Personal de Matías correspondiente a ${date}.`,
    "Esta activación puede leer fuentes y actualizar archivos locales, pero no puede enviar mensajes a terceros, pagar, comprar, reservar, contratar ni enviar formularios.",
    "Trabajá desde /Users/matiasrios/Documents/Codex/personal-organization.",
    `1. Ejecutá \`bin/personal-os validate\` y después \`bin/personal-os brief --horizon-hours ${briefHorizonHours} --limit 4\`. Usá la bandeja para empujar varios frentes seguros e independientes sin reintroducir bloqueados, diferidos ni cerrados.`,
    "2. Leé open-loops.md, monitoring-state.json, closed-items.json y daily-rhythm.md.",
    `3. ${extraSources}`,
    `4. Actualizá ${reviewFile} con una salida breve y concreta: cerrados, trabados, riesgos, decisiones pendientes y los próximos tres movimientos. No reabras tombstones ni agregues antecedentes como tareas.`,
    `5. Sólo después de guardar una revisión válida, ejecutá \`bin/personal-os complete-cadence ${cadenceId} --result "Revisión ${cadence} ${date} completada"\`.`,
    "6. Respondé para el WhatsApp propio de Matías en tono rioplatense, sin pedirle que salte de interfaz. Incluí únicamente lo que requiere atención y, si no hay nada accionable, decí que la revisión quedó al día.",
  ].join("\n");
}

function clientFromEnv() {
  const baseUrl =
    process.env.CODEX_BRIDGE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT || 8080}/bridge/api`;
  const token = process.env.CODEX_BRIDGE_TOKEN?.trim();
  return new BridgeApiClient({ baseUrl, token });
}

export async function runReview(
  cadence,
  {
    client = clientFromEnv(),
    now = new Date(),
    output = console.log,
  } = {},
) {
  const date = localDateKey(now);
  const result = await client.enqueueJob({
    prompt: buildReviewPrompt(cadence, now),
    thread: PERSONAL_OS_THREAD,
    cwd: PERSONAL_ORGANIZATION_DIR,
    mode: "workspace-write",
    idempotencyKey: `personal-os:${cadence}:${date}`,
    source: "openclaw-cron",
    reply: { channel: "whatsapp-self" },
  });
  const summary = {
    ok: true,
    cadence,
    date,
    created: result.created,
    jobId: result.job.id,
    status: result.job.status,
  };
  output(JSON.stringify(summary));
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const cadence = argValue("--cadence");
  runReview(cadence).catch((error) => {
    console.error(`[personal-os-review] ${error.message}`);
    process.exitCode = 1;
  });
}
