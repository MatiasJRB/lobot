const crypto = require('node:crypto');
const fs = require('node:fs');

const OUTBOX = process.env.PERSONAL_OS_OPENCLAW_EVENTS_FILE || '/data/personal-os-openclaw-events.ndjson';
const MAX_TEXT = 4000;
const KNOWLEDGE_TIMEOUT_MS = 40_000;
const ALI_MENTION_RE = /(?:^|[\s([{"'])@lobot\b/i;
const ALI_MENTION_MAX_AGE_MS = 15 * 60_000;

function bounded(value, limit = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit ? value : null;
}

function eventTime(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return { occurredAt: new Date().toISOString(), origin: 'bridge_received_at' };
  }
  const milliseconds = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000 ||
      date.getUTCFullYear() > 2100) {
    return { occurredAt: new Date().toISOString(), origin: 'bridge_received_at' };
  }
  return { occurredAt: date.toISOString(), origin: 'provider' };
}

function projectReceived(event, context) {
  if (context?.channelId !== 'whatsapp') return null;
  const accountId = bounded(context.accountId);
  const conversationId = bounded(context.conversationId);
  const messageId = bounded(context.messageId || event?.messageId);
  const senderId = bounded(context.senderId || event?.senderId);
  if (!accountId || !conversationId || !messageId || !senderId) return null;
  const content = typeof event.content === 'string' ? event.content : '';
  const media = [...(Array.isArray(event.media) ? event.media : []),
    ...(Array.isArray(event.originalMedia) ? event.originalMedia : [])];
  const modality = media.some((item) =>
    /audio/i.test(String(item?.contentType || item?.kind || ''))) ? 'audio'
    : (event.mediaStagingPending || media.length) ? 'unknown' : 'text';
  const sourceEventId = crypto.createHash('sha256').update(
    ['whatsapp', accountId, conversationId, messageId].join('\0')).digest('hex');
  const time = eventTime(event.timestamp);
  return {
    version: 1,
    event_type: 'incoming_message',
    source_event_id: sourceEventId,
    channel: 'whatsapp',
    account_id: accountId,
    conversation_id: conversationId,
    message_id: messageId,
    sender_id: senderId,
    occurred_at: time.occurredAt,
    timestamp_origin: time.origin,
    modality,
    content_sha256: crypto.createHash('sha256').update(content).digest('hex'),
    content_preview: content.slice(0, MAX_TEXT),
    content_truncated: content.length > MAX_TEXT,
    // This is a source event, never an authorization or a card decision.
    finance_authorization: false,
  };
}

function projectSent(event, context) {
  if (context?.channelId !== 'whatsapp') return null;
  const accountId = bounded(context.accountId);
  const conversationId = bounded(context.conversationId || event?.to);
  if (!accountId || !conversationId || typeof event?.success !== 'boolean') return null;
  if (event.to && event.to !== conversationId) return null;
  const providerMessageId = bounded(event.messageId);
  const generatedId = crypto.randomUUID();
  const receiptId = providerMessageId || `hook:${generatedId}`;
  const status = event.success ? (providerMessageId ? 'accepted' : 'uncertain') : 'failed';
  const content = typeof event.content === 'string' ? event.content : '';
  return {
    version: 1,
    event_type: 'delivery_receipt',
    source_event_id: crypto.createHash('sha256').update(
      ['sent', 'whatsapp', accountId, conversationId, receiptId].join('\0')).digest('hex'),
    channel: 'whatsapp',
    account_id: accountId,
    conversation_id: conversationId,
    transport_receipt_id: receiptId,
    receipt_origin: providerMessageId ? 'provider' : 'hook_event',
    status,
    occurred_at: new Date().toISOString(),
    timestamp_origin: 'hook_observed_at',
    message_sha256: crypto.createHash('sha256').update(content).digest('hex'),
    finance_authorization: false,
  };
}

function appendEvent(record, filename = OUTBOX) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND |
    (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(filename, flags, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('outbox not private');
    fs.writeSync(fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bridgeBaseUrl(env = process.env) {
  return env.CODEX_BRIDGE_URL?.trim() ||
    `http://127.0.0.1:${env.PORT || 8080}/bridge/api`;
}

async function bridgeRequest(baseUrl, token, pathname, options = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Bridge API HTTP ${response.status}`);
  return payload;
}

async function queryKnowledgeBridge(query, toolCallId, {
  baseUrl = bridgeBaseUrl(),
  token = process.env.CODEX_BRIDGE_TOKEN?.trim(),
  request = bridgeRequest,
  wait = sleep,
  timeoutMs = KNOWLEDGE_TIMEOUT_MS,
  assertCurrent = () => {},
} = {}) {
  const normalized = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!normalized) throw new TypeError('query is required');
  if (!baseUrl || !token) throw new Error('Knowledge bridge is not configured');
  assertCurrent();
  const digest = crypto.createHash('sha256').update(String(toolCallId || crypto.randomUUID()))
    .digest('hex');
  const queued = await request(baseUrl, token, '/jobs', {
    method: 'POST',
    body: JSON.stringify({
      prompt: normalized,
      thread: 'recent',
      mode: 'read-only',
      idempotencyKey: `knowledge-tool:${digest}`,
      source: 'knowledge-hub-query',
    }),
  });
  const jobId = queued?.job?.id;
  if (!jobId) throw new Error('Knowledge bridge did not return a job');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(750);
    const current = await request(baseUrl, token, `/jobs/${encodeURIComponent(jobId)}`);
    const job = current?.job;
    if (job?.status === 'done' && typeof job.response === 'string') return job.response;
    if (job && ['failed', 'needs_attention'].includes(job.status)) {
      throw new Error(job.error || job.response || 'Knowledge query failed');
    }
  }
  throw new Error('Knowledge query timed out');
}

async function captureCommitmentBridge(payload, toolCallId, {
  baseUrl = bridgeBaseUrl(),
  token = process.env.CODEX_BRIDGE_TOKEN?.trim(),
  request = bridgeRequest,
  wait = sleep,
  timeoutMs = KNOWLEDGE_TIMEOUT_MS,
  assertCurrent = () => {},
} = {}) {
  if (!baseUrl || !token) throw new Error('Commitment bridge is not configured');
  assertCurrent();
  const digest = crypto.createHash('sha256').update(String(toolCallId || crypto.randomUUID()))
    .digest('hex');
  const normalized = {
    ...payload,
    source_ref: `openclaw-tool:${digest}`,
    now: new Date().toISOString(),
    channels: ['whatsapp-self'],
  };
  const queued = await request(baseUrl, token, '/jobs', {
    method: 'POST',
    body: JSON.stringify({
      prompt: JSON.stringify(normalized),
      thread: 'recent',
      mode: 'workspace-write',
      idempotencyKey: `commitment-tool:${digest}`,
      source: 'personal-os-commitment-capture',
    }),
  });
  const jobId = queued?.job?.id;
  if (!jobId) throw new Error('Commitment bridge did not return a job');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(750);
    const current = await request(baseUrl, token, `/jobs/${encodeURIComponent(jobId)}`);
    const job = current?.job;
    if (job?.status === 'done' && typeof job.response === 'string') return job.response;
    if (job && ['failed', 'needs_attention'].includes(job.status)) {
      throw new Error(job.error || job.response || 'Commitment capture failed');
    }
  }
  throw new Error('Commitment capture timed out');
}

async function handleAliGroupMention(event, context, {
  env = process.env,
  now = Date.now,
  request = bridgeRequest,
  baseUrl = bridgeBaseUrl(env),
  token = env.CODEX_BRIDGE_TOKEN?.trim(),
} = {}) {
  const groupJid = env.ALI_GROUP_JID?.trim();
  if (!groupJid || context?.channelId !== 'whatsapp' || event?.isGroup !== true ||
      context.conversationId !== groupJid || context.accountId !== 'default') return undefined;

  // Always claim this exact group, even when the feature is off. No group turn
  // may fall through to the generic OpenClaw/Gemini personal assistant.
  const handled = { handled: true };
  if (env.ALI_GROUP_MENTIONS_ENABLED !== 'true') return handled;
  const body = typeof event.body === 'string' ? event.body.trim() : '';
  if (!ALI_MENTION_RE.test(body) || body.startsWith('Lobot · QA ALI')) return handled;
  const messageId = bounded(context.messageId || event.messageId);
  const senderId = bounded(context.senderId || event.senderId);
  const timestamp = Number(event.timestamp);
  const timeMs = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  if (!messageId || !senderId || !Number.isFinite(timeMs) ||
      timeMs < now() - ALI_MENTION_MAX_AGE_MS || timeMs > now() + 2 * 60_000 ||
      body.length > 1500 || !token) return handled;
  try {
    await request(baseUrl, token, '/ali-group/mentions', {
      method: 'POST',
      body: JSON.stringify({
        accountId: context.accountId,
        conversationId: groupJid,
        messageId,
        senderId,
        timestamp,
        body,
        context: typeof event.content === 'string' ? event.content.slice(-2500) : '',
        replyToBody: typeof event.replyToBody === 'string'
          ? event.replyToBody.slice(0, 800) : '',
      }),
    });
  } catch {
    // The queue is the only permitted path. Never fall through to Gemini or
    // print the group message, bearer, or sender into the Railway logs.
  }
  return handled;
}

function knowledgeTool(context) {
  if (context?.senderIsOwner !== true) return null;
  return {
    name: 'knowledge_search',
    label: 'Buscar conocimiento personal',
    description: 'Consulta el Knowledge Hub local de Matías. Usar primero para preguntas como qué sabemos, qué está registrado, qué recordamos o qué contexto existe sobre un tema. Devuelve sólo resultados permitidos y con fuentes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 500,
          description: 'Consulta concreta en español.' },
      },
    },
    async execute(toolCallId, params) {
      const text = await queryKnowledgeBridge(params?.query, toolCallId, {
        assertCurrent: context.assertInvocationCurrent || (() => {}),
      });
      return { content: [{ type: 'text', text }], details: { source: 'knowledge-hub' } };
    },
  };
}

function commitmentTool(context) {
  if (context?.senderIsOwner !== true) return null;
  return {
    name: 'commitment_capture',
    label: 'Registrar compromiso material',
    description: 'Registra o deduplica en Personal OS una compra, entrega, trámite, turno, devolución u otro asunto material con seguimiento. Usar sólo cuando hay un compromiso real y todos los campos, incluido un plazo verificable, están disponibles.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['card_id', 'title', 'domain', 'outcome', 'status', 'priority', 'owner',
        'current_state', 'next_action', 'next_check_at', 'closure_condition',
        'material_kind', 'progress_state', 'deadline_at', 'identities'],
      properties: {
        card_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{1,199}$' },
        title: { type: 'string', minLength: 2, maxLength: 300 },
        domain: { type: 'string', minLength: 2, maxLength: 100 },
        outcome: { type: 'string', minLength: 2, maxLength: 1000 },
        status: { type: 'string', enum: ['ready_for_secretary', 'waiting_external',
          'needs_user_action', 'needs_user_authorization', 'authorized_scheduled_send', 'scheduled'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        owner: { type: 'string', enum: ['secretario', 'matias'] },
        current_state: { type: 'string', minLength: 2, maxLength: 4000 },
        next_action: { type: 'string', minLength: 2, maxLength: 4000 },
        next_check_at: { type: 'string', description: 'ISO-8601 con zona horaria.' },
        closure_condition: { type: 'string', minLength: 2, maxLength: 2000 },
        material_kind: { type: 'string', minLength: 2, maxLength: 80 },
        progress_state: { type: 'string', enum: ['captured', 'prepared', 'sent', 'received',
          'pickup_pending', 'picked_up', 'refund_pending', 'refunded'] },
        deadline_at: { type: 'string', description: 'Plazo real ISO-8601 con zona horaria.' },
        identities: { type: 'array', minItems: 1, maxItems: 10,
          items: { type: 'string', pattern: '^[^:]+:.+$' } },
        amount_value: { type: 'number', minimum: 0 },
        amount_currency: { type: 'string', minLength: 3, maxLength: 12 },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
    async execute(toolCallId, params) {
      const text = await captureCommitmentBridge(params, toolCallId, {
        assertCurrent: context.assertInvocationCurrent || (() => {}),
      });
      return { content: [{ type: 'text', text }], details: { source: 'personal-os' } };
    },
  };
}

module.exports = {
  id: 'personal-os-events',
  register(api) {
    if (typeof api.registerTool === 'function') {
      api.registerTool(knowledgeTool, { name: 'knowledge_search' });
      api.registerTool(commitmentTool, { name: 'commitment_capture' });
    }
    api.on('message_received', (event, context) => {
      const record = projectReceived(event, context);
      if (!record) return;
      try { appendEvent(record); }
      catch { api.logger?.warn?.('personal-os-events: private outbox unavailable'); }
    });
    api.on('message_sent', (event, context) => {
      const record = projectSent(event, context);
      if (!record) return;
      try { appendEvent(record); }
      catch { api.logger?.warn?.('personal-os-events: private outbox unavailable'); }
    });
    api.on('before_dispatch', (event, context) =>
      handleAliGroupMention(event, context));
  },
  projectReceived,
  projectSent,
  appendEvent,
  eventTime,
  queryKnowledgeBridge,
  captureCommitmentBridge,
  bridgeBaseUrl,
  knowledgeTool,
  commitmentTool,
  handleAliGroupMention,
};
