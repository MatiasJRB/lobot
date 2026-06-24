#!/usr/bin/env node
import { collectPersonalDigest, renderPersonalDigest } from "../personal/digest.js";
import { intFromEnv } from "../personal/env.js";

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

async function main() {
  const slot = argValue("slot", "manual");
  const format = argValue("format", "markdown");
  const maxChars = Number.parseInt(
    argValue("max-chars", String(intFromEnv("DISCORD_MESSAGE_MAX_CHARS", 1900, { min: 500, max: 8000 }))),
    10,
  );
  const data = await collectPersonalDigest({ slot });

  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const text = await renderPersonalDigest(data, {
    useGemini: !hasFlag("no-ai"),
    maxChars: Number.isFinite(maxChars) ? maxChars : undefined,
  });
  console.log(text.trim() || "Sin pendientes importantes por ahora.");
}

main().catch((err) => {
  console.error(`Personal digest failed: ${err.message || String(err)}`);
  process.exit(1);
});
