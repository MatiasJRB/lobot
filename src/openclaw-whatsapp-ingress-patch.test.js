import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertBaselines,
  assertExactPackageVersion,
  parseCli,
  sha256File,
} from "../scripts/prepare-openclaw-whatsapp-ingress-attestation.mjs";

async function fixture(version = "2026.9.2") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "secretario-openclaw-patch-"));
  await mkdir(path.join(directory, "extensions/whatsapp"), { recursive: true });
  await writeFile(
    path.join(directory, "extensions/whatsapp/package.json"),
    JSON.stringify({ name: "@openclaw/whatsapp", version }),
  );
  return directory;
}

test("patch CLI is explicit and never applies by default", () => {
  assert.deepEqual(parseCli(["--source", "./checkout"]), {
    source: path.resolve("./checkout"),
    apply: false,
  });
  assert.deepEqual(parseCli(["--source", "./checkout", "--apply"]), {
    source: path.resolve("./checkout"),
    apply: true,
  });
  assert.throws(() => parseCli([]), /--source/);
  assert.throws(() => parseCli(["--source", "./checkout", "--unknown"]), /unknown argument/);
});

test("exact package version gate rejects an unsupported release", async () => {
  const directory = await fixture("2026.9.3");
  try {
    await assert.rejects(() => assertExactPackageVersion(directory), /requires.*2026\.9\.2/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("baseline gate accepts exact bytes and rejects drift", async () => {
  const directory = await fixture();
  const filename = path.join(directory, "source.ts");
  try {
    await writeFile(filename, "exact\n");
    const expected = await sha256File(filename);
    await assertBaselines(directory, { "source.ts": expected });
    await writeFile(filename, "drift\n");
    await assert.rejects(() => assertBaselines(directory, { "source.ts": expected }), /drift/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
