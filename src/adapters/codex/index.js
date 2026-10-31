// Called by the sole queue owner after it claims a job. Never claims or polls.
export function createCodexAdapter({ infrastructure, coordinator, client }) {
  if (typeof coordinator?.run !== 'function' || !client) throw new Error('Existing executor required');
  let busy = false;
  return Object.freeze({
    async executeClaimed(job) {
      if (busy) throw new Error('Existing executor is busy; preserve queue lease');
      const payload = JSON.parse(job.prompt);
      const entry = infrastructure.entry(payload.caseId || payload.selector);
      if (job.source !== 'coordinator-ingress' || job.status !== 'running' || !job.workerId ||
          job.mode !== entry.mode || payload.version !== 1 ||
          !['whatsapp', 'codex'].includes(payload.channel)) throw new Error('Claimed scoped job required');
      busy = true;
      try { return await coordinator.run(job, client); }
      finally { busy = false; }
    },
  });
}
