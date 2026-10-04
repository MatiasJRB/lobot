import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sanitizeAliGroupText } from "./ali-group.js";

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
export const senderKey = (id) => String(id || "").replace(/@s\.whatsapp\.net$/, "").replace(/^\+/, "");
const MENTION = /(?:^|[\s([{"'])@lobot\b/i;

export class AliIntakeState {
  constructor(filename, { groupJid, senders, clock = Date.now, quietMs = 120_000,
    maxWindowMs = 600_000 } = {}) {
    if (!/^\d{10,25}@g\.us$/.test(groupJid || "") || !senders ||
        !Object.keys(senders).length || Object.keys(senders).some((s) => !/^\+?\d{8,16}$/.test(s))) {
      throw new Error("ALI intake exact group/senders are not configured");
    }
    this.filename = filename; this.groupJid = groupJid;
    this.senders = Object.fromEntries(Object.entries(senders).map(([k, v]) => [senderKey(k), v]));
    this.clock = clock; this.quietMs = quietMs; this.maxWindowMs = maxWindowMs;
    const dir = path.dirname(filename);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const ds = fs.lstatSync(dir);
    if (!ds.isDirectory() || ds.isSymbolicLink() || (ds.mode & 0o077)) throw new Error("ALI intake directory is not private");
    if (fs.existsSync(filename)) {
      const st = fs.lstatSync(filename);
      if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077)) throw new Error("ALI intake state is not private");
      this.state = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (this.state.version !== 1 || this.state.groupHash !== hash(groupJid) ||
          !Number.isSafeInteger(this.state.cursor) || this.state.cursor < 0 || !Number.isFinite(this.state.enabledSince) ||
          ["messages", "outbox", "windows", "calls"].some((key) => !Array.isArray(this.state[key]))) throw new Error("ALI intake state is invalid");
    } else {
      this.state = { version: 1, groupHash: hash(groupJid), enabledSince: this.clock(), cursor: 0,
        messages: [], windows: [], calls: [], outbox: [], lastPollAt: null, lastError: null };
      this.save();
    }
  }

  save() {
    const tmp = `${this.filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const fd = fs.openSync(tmp, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.state) + "\n"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.filename);
    const dir = fs.openSync(path.dirname(this.filename), "r");
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }

  ingest(event) {
    if (event?.version !== 1 || event.event_type !== "incoming_message" || event.channel !== "whatsapp" ||
        event.account_id !== "default" || event.conversation_id !== this.groupJid ||
        !this.senders[senderKey(event.sender_id)] || event.finance_authorization !== false ||
        event.timestamp_origin !== "provider" || typeof event.message_id !== "string" ||
        !/^[a-zA-Z0-9+@._:-]{1,200}$/.test(event.message_id) ||
        typeof event.content_preview !== "string") return false;
    const time = Date.parse(event.occurred_at);
    if (!Number.isFinite(time) || time < this.state.enabledSince || time > this.clock() + 120_000) return false;
    const id = hash(["whatsapp", event.account_id, event.conversation_id, event.message_id].join("\0"));
    if (event.source_event_id !== id || this.state.messages.some((m) => m.id === id)) return false;
    const body = sanitizeAliGroupText(event.content_preview, 4000);
    if (body.trimStart().startsWith("🤖 Ali:") || body.trimStart().startsWith("Lobot · QA ALI")) return false;
    const message = { id, messageId: event.message_id, author: this.senders[senderKey(event.sender_id)],
      at: event.occurred_at, body, mention: MENTION.test(body), status: "pending" };
    if (event.modality !== "text" || event.content_truncated || !body.trim()) {
      message.status = "needs_attention"; message.reason = "non_text_or_truncated";
    }
    this.state.messages.push(message);
    // A bounded session is anchored to its first message, not extended forever.
    let window = this.state.windows.findLast((w) => !w.closedAt && this.clock() < w.openedAt + this.maxWindowMs);
    if (!window) {
      window = { id, openedAt: this.clock(), dueAt: this.clock() + this.quietMs, messageIds: [], calls: 0 };
      this.state.windows.push(window);
    }
    window.messageIds.push(id); message.windowId = window.id;
    window.dueAt = Math.min(this.clock() + this.quietMs, window.openedAt + this.maxWindowMs);
    return true;
  }

  async poll(api) {
    // Separate cursor and journal: other chats are discarded, never persisted or passed to the model.
    for (let page = 0; page < 5; page++) {
      const result = await api.listPersonalOsEvents(this.state.cursor, 50);
      if (!result.ok || !Array.isArray(result.events) || !Number.isSafeInteger(result.nextCursor) ||
          result.nextCursor < this.state.cursor || typeof result.hasMore !== "boolean" ||
          (result.events.length && result.nextCursor === this.state.cursor)) throw new Error("ALI event page invalid");
      for (const event of result.events) this.ingest(event);
      this.state.cursor = result.nextCursor;
      this.state.lastPollAt = this.clock(); this.state.lastPollError = null; this.save();
      if (!result.hasMore) break;
    }
  }

  mentionMessages(job) {
    const own = this.state.messages.find((m) => m.messageId === job.reply?.sourceMessageId && m.mention);
    return own?.status === "pending" ? [own] : [];
  }

  dueMessages() {
    const window = this.state.windows.find((w) => !w.closedAt && w.dueAt <= this.clock());
    if (!window) return [];
    // Give explicit mentions time to finish on their normal reply path before a silent consolidation.
    const all = this.state.messages.filter((m) => m.windowId === window.id);
    if (all.some((m) => m.status === "analyzing")) return [];
    const messages = all.filter((m) => m.status === "pending");
    if (messages.some((m) => m.mention) && this.clock() < window.openedAt + this.maxWindowMs) return [];
    if (!messages.length) { window.closedAt = this.clock(); this.save(); return []; }
    return messages;
  }

  reserve(messages) {
    if (!messages.length) return false;
    const window = this.state.windows.find((w) => w.id === messages[0].windowId);
    const recent = this.state.calls.filter((c) => c.at > this.clock() - 86_400_000);
    if (!window || window.calls >= 2 || recent.length >= 20 ||
        recent.filter((c) => c.at > this.clock() - 3_600_000).length >= 8 ||
        messages.length > 16 || messages.reduce((sum, m) => sum + m.body.length, 0) > 12_000) {
      for (const m of messages) { m.status = "needs_attention"; m.reason = "budget_or_context_limit"; }
      this.save(); return false;
    }
    window.calls++; this.state.calls.push({ at: this.clock(), windowId: window.id });
    for (const m of messages) m.status = "analyzing";
    this.save(); return true;
  }

  finish(messages, envelope) {
    for (const m of messages) { m.status = "classified"; m.answer = envelope.answer; }
    for (const item of envelope.items) {
      const cited = messages.filter((m) => item.sourceIds.includes(m.id));
      const key = hash([item.kind, item.title.trim().toLowerCase(), ...item.sourceIds.toSorted()].join("\0"));
      if (!this.state.outbox.some((o) => o.key === key)) this.state.outbox.push({ key,
        item, sources: cited.map(({ id, messageId, author, at, body }) => ({ id, messageId, author, at, body })),
        status: "pending", attempts: 0, createdAt: this.clock(), url: null });
    }
    this.save();
  }

  fail(messages, reason = "classification_failed") {
    for (const m of messages) { m.status = "needs_attention"; m.reason = reason; }
    this.state.lastError = reason; this.save();
  }

  recoverInterrupted() {
    for (const m of this.state.messages) if (m.status === "analyzing") {
      m.status = "needs_attention"; m.reason = "interrupted_model_call";
    }
    // A writing outbox is reconciled by its marker, never blindly resent.
    this.save();
  }

  health() {
    return { enabledSince: this.state.enabledSince, lastPollAt: this.state.lastPollAt,
      messages: this.state.messages.length, classified: this.state.messages.filter((m) => m.status === "classified").length,
      needsAttention: this.state.messages.filter((m) => m.status === "needs_attention").length,
      pendingWrites: this.state.outbox.filter((o) => o.status !== "written").length,
      written: this.state.outbox.filter((o) => o.status === "written").length,
      callsToday: this.state.calls.filter((c) => c.at > this.clock() - 86_400_000).length,
      lastError: this.state.lastError, lastPollError: this.state.lastPollError || null };
  }
}

export function parseAliIntakeEnvelope(raw, messages, { allowedIssues = [] } = {}) {
  const text = String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const data = JSON.parse(text);
  if (!data || typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 1800 ||
      !Array.isArray(data.items) || data.items.length > 3) throw new Error("ALI classification invalid");
  // Reject unsafe output instead of merely hiding it in the public response.
  if (sanitizeAliGroupText(data.answer, 1800) !== data.answer) throw new Error("ALI answer contains reserved data");
  if (/\b(?:ya\s+(?:lo\s+)?(?:registr|implement|correg|cambi|despleg)|registr(?:[eé]\b|ad[oa]\s+en)|agregu[eé]\b|actualic[eé]\b|(?:queda|qued[oó]|est[aá])\s+(?:registrad|implementad|hecho|desplegad)|lo\s+(?:hice|implement[eé]|registr[eé]))/iu.test(data.answer)) {
    throw new Error("ALI answer claims an unverified action");
  }
  const byId = new Map(messages.map((m) => [m.id, m]));
  for (const item of data.items) {
    if (!["definition", "task", "clarify"].includes(item.kind) ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 160 ||
        typeof item.summary !== "string" || !item.summary.trim() || item.summary.length > 1600 ||
        !Array.isArray(item.sourceIds) || !item.sourceIds.length || item.sourceIds.length > 16 ||
        new Set(item.sourceIds).size !== item.sourceIds.length ||
        item.sourceIds.some((id) => !byId.has(id)) ||
        !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 ||
        !(item.issue === null || (Number.isInteger(item.issue) && item.issue > 0 && item.issue < 100_000 && allowedIssues.includes(item.issue))) ||
        sanitizeAliGroupText(item.summary, 1600) !== item.summary ||
        sanitizeAliGroupText(item.title, 160) !== item.title) throw new Error("ALI item lacks valid evidence");
    if (item.confidence < 0.9) item.kind = "clarify";
  }
  return data;
}
