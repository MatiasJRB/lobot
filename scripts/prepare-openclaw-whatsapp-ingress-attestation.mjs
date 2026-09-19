#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const OPENCLAW_VERSION = "2026.9.2";
export const OPENCLAW_COMMIT = "3928bad9badfcb6c7d140530435e806fb8092190";

export const BASELINES = Object.freeze({
  "extensions/whatsapp/src/inbound/message-delivery.ts":
    "0feb94290b9c4b2d889ed29c30b983da9c5c739363bb5a877c514d2c712838b0",
  "extensions/whatsapp/src/inbound/message-debounce.ts":
    "666ebaf8c171e7e178b8fb38ad064189317e642f0a2f72f34b0b1be6b626e06c",
  "extensions/whatsapp/src/auto-reply/monitor/on-message.ts":
    "c5646573ab4743c2cbebe8ad693f310ddaac9677b3168a9bba1eea9f6661cc63",
  "extensions/whatsapp/src/auto-reply/monitor/process-message.ts":
    "bfd5b27c1199f7cee97b1c84549ead434be64b68d23d8b43e37d1b307a03a181",
});

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PATCH_PATH = path.resolve(
  SCRIPT_DIR,
  "../patches/openclaw-whatsapp/2026.9.2-ingress-attestation.patch",
);
export const PATCH_SHA256 = "7900fa5972dd7afdc28d954109c018ffa7d8cded6ce833ac94f5c1e93eec16c9";

function fail(message) {
  throw new Error(`OpenClaw ingress patch refused: ${message}`);
}

export function parseCli(argv) {
  let source;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      source = argv[index + 1];
      index += 1;
    } else if (argument === "--apply") {
      apply = true;
    } else {
      fail(`unknown argument ${JSON.stringify(argument)}`);
    }
  }
  if (!source) {
    fail("--source <exact-openclaw-checkout> is required");
  }
  return { source: path.resolve(source), apply };
}

export async function sha256File(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

export async function assertExactPackageVersion(source) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(path.join(source, "extensions/whatsapp/package.json"), "utf8"),
    );
  } catch {
    fail("missing or invalid extensions/whatsapp/package.json");
  }
  if (manifest?.name !== "@openclaw/whatsapp" || manifest?.version !== OPENCLAW_VERSION) {
    fail(`requires @openclaw/whatsapp@${OPENCLAW_VERSION}`);
  }
}

export async function assertExactCommit(source) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || result.stdout.trim() !== OPENCLAW_COMMIT) {
    fail(`requires exact OpenClaw commit ${OPENCLAW_COMMIT}`);
  }
}

export async function assertBaselines(source, baselines = BASELINES) {
  for (const [relativePath, expected] of Object.entries(baselines)) {
    let actual;
    try {
      actual = await sha256File(path.join(source, relativePath));
    } catch {
      fail(`missing baseline file ${relativePath}`);
    }
    if (actual !== expected) {
      fail(`baseline drift in ${relativePath}`);
    }
  }
}

export async function preparePatch({ source, apply, patchPath = DEFAULT_PATCH_PATH }) {
  const sourceStat = await stat(source).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    fail("source is not a directory");
  }
  if ((await sha256File(patchPath).catch(() => null)) !== PATCH_SHA256) {
    fail("patch artifact hash mismatch");
  }
  await assertExactPackageVersion(source);
  await assertExactCommit(source);
  await assertBaselines(source);

  const check = spawnSync("git", ["apply", "--check", patchPath], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (check.status !== 0) {
    fail("git apply --check failed");
  }
  if (!apply) {
    return { applied: false, source, version: OPENCLAW_VERSION, commit: OPENCLAW_COMMIT };
  }

  const applied = spawnSync("git", ["apply", patchPath], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (applied.status !== 0) {
    fail("git apply failed after a successful check");
  }
  return { applied: true, source, version: OPENCLAW_VERSION, commit: OPENCLAW_COMMIT };
}

async function main() {
  const result = await preparePatch(parseCli(process.argv.slice(2)));
  process.stdout.write(
    `${result.applied ? "APPLIED" : "CHECKED"} @openclaw/whatsapp@${result.version} ${result.commit}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
