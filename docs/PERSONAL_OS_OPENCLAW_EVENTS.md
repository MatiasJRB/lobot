# Personal OS ↔ OpenClaw event feed

OpenClaw 2026.9.2 runs on Railway. `PERSONAL_OS_OPENCLAW_EVENTS_ENABLED=true`
causes the wrapper to load `src/personal-os/openclaw-events-plugin/index.cjs`,
grant its conversation hook permission, and enable WhatsApp's native
`message_received` hook. The plugin also subscribes to core `message_sent`.
No hook sends a message or authorizes a financial action.

The plugin appends bounded records to `/data/personal-os-openclaw-events.ndjson`
(0600). The bearer-protected `/bridge/api/personal-os/events` route pages this
file by byte cursor. The existing Mac bridge worker polls it into
`/home/usuario/Documents/Codex/personal-organization/private/openclaw-events.ndjson`
and stores a durable cursor beside it (both 0600). Invalid legacy records go
to `openclaw-events-quarantine.ndjson` (0600), so a cold replay cannot be
blocked by the first pre-fix timestamp error. A failed pull does not advance
the cursor or block ordinary Codex jobs. Duplicate append after a crash is
safe because Personal OS reconciliation is keyed by source ID.

`message_received` records provider message ID, account, conversation,
sender, provider time, modality, content hash and bounded preview. The
`source_event_id` is SHA-256 of the NUL-separated
`whatsapp/account/conversation/message` tuple. Provider timestamps may be
seconds or milliseconds; implausible/missing times are not eligible for card
binding. `media` and `originalMedia` are both checked: raw audio and unknown
pending media cannot create a follow-up before interpretation.

`message_sent` records only terminal outcomes from OpenClaw's outbound hook.
Provider success with a message ID is `accepted` (transport acceptance, **not**
recipient delivery); success without one is `uncertain`; terminal failure is
`failed`. No outcome retries automatically. Receipt IDs with `hook:` prefix
are bridge-generated when the provider supplied no message ID. Outbound
correlation uses exact account/conversation/receipt IDs, not mutable model
text or `runId`.

The event feed does **not** automatically assign a card. `personal-os
observe-openclaw` needs exact source event ID, sender ID, card and human/agent
summary; `personal-os observe-openclaw-delivery` needs exact event ID,
recipient ID, message SHA-256, status and card. Both add evidence without
closing a card. The separate Norte WhatsApp financial attestation patch must
not consume this feed as authorization.

Verification on 17 September 2026: two real WhatsApp inbound test messages
crossed Railway → Mac; the second had correct provider time and replayed
idempotently into a temporary Personal OS fixture card. The first exposed a
seconds/milliseconds bug and is deliberately rejected for card binding. The
outbound hook then captured a third real test exchange: one attributed incoming
message and one provider-backed `accepted` send receipt reached the Mac. Both
were bound idempotently to a temporary fixture card; the canonical user DB
was untouched. This proves transport acceptance only, not recipient delivery.
