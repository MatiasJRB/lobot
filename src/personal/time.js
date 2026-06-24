import { envValue, intFromEnv } from "./env.js";

export function timezone() {
  return envValue("PERSONAL_TIMEZONE", envValue("TZ", "America/Argentina/Buenos_Aires"));
}

export function isoDateTime(date) {
  return new Date(date).toISOString();
}

export function digestWindow(slot = "manual", now = new Date()) {
  const normalizedSlot = String(slot || "manual").toLowerCase();
  const lookbackBySlot = {
    morning: intFromEnv("PERSONAL_DIGEST_MORNING_LOOKBACK_HOURS", 14, { min: 1, max: 168 }),
    afternoon: intFromEnv("PERSONAL_DIGEST_AFTERNOON_LOOKBACK_HOURS", 8, { min: 1, max: 168 }),
    evening: intFromEnv("PERSONAL_DIGEST_EVENING_LOOKBACK_HOURS", 8, { min: 1, max: 168 }),
    night: intFromEnv("PERSONAL_DIGEST_NIGHT_LOOKBACK_HOURS", 8, { min: 1, max: 168 }),
    manual: intFromEnv("PERSONAL_DIGEST_MANUAL_LOOKBACK_HOURS", 24, { min: 1, max: 168 }),
  };
  const lookbackHours = lookbackBySlot[normalizedSlot] ?? lookbackBySlot.manual;
  const horizonHours = intFromEnv("PERSONAL_DIGEST_CALENDAR_HORIZON_HOURS", 36, {
    min: 1,
    max: 336,
  });
  const nowMs = now.getTime();
  return {
    slot: normalizedSlot,
    timezone: timezone(),
    generatedAt: isoDateTime(now),
    since: isoDateTime(new Date(nowMs - lookbackHours * 60 * 60 * 1000)),
    until: isoDateTime(now),
    calendarUntil: isoDateTime(new Date(nowMs + horizonHours * 60 * 60 * 1000)),
    lookbackHours,
    horizonHours,
  };
}

export function formatWhen(value, tz = timezone()) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateOnly(value, tz = timezone()) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
