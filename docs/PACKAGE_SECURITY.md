# Scope and release boundary — first adapter kit

This document covers the implemented offline kit, one component of Lobot’s
agents and tooling infrastructure. Its checks do not establish security coverage
for the entire target architecture or integrations outside this repository audit.

Configuration must be explicit, outside the installation, in a private directory
with a regular owner-readable-only file. The loader rejects symlinks, extra keys,
oversized config, unsupported accounts, write mode and excluded case IDs.
The example uses only fictional identifiers. Secrets are host-owned and never
accepted by the package schema, copied, logged or inherited into model context.

Host registry checks remain authoritative. Routing filters do not provide OS
isolation. All non-allowlisted cases, groups, other accounts and assistant echoes
are rejected. Provider metadata must be trustworthy. This first release accepts
only self notes; group/assistant-number support requires a separate contract.
No financial, account, publishing, external send or deployment action is enabled.

The offline installer reads an explicit file allowlist and rejects symlinks,
path escapes and obvious private content. The verifier rejects extra files and
checks manifest hashes and exact package metadata. This is a packaging boundary,
not a universal secret detector or cryptographic release signature. Human review
of the allowlisted artifact and upstream license/provenance is required before
publishing. Never publish the working repository or its history as this artifact.

Uncertain execution and delivery stay with the host reconciliation path. This
package does not reset journals, retry an uncertain send or recover corrupt
queue state. The current host queue's recovery behavior remains a host limitation.
No production host wiring, native Dot capability, session or service restart is
validated by offline tests. Live activation needs a separate explicit approval.
