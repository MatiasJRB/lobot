import assert from "node:assert/strict";
import test from "node:test";

import { formatKnowledgeResults, runKnowledgeQuery } from "./knowledge-query.js";

test("knowledge query uses the bounded Lobot audience and formats citations", () => {
  const calls = [];
  const result = runKnowledgeQuery({ prompt: "viajes" }, {
    root: "/personal-os",
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: JSON.stringify({ results: [{
          title: "Viajes",
          path: "10 Wiki/Areas/Viajes.md",
          summary: "Preferencias y planes de viaje.",
        }] }),
        stderr: "",
      };
    },
  });

  assert.deepEqual(calls[0].args, [
    "/personal-os/bin/personal_os_knowledge.py",
    "search",
    "viajes",
    "--limit",
    "5",
    "--audience",
    "lobot",
  ]);
  assert.equal(calls[0].options.timeout, 15_000);
  assert.equal(result.threadName, "Conocimiento personal");
  assert.match(result.response, /10 Wiki\/Areas\/Viajes\.md/);
});

test("knowledge query returns an explicit empty result", () => {
  assert.match(formatKnowledgeResults("algo", []), /No encontré conocimiento verificado/);
});

test("knowledge results render Obsidian links as readable text", () => {
  const rendered = formatKnowledgeResults("inicio", [{
    title: "Inicio",
    path: "Home.md",
    summary: "Ver [[00 Inbox/README|Inbox]] y [[Mapa del sistema]].",
  }]);
  assert.match(rendered, /Ver Inbox y Mapa del sistema\./);
  assert.doesNotMatch(rendered, /\[\[/);
});
