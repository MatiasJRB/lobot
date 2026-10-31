// Delegate MCP behavior to the existing adapter, including durable event receipts.
export function createDotAdapter({ infrastructure, cases, events }) {
  return Object.freeze({
    status(id) { infrastructure.entry(id); return cases.status(id); },
    job(id, jobId) { infrastructure.entry(id); return cases.job(id, jobId); },
    ask({ case_id, request_id, text }) {
      infrastructure.entry(case_id);
      if (typeof request_id !== 'string' || !/^[a-zA-Z0-9:_-]{8,160}$/.test(request_id) || typeof text !== 'string' ||
          !text.trim() || text.length > 2000) throw new Error('Invalid Dot request');
      return infrastructure.enqueue({ source: 'coordinator-ingress', thread: 'new', mode: 'read-only',
        prompt: JSON.stringify({ version: 1, channel: 'codex', caseId: case_id, text }),
        idempotencyKey: `case-dot:${case_id}:${request_id}` });
    },
    subscribe(params) {
      infrastructure.entry(params?.arguments?.case_id);
      if (typeof events?.subscribe !== 'function') throw new Error('Existing MCP event adapter required');
      return events.subscribe(params);
    },
    flushResults() {
      if (typeof events?.kick !== 'function') throw new Error('Existing MCP event adapter required');
      return events.kick();
    },
  });
}
