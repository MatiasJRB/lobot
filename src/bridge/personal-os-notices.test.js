import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { pullPersonalOsNotices } from "./personal-os-notices.js";

test("notice pull projects proposals into the knowledge hub and throttles idle sync", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-notices-"));
  const privateDir = path.join(root, "private");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(privateDir, { mode: 0o700 });
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, "personal_os_notices.py"),
    "import sys\nsys.stdin.read()\n", { mode: 0o700 });
  fs.writeFileSync(path.join(binDir, "personal_os_knowledge.py"),
    "from pathlib import Path\nPath(__file__).with_name('knowledge-ran').write_text('ok')\n",
    { mode: 0o700 });
  const calls = [];
  const api = { async listPersonalOsNotices(cursor) {
    calls.push(cursor);
    return cursor === 0
      ? { ok: true, notices: [{ id: "notice" }], nextCursor: 10, hasMore: false }
      : { ok: true, notices: [], nextCursor: 10, hasMore: false };
  } };
  try {
    assert.deepEqual(await pullPersonalOsNotices(api, { root }), { imported: 1, cursor: 10 });
    assert.equal(fs.readFileSync(path.join(binDir, "knowledge-ran"), "utf8"), "ok");
    const state = path.join(privateDir, "knowledge-hub-sync-state.json");
    assert.equal(fs.statSync(state).mode & 0o077, 0);
    const before = fs.statSync(state).mtimeMs;
    assert.deepEqual(await pullPersonalOsNotices(api, { root }), { imported: 0, cursor: 10 });
    assert.equal(fs.statSync(state).mtimeMs, before);
    assert.deepEqual(calls, [0, 10]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
