import { validateConfig } from './config.js';

// Ports only: persistence, leases, sessions and reconciliation belong to the host.
export function createInfrastructure({ config, queue, cases }) {
  const settings = validateConfig(config);
  if (typeof queue?.enqueueJob !== 'function' || typeof cases?.entry !== 'function')
    throw new Error('Existing queue and case adapter required');
  function entry(id) {
    if (!settings.cases.includes(id)) throw new Error('Case outside configured scope');
    const found = cases.entry(id);
    if (found.id !== id || found.mode !== 'read-only' || found.adapter === 'existing-owner' ||
        found.availability === 'reference-only') throw new Error('Case unavailable to this package');
    return found;
  }
  async function enqueue(input) {
    const p = JSON.parse(input.prompt);
    // All routing is exact. No aliases, previous conversation or recent fallback.
    const id = p.caseId || p.selector;
    entry(id);
    if (input.source !== 'coordinator-ingress' || input.mode !== 'read-only' ||
        p.version !== 1 || !['whatsapp', 'codex'].includes(p.channel) ||
        typeof p.text !== 'string' || !p.text.trim() || p.text.length > 4000 ||
        /mango/i.test(p.text) || typeof input.idempotencyKey !== 'string' ||
        !input.idempotencyKey || input.idempotencyKey.length > 240 ||
        input.thread !== 'new' || input.cwd !== undefined ||
        (p.caseId && p.selector && p.caseId !== p.selector) ||
        (p.channel === 'codex' && input.reply) ||
        (p.channel === 'whatsapp' && (input.reply?.channel !== 'whatsapp-self' ||
          input.reply?.policy !== 'always' || Object.keys(input.reply).length !== 2)))
      throw new Error('Invalid scoped queue request');
    return queue.enqueueJob({ ...input, prompt: JSON.stringify({ ...p, caseId: id }) });
  }
  return Object.freeze({ entry, enqueue, config: () => structuredClone(settings) });
}
