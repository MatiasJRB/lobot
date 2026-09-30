import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getPersonalOsCard,
  readKnowledgeNote,
  searchPersonalOs,
} from "./personal-os-tools.js";

function fakeSpawn(_command, args) {
  const payload = args.includes("cards")
    ? { cards: [{ id: "trip", title: "Viaje a Córdoba", domain: "travel", status: "active", current_state: "Mirando fechas", next_action: "Comparar vuelos" }] }
    : args.includes("card")
      ? { ok: true, card: { id: args.at(-1), title: "Viaje a Córdoba" } }
      : { results: [{ path: "10 Wiki/viajes.md", title: "Viajes", summary: "Preferencias de viaje" }] };
  return { status: 0, stdout: JSON.stringify(payload), stderr: "" };
}

test("search combines matching cards and verified notes", () => {
  const result = searchPersonalOs("qué sabemos de viajes", { root: "/tmp/os", spawnSync: fakeSpawn });
  assert.equal(result.cards[0].id, "trip");
  assert.equal(result.notes[0].path, "10 Wiki/viajes.md");
  assert.match(result.caveat, /does not prove/);
});

test("get card validates the exact id", () => {
  assert.equal(getPersonalOsCard("trip", { root: "/tmp/os", spawnSync: fakeSpawn }).card.id, "trip");
  assert.throws(() => getPersonalOsCard("../secret", { root: "/tmp/os", spawnSync: fakeSpawn }), /invalid card id/);
});

test("read note rejects restricted notes and path traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-mcp-"));
  const vault = path.join(root, "knowledge-hub");
  fs.mkdirSync(path.join(vault, "10 Wiki"), { recursive: true });
  fs.writeFileSync(path.join(vault, "10 Wiki", "ok.md"), "---\nstatus: verified\nvisibility: private\n---\n# OK\nDato", "utf8");
  fs.writeFileSync(path.join(vault, "10 Wiki", "blocked.md"), "---\nstatus: verified\nvisibility: restricted\n---\n# No\nDato", "utf8");
  fs.writeFileSync(path.join(root, "outside.md"), "secret", "utf8");
  assert.match(readKnowledgeNote("10 Wiki/ok.md", { root }).content, /Dato/);
  assert.throws(() => readKnowledgeNote("10 Wiki/blocked.md", { root }), /not available/);
  assert.throws(() => readKnowledgeNote("../outside.md", { root }), /escapes/);
});
