import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_AUTH_BYTES = 100_000;

function credentialError() {
  // Never forward JSON parse errors or credential contents into bridge logs.
  return new Error("ALI QA credential cache is unavailable or unsafe");
}

function privateOwned(stat) {
  return (stat.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid());
}

function readAuth(file) {
  let fd;
  try {
    const initial = fs.lstatSync(file);
    if (!initial.isFile() || !privateOwned(initial)) throw credentialError();
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || !privateOwned(stat) || stat.size > MAX_AUTH_BYTES ||
        stat.ino !== initial.ino || stat.dev !== initial.dev) throw credentialError();
    const raw = fs.readFileSync(fd, "utf8");
    if (Buffer.byteLength(raw) > MAX_AUTH_BYTES) throw credentialError();
    const auth = JSON.parse(raw);
    if (auth?.auth_mode !== "chatgpt" || auth.OPENAI_API_KEY ||
        !["account_id", "access_token", "id_token", "refresh_token"].every((key) =>
          typeof auth.tokens?.[key] === "string" && auth.tokens[key].trim()) ||
        typeof auth.last_refresh !== "string" ||
        !Number.isFinite(Date.parse(auth.last_refresh))) throw credentialError();
    return { raw, account: auth.tokens.account_id, refreshedAt: Date.parse(auth.last_refresh) };
  } catch {
    throw credentialError();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// The personal login may refresh while the one-time provisioned QA copy expires.
// Sync auth only; never share the personal config, tools, history or CODEX_HOME.
export function syncAliQaAuth(home, {
  sourceAuthPath = path.join(os.homedir(), ".codex", "auth.json"),
} = {}) {
  let target;
  try {
    const stat = fs.lstatSync(home);
    if (!stat.isDirectory() || !privateOwned(stat)) throw credentialError();
    if (fs.realpathSync(home) === fs.realpathSync(path.dirname(sourceAuthPath))) {
      throw new Error("ALI QA Codex home must remain isolated");
    }
    target = path.join(home, "auth.json");
  } catch (error) {
    if (error.message === "ALI QA Codex home must remain isolated") throw error;
    throw credentialError();
  }
  const source = readAuth(sourceAuthPath);
  const current = readAuth(target);
  if (source.account !== current.account) {
    throw new Error("ALI QA credential account mismatch; explicit reprovisioning required");
  }
  // Codex can also refresh the QA cache itself. Never roll that refresh back.
  if (source.refreshedAt <= current.refreshedAt || source.raw === current.raw) {
    return { refreshed: false };
  }
  const temporary = path.join(home, `.auth-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, source.raw, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, target);
    return { refreshed: true };
  } catch {
    throw credentialError();
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
