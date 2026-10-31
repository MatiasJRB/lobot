// No registration side effect. An existing host may call this only after approval.
export function createOpenClawAdapter({ whatsapp }) {
  return Object.freeze({
    async beforeDispatch(event, context) {
      try { return await whatsapp.receive(event, context); }
      catch { return { handled: true, error: 'intake-unavailable', retry: false }; }
    },
  });
}
