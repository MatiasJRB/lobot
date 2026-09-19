import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readOpenclawEventPage } from "../personal-os/openclaw-event-outbox.js";

export const DEFAULT_NOTICE_OUTBOX = "/data/personal-os-notices.ndjson";
const FIELDS = new Set(["source", "eventId", "title", "summary", "occurredAt", "cardId", "importance"]);

function required(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new TypeError(`${name} must be non-empty plain text (<=${max})`);
  }
  return value.trim();
}

export function normalizeNotice(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !FIELDS.has(key))) throw new TypeError("invalid notice fields");
  const source = required(input.source, "source", 100);
  const eventId = required(input.eventId, "eventId", 200);
  const title = required(input.title, "title", 160);
  const summary = required(input.summary, "summary", 1500);
  const occurredAt = required(input.occurredAt, "occurredAt", 40);
  const when = new Date(occurredAt);
  if (Number.isNaN(when.getTime()) || when.getUTCFullYear() < 2000 ||
      when.getUTCFullYear() > 2100 || when.getTime() > Date.now() + 86_400_000) {
    throw new TypeError("invalid occurredAt");
  }
  const importance = input.importance ?? "normal";
  if (!["normal", "high"].includes(importance)) throw new TypeError("invalid importance");
  const cardId = input.cardId == null ? null : required(input.cardId, "cardId", 200);
  const id = crypto.createHash("sha256").update(`${source}\0${eventId}`).digest("hex");
  return { version: 1, id, source, eventId, title, summary,
    occurredAt: when.toISOString(), cardId, importance };
}

export function appendNotice(filename, input) {
  const notice = normalizeNotice(input);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(filename, fs.constants.O_RDWR | fs.constants.O_CREAT |
    (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("notice outbox not private");
    // One Railway process owns this append-only stream. Reject conflicting retries.
    const existing = fs.readFileSync(fd, "utf8").split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).find((row) => row.id === notice.id);
    if (existing) {
      const { receivedAt: _receivedAt, ...prior } = existing;
      if (JSON.stringify(prior) !== JSON.stringify(notice)) throw new TypeError("eventId already used with different content");
      return { notice: existing, created: false };
    }
    const record = { ...notice, receivedAt: new Date().toISOString() };
    fs.writeSync(fd, JSON.stringify(record) + "\n", null, "utf8");
    fs.fsyncSync(fd);
    return { notice: record, created: true };
  } finally { fs.closeSync(fd); }
}

export function readNoticePage(filename, options) {
  const page = readOpenclawEventPage(filename, options);
  return { notices: page.events, nextCursor: page.nextCursor, hasMore: page.hasMore };
}
