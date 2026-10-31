# Historical LOCAL full-host offline gate — 2026-10-31

This evidence covers the first adapter kit, not the whole Lobot agents and tooling
infrastructure map. No complete inventory or integration of agents, tools, skills,
workflows, context, memory and runtimes is claimed by these checks.

Scope of evidence: this record describes the LOCAL checkout with the complete
existing host, not a test suite shipped in the private review branch
`codex/lobot-infrastructure-landing`. That branch carries only the standalone
kit and landing documentation; the test file and nine host dependency modules
are excluded. Its supported checks are bootstrap, artifact verification and
installed module imports. This record does not claim those seven tests are
available to run from the review branch or establish production readiness.

Owner: Lobot Sistema. Result: installed adapter kit verified offline; live host
integration and publication remain separate pending gates.

New source files:

- `src/core/config.js`, `src/core/infrastructure.js`
- `src/adapters/{dot,whatsapp,openclaw,codex}/index.js`
- `config/infrastructure.example.json`, `config/infrastructure.schema.json`
- `scripts/bootstrap-offline.mjs`, `scripts/check-distribution.mjs`
- `tests/offline/infrastructure.test.js`
- `docs/PACKAGE.md`, `docs/PACKAGE_CONTRACTS.md`, `docs/PACKAGE_SECURITY.md`,
  `docs/PACKAGE_BOOTSTRAP.md`, this verification record

Node v24.14.0: seven offline tests pass in less than one second. The ambient
Node 20 was correctly rejected by bootstrap; no runtime installation or global
configuration change was needed. Checks are small local file/CPU operations,
not builds or long-running work; no services, ports or containers were started.

Coverage: clean install and imports from installed modules; manifest tampering,
extra/private files and symlink rejection; external private configuration;
existing durable BridgeStore and CaseCoordinator with fake Codex/webhook ports;
WhatsApp result visibility and a single Dot event; same-case Dot continuation;
duplicate message/request deduplication, completed job replay and restart;
groups, foreign identities/accounts/cases, stale input, absent trusted transport
metadata and assistant echoes; forged queue permissions/destinations; changed
case permissions and uncertain journal rejection. WhatsApp delivery stays
unverified because no provider was called. No native Dot delegation is claimed.

The CLI separately produced an isolated 15-file installation with zero package
dependencies and passed distribution verification and all six module imports in
a fresh process with no user environment. Real configuration, histories, legacy
runtime modules and source seeds are absent from that artifact by allowlist.

All 46 preexisting baseline files retained their SHA-256 hashes. Existing root
package metadata and runtime entrypoints were not edited. No commit, PR, push,
publication, hook registration, service restart, account or channel operation
was performed. This report is repository evidence, outside the artifact allowlist.

Remaining: review the explicit artifact boundary and wire approved host ports
in the sole existing executor before a real-channel gate. The package is an
adapter kit requiring the existing runtime, not an independently running agent.
Whole-repository/history publication is not approved by this offline gate.
