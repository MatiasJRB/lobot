// The native ingress parser is supplied by the existing OpenClaw host.
export function createWhatsAppAdapter({ infrastructure, handleCaseIngress, clock = Date.now }) {
  if (typeof handleCaseIngress !== 'function') throw new Error('Existing ingress required');
  return Object.freeze({
    async receive(event, context) {
      // Outbound echoes and forwarded provider callbacks must never become work.
      if (event?.direction !== 'inbound' || event?.origin !== 'human' || event?.isGroup !== false ||
          event?.generatedBy || event?.isEcho || event?.fromAssistant ||
          context?.accountId !== infrastructure.config().whatsapp.accountId)
        return { handled: false, reason: 'ignored' };
      const result = await handleCaseIngress(event, context, {
        env: { WHATSAPP_PERSONAL_TARGET: infrastructure.config().whatsapp.self },
        now: clock, request: input => infrastructure.enqueue(input),
      });
      return result || { handled: false, reason: 'ignored' };
    },
  });
}
