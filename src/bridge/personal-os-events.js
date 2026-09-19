import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PERSONAL_OS_EVENT_DIR = path.join(os.homedir(),
  "Documents/Codex/personal-organization/private");

function readCursor(filename) {
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("cursor is not private");
    const cursor = JSON.parse(fs.readFileSync(filename, "utf8")).cursor;
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid cursor");
    return cursor;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

function validateEvent(event) {
  if (!event || event.version !== 1 || event.channel !== "whatsapp" ||
      !/^[0-9a-f]{64}$/.test(event.source_event_id) ||
      [event.account_id, event.conversation_id]
        .some((value) => typeof value !== "string" || !value || value.length > 200) ||
      typeof event.occurred_at !== "string" || Number.isNaN(Date.parse(event.occurred_at)) ||
      new Date(event.occurred_at).getUTCFullYear() < 2000 ||
      new Date(event.occurred_at).getUTCFullYear() > 2100 ||
      event.finance_authorization !== false) return false;
  if (event.event_type === "incoming_message") {
    return [event.message_id, event.sender_id]
      .every((value) => typeof value === "string" && value.length > 0 && value.length <= 200) &&
      ["text", "audio", "unknown"].includes(event.modality) &&
      event.timestamp_origin === "provider" &&
      typeof event.content_sha256 === "string" && /^[0-9a-f]{64}$/.test(event.content_sha256) &&
      typeof event.content_preview === "string" && event.content_preview.length <= 4000 &&
      typeof event.content_truncated === "boolean";
  }
  return event.event_type === "delivery_receipt" &&
    ["accepted", "failed", "uncertain"].includes(event.status) &&
    typeof event.transport_receipt_id === "string" &&
    event.transport_receipt_id.length > 0 && event.transport_receipt_id.length <= 200 &&
    ["provider", "hook_event"].includes(event.receipt_origin) &&
    (event.status !== "accepted" || event.receipt_origin === "provider") &&
    event.timestamp_origin === "hook_observed_at" &&
    typeof event.message_sha256 === "string" && /^[0-9a-f]{64}$/.test(event.message_sha256);
}

export async function pullPersonalOsEvents(api, { directory = DEFAULT_PERSONAL_OS_EVENT_DIR,
  maxPages = 5 } = {}) {
  const dirStat = fs.statSync(directory);
  if (!dirStat.isDirectory() || (dirStat.mode & 0o077) !== 0) {
    throw new Error("Personal OS event directory is not private");
  }
  const cursorFile = path.join(directory, "openclaw-event-cursor.json");
  const inboxFile = path.join(directory, "openclaw-events.ndjson");
  const quarantineFile = path.join(directory, "openclaw-events-quarantine.ndjson");
  let cursor = readCursor(cursorFile);
  let imported = 0;
  let quarantined = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await api.listPersonalOsEvents(cursor, 50);
    if (!result.ok || !Array.isArray(result.events) ||
      !Number.isSafeInteger(result.nextCursor) || result.nextCursor < cursor ||
      typeof result.hasMore !== "boolean" ||
      (result.events.length > 0 && result.nextCursor === cursor)) {
      throw new Error("Invalid OpenClaw event page");
    }
    const valid = result.events.filter(validateEvent);
    const invalid = result.events.filter((event) => !validateEvent(event));
    for (const [filename, events] of [[quarantineFile, invalid], [inboxFile, valid]]) {
      if (!events.length) continue;
      const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT |
        fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("event file is not private");
        fs.writeSync(fd, events.map((event) => JSON.stringify(event) + "\n").join(""));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    }
    imported += valid.length;
    quarantined += invalid.length;
    cursor = result.nextCursor;
    const tmp = `${cursorFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ cursor }) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, cursorFile);
    if (!result.hasMore) break;
  }
  return { imported, quarantined, cursor };
}
