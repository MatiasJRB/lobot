import fs from "node:fs";
import path from "node:path";

// Persisted "already alerted" store for reactive personal alerts.
// Keeps a map of signalKey -> ISO timestamp of the first alert, so each
// signal is pushed once and stays silent on later runs until it ages out.
// This is what lets a high-frequency cron poll without spamming the channel.

const DEFAULT_TTL_HOURS = 168; // 7 days

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Narrow the digest signals down to what should interrupt reactively:
// at or above `minPriority`, and (optionally) only from `sources`. Reactive
// interrupts default to P0-only and to Gmail/Calendar because GitHub PR/CI
// notifications are digest material, not phone alerts.
export function reactiveCandidates(signals, { minPriority = "P0", sources } = {}) {
  const threshold = PRIORITY_ORDER[minPriority] ?? 0;
  const allow = sources && sources.length ? new Set(sources.map((s) => String(s).toLowerCase())) : null;
  return (signals || []).filter((signal) => {
    if ((PRIORITY_ORDER[signal.priority] ?? 9) > threshold) return false;
    if (allow && !allow.has(String(signal.source || "").toLowerCase())) return false;
    return true;
  });
}

// Same key shape used by digest.dedupeSignals, so a signal is identified
// consistently across the digest and the reactive path.
export function signalKey(signal) {
  return [signal.source || "", signal.url || "", signal.title || "", signal.when || ""].join("|");
}

export function resolveStatePath() {
  const explicit = process.env.PERSONAL_REACTIVE_STATE_FILE;
  if (explicit && explicit.trim()) return explicit.trim();
  const baseDir = process.env.PERSONAL_REACTIVE_STATE_DIR || "/data";
  try {
    fs.accessSync(baseDir, fs.constants.W_OK);
    return path.join(baseDir, "personal-reactive-state.json");
  } catch {
    // No writable /data (e.g. local dev): fall back to a repo-ignored file.
    return path.join(process.cwd(), ".reactive-state.json");
  }
}

export function loadStore(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.seen && typeof parsed.seen === "object") {
      return { seen: parsed.seen };
    }
  } catch {
    // Missing or corrupt store -> start empty.
  }
  return { seen: {} };
}

export function saveStore(statePath, store) {
  const payload = JSON.stringify(
    { seen: store.seen || {}, updatedAt: new Date().toISOString() },
    null,
    2,
  );
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, payload);
}

export function pruneStore(store, { ttlHours = DEFAULT_TTL_HOURS, now = new Date() } = {}) {
  const cutoff = now.getTime() - ttlHours * 60 * 60 * 1000;
  const seen = {};
  for (const [key, iso] of Object.entries(store.seen || {})) {
    const ts = Date.parse(iso);
    if (Number.isFinite(ts) && ts >= cutoff) seen[key] = iso;
  }
  return { seen };
}

// Returns signals not present in the store, deduped within the batch too.
export function selectNewSignals(signals, store) {
  const seen = store.seen || {};
  const batch = new Set();
  const out = [];
  for (const signal of signals) {
    const key = signalKey(signal);
    if (seen[key] || batch.has(key)) continue;
    batch.add(key);
    out.push(signal);
  }
  return out;
}

export function markSeen(store, signals, { now = new Date() } = {}) {
  const seen = { ...(store.seen || {}) };
  const iso = now.toISOString();
  for (const signal of signals) {
    const key = signalKey(signal);
    if (!seen[key]) seen[key] = iso;
  }
  return { seen };
}
