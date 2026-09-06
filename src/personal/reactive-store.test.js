import test from "node:test";
import assert from "node:assert/strict";
import { markSeen, pruneStore, selectNewSignals, signalKey } from "./reactive-store.js";

test("selectNewSignals returns unseen signals and dedupes within the batch", () => {
  const store = { seen: {} };
  const a = { source: "Gmail", url: "u1", title: "t1", when: "2026-09-06T10:00:00Z", priority: "P1" };
  const b = { source: "Gmail", url: "u2", title: "t2", when: "2026-09-06T11:00:00Z", priority: "P0" };
  const fresh = selectNewSignals([a, b, { ...a }], store);
  assert.equal(fresh.length, 2);
});

test("markSeen persists keys so a repeated signal stays silent next run", () => {
  const a = { source: "Gmail", url: "u1", title: "t1", when: "2026-09-06T10:00:00Z" };
  const store = markSeen({ seen: {} }, [a], { now: new Date("2026-09-06T10:00:00Z") });
  assert.ok(store.seen[signalKey(a)]);
  assert.equal(selectNewSignals([a], store).length, 0);
});

test("pruneStore drops entries older than the TTL", () => {
  const store = { seen: { old: "2026-09-01T00:00:00Z", recent: "2026-09-06T00:00:00Z" } };
  const pruned = pruneStore(store, { ttlHours: 24, now: new Date("2026-09-06T12:00:00Z") });
  assert.deepEqual(Object.keys(pruned.seen), ["recent"]);
});
