import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { syncAliQaAuth } from "./ali-qa-auth.js";

function auth(lastRefresh, account = "same-account") {
  return { auth_mode: "chatgpt", OPENAI_API_KEY: null,
    tokens: { account_id: account, access_token: `access-${lastRefresh}`,
      id_token: "private-id-token", refresh_token: "private-refresh-token" },
    last_refresh: lastRefresh };
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ali-auth-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const personal = path.join(dir, "personal");
  const home = path.join(dir, "qa");
  fs.mkdirSync(personal, { mode: 0o700 });
  fs.mkdirSync(home, { mode: 0o700 });
  const sourceAuthPath = path.join(personal, "auth.json");
  const target = path.join(home, "auth.json");
  const write = (p, data) => fs.writeFileSync(p, JSON.stringify(data), { mode: 0o600 });
  write(sourceAuthPath, auth("2026-10-01T01:46:02Z"));
  write(target, auth("2026-09-21T01:51:00Z"));
  fs.writeFileSync(path.join(home, "config.toml"), "isolated-config", { mode: 0o600 });
  return { home, sourceAuthPath, target, write };
}

test("ALI auth refreshes a stale same-account cache atomically without copying personal config", (t) => {
  const f = fixture(t);
  const source = fs.readFileSync(f.sourceAuthPath, "utf8");
  assert.deepEqual(syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }),
    { refreshed: true });
  assert.equal(fs.readFileSync(f.target, "utf8"), source);
  assert.equal(fs.readFileSync(f.sourceAuthPath, "utf8"), source);
  assert.equal(fs.statSync(f.target).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.home).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(f.home, "config.toml"), "utf8"), "isolated-config");
  assert.deepEqual(fs.readdirSync(f.home).sort(), ["auth.json", "config.toml"]);
});

test("ALI auth never rolls back a newer QA refresh or rewrites an identical cache", (t) => {
  const f = fixture(t);
  f.write(f.target, auth("2026-10-02T01:46:02Z"));
  const before = fs.readFileSync(f.target, "utf8");
  assert.deepEqual(syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }),
    { refreshed: false });
  assert.equal(fs.readFileSync(f.target, "utf8"), before);
  f.write(f.sourceAuthPath, JSON.parse(before));
  assert.deepEqual(syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }),
    { refreshed: false });
});

test("ALI auth rejects account switches and API-key login without changing QA credentials", (t) => {
  const f = fixture(t);
  const before = fs.readFileSync(f.target, "utf8");
  for (const bad of [auth("2026-10-02T01:46:02Z", "another-account"),
    { auth_mode: "apikey", OPENAI_API_KEY: "private-api-key" }]) {
    f.write(f.sourceAuthPath, bad);
    assert.throws(() => syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }),
      /ALI QA .*credential|ALI QA .*account/);
    assert.equal(fs.readFileSync(f.target, "utf8"), before);
  }
});

test("ALI auth rejects missing, invalid or public caches with secret-free errors", (t) => {
  const f = fixture(t);
  for (const data of ["{private-malformed-token", JSON.stringify({ auth_mode: "chatgpt" })]) {
    fs.writeFileSync(f.sourceAuthPath, data);
    assert.throws(() => syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }),
      (error) => /credential/.test(error.message) && !error.message.includes("private-"));
  }
  f.write(f.sourceAuthPath, auth("2026-10-01T01:46:02Z"));
  fs.chmodSync(f.sourceAuthPath, 0o644);
  assert.throws(() => syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }), /credential/);
  fs.unlinkSync(f.sourceAuthPath);
  assert.throws(() => syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }), /credential/);
});

test("ALI auth refuses symlink caches and a non-isolated personal home", (t) => {
  const f = fixture(t);
  assert.throws(() => syncAliQaAuth(path.dirname(f.sourceAuthPath),
    { sourceAuthPath: f.sourceAuthPath }), /isolated/);
  fs.unlinkSync(f.target);
  fs.symlinkSync(f.sourceAuthPath, f.target);
  assert.throws(() => syncAliQaAuth(f.home, { sourceAuthPath: f.sourceAuthPath }), /credential/);
});
