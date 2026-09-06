#!/usr/bin/env node
import { collectPersonalDigest } from "../personal/digest.js";
import { envValue, intFromEnv } from "../personal/env.js";
import { formatWhen } from "../personal/time.js";
import {
  loadStore,
  markSeen,
  pruneStore,
  reactiveCandidates,
  resolveStatePath,
  saveStore,
  selectNewSignals,
} from "../personal/reactive-store.js";

// Reactive personal alert: reuses the digest collectors but only pushes when
// a NEW urgent signal appears since the last run. Defaults to P0-only and to
// Gmail/Calendar sources, because those are the "cannot wait" interrupts;
// GitHub PR/CI notifications stay in the digest. Intended to run on a
// high-frequency cron. When there is nothing new it prints no output at all,
// so the cron delivers nothing to the channel.

const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function minPriority() {
  const raw = (argValue("min-priority", envValue("REACTIVE_ALERT_MIN_PRIORITY", "P0")) || "P0").toUpperCase();
  return VALID_PRIORITIES.has(raw) ? raw : "P0";
}

function sourceAllowlist() {
  return argValue("sources", envValue("REACTIVE_ALERT_SOURCES", "gmail,calendar"))
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function alertLine(signal, tz) {
  const summary = signal.summary ? ` (${signal.summary})` : "";
  const when = signal.when ? ` — ${formatWhen(signal.when, tz)}` : "";
  const action = signal.action ? ` — ${signal.action}` : "";
  const link = signal.url ? ` — ${signal.url}` : "";
  return `- [${signal.priority}] ${signal.title}${summary}${when}${action} — ${signal.source}${link}`;
}

async function main() {
  const format = argValue("format", "text");
  const persist = !hasFlag("dry-run") && !hasFlag("no-persist");
  const min = minPriority();
  const sources = sourceAllowlist();
  const now = new Date();

  const data = await collectPersonalDigest({ slot: "manual", now });
  const tz = data.window?.timezone || envValue("DEFAULT_TIMEZONE", "America/Argentina/Buenos_Aires");
  const urgent = reactiveCandidates(data.signals, { minPriority: min, sources });

  const statePath = resolveStatePath();
  let store = pruneStore(loadStore(statePath), {
    ttlHours: intFromEnv("REACTIVE_ALERT_TTL_HOURS", 168, { min: 1, max: 8760 }),
    now,
  });
  const fresh = selectNewSignals(urgent, store);
  const maxAlerts = intFromEnv("REACTIVE_ALERT_MAX", 10, { min: 1, max: 50 });
  const toAlert = fresh.slice(0, maxAlerts);

  // Mark every fresh signal as seen (even capped ones) so the next run stays
  // quiet; capped overflow is surfaced by the daily digest instead.
  if (persist && fresh.length) {
    store = markSeen(store, fresh, { now });
    saveStore(statePath, store);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          generatedAt: data.generatedAt,
          minPriority: min,
          sources,
          urgentCount: urgent.length,
          newCount: fresh.length,
          alerted: toAlert,
          statePath,
          persisted: persist && Boolean(fresh.length),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Silence is the common case: no new urgent signal -> emit nothing.
  if (!toAlert.length) return;

  const lines = [];
  const overflow = fresh.length - toAlert.length;
  lines.push(`🔔 Alerta personal (${toAlert.length}${overflow > 0 ? ` de ${fresh.length}` : ""})`);
  for (const signal of toAlert) lines.push(alertLine(signal, tz));
  if (overflow > 0) {
    lines.push(`…y ${overflow} más urgentes. Revisá el próximo digest o /setup/api/personal/digest.`);
  }
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(`Reactive alert failed: ${err.message || String(err)}`);
  process.exit(1);
});
