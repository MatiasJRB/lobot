import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PERSONAL_OS_ROOT = path.join(os.homedir(), "Documents/Codex/personal-organization");

export async function pullPersonalOsNotices(api, { root = DEFAULT_PERSONAL_OS_ROOT,
  maxPages = 5 } = {}) {
  const directory = path.join(root, "private");
  const stat = fs.statSync(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw new Error("notice directory not private");
  const cursorFile = path.join(directory, "system-notice-cursor.json");
  let cursor = 0;
  try {
    const cursorStat = fs.statSync(cursorFile);
    if (!cursorStat.isFile() || (cursorStat.mode & 0o077) !== 0) throw new Error("notice cursor not private");
    cursor = JSON.parse(fs.readFileSync(cursorFile, "utf8")).cursor;
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid notice cursor");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  let imported = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await api.listPersonalOsNotices(cursor, 50);
    if (!result.ok || !Array.isArray(result.notices) ||
        !Number.isSafeInteger(result.nextCursor) || result.nextCursor < cursor ||
        typeof result.hasMore !== "boolean" ||
        (result.notices.length && result.nextCursor === cursor)) throw new Error("invalid notice page");
    if (result.notices.length) {
      const script = path.join(root, "bin/personal_os_notices.py");
      const run = childProcess.spawnSync("python3", [script], {
        input: JSON.stringify(result.notices), encoding: "utf8", timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      if (run.error || run.status !== 0) throw new Error(`notice ingest failed: ${run.error?.message || run.stderr?.trim() || run.status}`);
      imported += result.notices.length;
    }
    cursor = result.nextCursor;
    const temp = `${cursorFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ cursor }) + "\n", { mode: 0o600 });
    fs.renameSync(temp, cursorFile);
    if (!result.hasMore) break;
  }
  return { imported, cursor };
}
