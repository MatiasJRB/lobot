import fs from "node:fs";

export const DEFAULT_OPENCLAW_EVENT_OUTBOX = "/data/personal-os-openclaw-events.ndjson";
const PAGE_BYTES = 256 * 1024;

export function readOpenclawEventPage(filename, { cursor = 0, limit = 50 } = {}) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("invalid cursor or limit");
  }
  let fd;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  } catch (error) {
    if (error.code === "ENOENT") return { events: [], nextCursor: 0, hasMore: false };
    throw error;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("outbox not private");
    if (cursor > stat.size) throw new TypeError("cursor beyond outbox");
    const length = Math.min(PAGE_BYTES, stat.size - cursor);
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, cursor);
    const lastNewline = buffer.lastIndexOf(10, read - 1);
    if (read && lastNewline < 0) throw new Error("outbox record exceeds page");
    const complete = lastNewline < 0 ? Buffer.alloc(0) : buffer.subarray(0, lastNewline + 1);
    const lines = complete.toString("utf8").split("\n").filter(Boolean);
    const selected = lines.slice(0, limit);
    const events = selected.map((line) => JSON.parse(line));
    const nextCursor = cursor + Buffer.byteLength(selected.map((line) => `${line}\n`).join(""));
    return { events, nextCursor, hasMore: nextCursor < stat.size };
  } finally {
    fs.closeSync(fd);
  }
}
