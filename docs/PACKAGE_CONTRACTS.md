# Ports and ownership — first adapter kit

These contracts cover Lobot’s first offline adapter component. They do not
constitute a complete contract or inventory for the broader agents, tools, MCP,
skills, workflows, context, memory and runtimes architecture described in README.

`createInfrastructure({config, queue, cases})` accepts the existing authenticated
BridgeApiClient-compatible queue (`enqueueJob`) and DotCaseAdapter (`entry`).
Configuration supplies a list of exact canonical case IDs. Each must also pass
the host's registry/provenance/permission checks. Only read-only cases are allowed.
No routing by most recent case, fuzzy alias or implicit conversation binding.

`createWhatsAppAdapter({infrastructure, handleCaseIngress, clock})` receives the
host's native ingress function. The transport must supply trusted `direction:
'inbound'`, `origin: 'human'`, `isGroup: false`, account, sender, conversation,
message ID and timestamp metadata. These are provider metadata, never inferred
from the message text. Missing metadata fails closed. Self-origin human notes
are allowed; outbound assistant echoes are rejected. The host parser checks
freshness and exact configured self identity. Input: `codex en demo: inspect`.
Failures in `createOpenClawAdapter().beforeDispatch` are handled with no model
fallback, automatic resend or dispatch. This module registers no hooks.

`createCodexAdapter({infrastructure, coordinator, client}).executeClaimed(job)`
is called ONLY by the host's existing queue owner, after claiming the lease.
It delegates to CaseCoordinator.run; it never polls, claims or completes leases.
The host retains durable single-writer enforcement, checkpoints and uncertain
turn reconciliation. The in-process busy guard is not a distributed lock.

`createDotAdapter({infrastructure, cases, events})` delegates status/job reads
and MCP subscriptions to existing adapters. ask enqueues with a stable request
ID and no WhatsApp reply. Events are evidence: they do not enqueue or send.
`flushResults()` delegates to the existing event adapter, not another watcher.
The host handles subscription renewal and webhook delivery using its existing
implementation. No native Dot delegation is claimed by this package.

Duplicate provider IDs produce the same queue idempotency key. The durable
queue decides deduplication; the journal prevents completed work from replaying.
Jobs and event receipts are distinct from WhatsApp delivery receipts. A done
job without a verified provider receipt stays unverified; this kit has no send API.

Minimal composition (no live credentials or auto-registration):

```js
const infrastructure = createInfrastructure({ config, queue: existingApi, cases: existingCases });
const whatsapp = createWhatsAppAdapter({ infrastructure, handleCaseIngress: nativeIngress });
const openclaw = createOpenClawAdapter({ whatsapp });
const codex = createCodexAdapter({ infrastructure, coordinator: existingCoordinator, client: existingClient });
const dot = createDotAdapter({ infrastructure, cases: existingCases, events: existingEvents });
```

The host imports the named factory from each adapter's `index.js`. Config is
loaded with `loadPrivateConfig(absoluteFile, {packageRoot: installDirectory})`.
Only the existing worker may invoke the Codex facade; creating another worker
or registering a second hook is outside this package's contract.
