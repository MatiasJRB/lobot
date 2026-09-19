# OpenClaw WhatsApp ingress attestation patch

## Status

Prepared locally for `@openclaw/whatsapp@2026.9.2`. This repository does not install,
activate, or deploy the patch automatically.

Artifact: `patches/openclaw-whatsapp/2026.9.2-ingress-attestation.patch`  
SHA-256: `7900fa5972dd7afdc28d954109c018ffa7d8cded6ce833ac94f5c1e93eec16c9`

## Problem

OpenClaw's stock WhatsApp pipeline preserves canonical message identity for hooks but drops the
raw Baileys facts that distinguish a direct text message from a forwarded message or another
modality. Norte must not treat model arguments, transcripts, or reconstructed text as human
authorization for a financial action.

## Acceptance criteria

- Capture current-message modality, forwarding flag, and forwarding score before normalization
  loses them; never inspect forwarding metadata from the quoted message.
- Treat only a provider `conversation` or `extendedTextMessage.text` as written text. Button,
  list, template, and interactive/native-flow responses stay `unknown` and non-authorizing even
  if OpenClaw later maps a selected ID such as `CONFIRMAR NF-...` into canonical content.
- Keep raw facts outside prompt, transcript, structured context, and model/tool arguments.
- After `prepareWhatsAppInboundContext`, use `deriveInboundMessageHookContext` for account,
  sender, message, session, reply, timestamp, recipient, and exact content. For OpenClaw 2026.9.2
  WhatsApp, project the hook conversation from the canonical recipient (`to`) and take direct/group
  status from the trusted inbound admission, not optional display metadata.
- Hash the exact UTF-8 bytes of `canonical.content` and sign the strict
  `norte.whatsapp-ingress.v1` envelope with HMAC-SHA256.
- Emit one bounded NDJSON frame over a private Unix socket and wait a bounded time before hooks;
  classify it as acknowledged only after an exact ACK. Socket/key/config failure must leave
  normal WhatsApp dispatch available while financial confirmation stays governed exclusively by
  Norte's durable HMAC-bound proof.
- Emit only for an exact trusted `(accountId, conversationId, senderId)` allowlist.
- Batched/debounced multi-message bodies intentionally receive no attestation because no single
  provider message proves the aggregate content; financial authorization therefore fails closed.
- Disable by default. Do not generate keys, log secrets/envelopes/identifiers, expose a model
  tool, or add an HTTP endpoint.
- Reject unsupported versions and baseline drift before applying the patch.
- Cover direct, forwarded, quoted-forwarded, audio, wrapper, invalid config/scope, tampering,
  interactive-ID fallback, ACK, NACK, timeout, uncertainty, and oversize behavior with synthetic
  tests.

## Delivery outcome semantics

An exact `ACK <attestation_id>\n` proves that the sender observed the receiver's durable commit.
An explicit `NACK INVALID\n` or a failure to connect is absence/rejection. Once connected, a
timeout, malformed ACK, trailing bytes, or disconnect without ACK is **uncertain**: Norte may have
committed and lost the ACK. The patch does not retry automatically and does not ask the human for
a new authorization based on transport outcome; Norte's persisted, verified proof remains the
only authorization authority.

## Explicit exclusions

- No production installation, activation, deployment, environment changes, key generation,
  WhatsApp sends, or real financial data.
- No change to Norte's receiver or authorization binder.
- No permanent OpenClaw fork.

## Prepared runtime contract

The patched emitter reads configuration only when explicitly enabled:

| Variable | Meaning |
| --- | --- |
| `NORTE_WHATSAPP_INGRESS_ATTESTATION_ENABLED` | Must equal `true`. |
| `NORTE_WHATSAPP_INGRESS_ATTESTATION_SOCKET` | Absolute Unix socket path, max 100 UTF-8 bytes. |
| `NORTE_WHATSAPP_INGRESS_ATTESTATION_HMAC_KEY_ENV` | Name of the environment variable containing the exact HMAC key bytes. |
| `NORTE_WHATSAPP_INGRESS_ATTESTATION_ALLOWED_ROUTES_JSON` | JSON array of exact `{accountId,conversationId,senderId}` tuples. Missing, empty, malformed, or non-matching scope denies emission. |

The referenced key must be 32–4096 UTF-8 bytes, must be distinct from any finance/Gateway
token, and is never trimmed or generated. The receiver remains authoritative for signature,
freshness, route, replay, and durable-commit validation.

## Apply gate

Use `scripts/prepare-openclaw-whatsapp-ingress-attestation.mjs` against an exact clean source
checkout. The script verifies package version and SHA-256 baselines before running
`git apply --check`; applying requires an explicit `--apply` flag. After apply, run the focused
synthetic test and OpenClaw's WhatsApp typecheck before any separate rollout decision.
