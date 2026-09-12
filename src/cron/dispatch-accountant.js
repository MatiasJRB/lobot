#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { BridgeApiClient } from "../bridge/api-client.js";

export const ACCOUNTANT_CWD = "/Users/matiasrios/Documents/GitHub/ops";
export const ACCOUNTANT_THREAD = "Investigar reemplazo del contador";
export const ACCOUNTANT_TIMEZONE = "America/Argentina/Buenos_Aires";

function argValue(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export function localDateTimeKey(now = new Date(), timeZone = ACCOUNTANT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    hour: value.hour,
  };
}

function commonPrompt(date) {
  return [
    `Operá como contador autónomo por excepción de Matías para el control correspondiente a ${date}.`,
    "Iniciá y completá todo el trabajo rutinario sin esperar que Matías pregunte ni conducirlo paso a paso.",
    "Trabajá desde /Users/matiasrios/Documents/GitHub/ops y aplicá el contrato de monotributo-copilot-ar.",
    "Antes de un flujo fiscal conectado, ejecutá `npm run doctor` desde /Users/matiasrios/Documents/GitHub/monotributo-copilot-ar y no avances si reporta una configuración incompleta.",
    "Podés leer fuentes autorizadas, conciliar, actualizar artefactos locales, generar reportes, expedientes, borradores y dry-runs.",
    "Nunca interpretes una fuente ausente como cero: conservá unknown/incomplete, registrá frescura y reintentá en la próxima corrida cuando corresponda.",
    "No abras ARCA con Clave Fiscal de forma desatendida. No emitas comprobantes, no envíes mensajes a terceros, no generes ni pagues VEP, no reasignes saldos, no presentes recategorizaciones y no respondas DFE.",
    "Si una acción irreversible queda preparada, pedí una aprobación final específica con job, importe, destinatario, ambiente y evidencia; nunca uses --force.",
    "No incluyas secretos, certificados, datos bancarios completos ni cuerpos de comunicaciones fiscales en la respuesta.",
  ];
}

export function buildAccountantPrompt(cadence, now = new Date()) {
  if (!["monitor", "billing", "payment"].includes(cadence)) {
    throw new Error(`Unsupported cadence: ${cadence}`);
  }
  const { date } = localDateTimeKey(now);
  const base = commonPrompt(date);

  if (cadence === "monitor") {
    return [
      ...base,
      "Ejecutá el monitoreo fiscal y DFE definido en cobranzas/fiscal/spec.md.",
      "Revisá Gmail en modo read-only para detectar remitentes oficiales y asuntos nuevos de ARCA/AFIP/DFE; no marques, archives, respondas, abras links autenticados ni descargues adjuntos. Persistí únicamente metadata permitida mediante el registro DFE local.",
      "La comunicación courier Borderbox 672044443 ya fue identificada como aviso informativo y no debe volver a alertarse.",
      "Controlá frescura de CCMA, cambios de deuda/intereses, estado del monotributo, límites de categoría, ventana oficial de recategorización y vencimientos próximos.",
      "Hasta el 30/09/2026 mantené además la checklist de salida de Marcelo; el 28/09 prepará el go/no-go y el borrador de baja, sin enviarlo.",
      "Guardá deduplicación y último estado en cobranzas/out/fiscal/monitoring-state.json.",
      "Si no existe una novedad accionable, tu respuesta final debe ser exactamente DONT_NOTIFY, sin texto adicional.",
      "Si existe una excepción, respondé una sola ficha: estado, qué pasó, evidencia y fecha, vencimiento, recomendación, aprobación exacta necesaria y confianza.",
    ].join("\n");
  }

  if (cadence === "billing") {
    return [
      ...base,
      "Ejecutá la conciliación mensual completa de cobranzas y facturación.",
      "Contrastá Gmail, Norte Financiero, clientes, pagos, facturas y outputs del período; verificá comprobantes existentes para no duplicar.",
      "Actualizá los registros locales y generá todos los dry-runs necesarios, pero no emitas ni envíes.",
      "Entregá una única bandeja de aprobación por lote con cada factura lista: cliente, CUIT, comprobante, importe, moneda, período, vencimiento, punto de venta, ambiente, evidencia y ruta del dry-run.",
      "Marcá INCOMPLETO lo que no pueda prepararse y continuá con los demás. Emisión y envío son aprobaciones separadas.",
      "Aunque no haya facturas nuevas, devolvé una confirmación breve de que el período quedó conciliado.",
    ].join("\n");
  }

  const day = Number(date.slice(-2));
  return [
    ...base,
    "Verificá vencimiento y aplicación del pago mensual usando la fuente CCMA más reciente y la evidencia fiscal local.",
    "Si existe deuda, intereses, pago no aplicado o evidencia vencida, devolvé una única ficha con período, monto verificable, fuente, fecha límite y siguiente paso.",
    day === 23
      ? "Si el pago está aplicado, las fuentes están frescas y no hay alertas, devolvé una única confirmación ‘✅ Contador · mes en orden’ con la fecha del próximo control."
      : "Si el pago está aplicado y no hay ninguna acción antes del cierre del día 23, tu respuesta final debe ser exactamente DONT_NOTIFY, sin texto adicional.",
    "Mantené el seguimiento separado de la reasignación pendiente de diciembre de 2024 con créditos de febrero de 2025; no la ejecutes automáticamente.",
  ].join("\n");
}

function clientFromEnv() {
  const baseUrl =
    process.env.CODEX_BRIDGE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT || 8080}/bridge/api`;
  const token = process.env.CODEX_BRIDGE_TOKEN?.trim();
  return new BridgeApiClient({ baseUrl, token });
}

export async function runAccountant(
  cadence,
  { client = clientFromEnv(), now = new Date(), output = console.log } = {},
) {
  const { date, hour } = localDateTimeKey(now);
  const thread = process.env.CODEX_ACCOUNTANT_THREAD?.trim() || ACCOUNTANT_THREAD;
  const idempotencySuffix = cadence === "monitor" ? `${date}:${hour}` : date;
  const result = await client.enqueueJob({
    prompt: buildAccountantPrompt(cadence, now),
    thread,
    cwd: ACCOUNTANT_CWD,
    mode: "workspace-write",
    idempotencyKey: `accountant:${cadence}:${idempotencySuffix}`,
    source: "openclaw-cron",
    reply: {
      channel: "whatsapp-self",
      policy: cadence === "billing" ? "always" : "actionable-only",
    },
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
  runAccountant(cadence).catch((error) => {
    console.error(`[accountant] ${error.message}`);
    process.exitCode = 1;
  });
}
