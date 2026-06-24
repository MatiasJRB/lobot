export function envValue(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  return trimmed || fallback;
}

export function boolFromEnv(name, fallback = false) {
  const raw = envValue(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

export function intFromEnv(name, fallback, opts = {}) {
  const raw = envValue(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (opts.min !== undefined && parsed < opts.min) return opts.min;
  if (opts.max !== undefined && parsed > opts.max) return opts.max;
  return parsed;
}

export function listFromEnv(name, fallback = []) {
  const raw = envValue(name);
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function firstEnv(names, fallback = "") {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return fallback;
}

export function normalizeModelName(model) {
  const raw = String(model || "").trim();
  if (!raw) return "";
  if (raw.startsWith("models/")) return raw.slice("models/".length);
  if (raw.startsWith("google/")) return raw.slice("google/".length);
  return raw;
}
