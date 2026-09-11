import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  CodexAppServerClient,
  ThreadSelectorError,
  extractFinalResponse,
  resolveThread,
} from "./app-server-client.js";

const threads = [
  { id: "1", name: "Organiza trámites", preview: "salud", updatedAt: 30, cwd: "/a" },
  { id: "2", name: "Entrenamiento integral", preview: "pierna", updatedAt: 20, cwd: "/b" },
  { id: "3", name: "Organiza trabajo", preview: "Mango", updatedAt: 10, cwd: "/c" },
];

test("resolveThread supports recent, exact ID, exact title and unique substring", () => {
  assert.equal(resolveThread(threads, { kind: "recent", value: null }).id, "1");
  assert.equal(resolveThread(threads, { kind: "id", value: "2" }).id, "2");
  assert.equal(resolveThread(threads, { kind: "title", value: "ENTRENAMIENTO INTEGRAL" }).id, "2");
  assert.equal(resolveThread(threads, { kind: "title", value: "pierna" }).id, "2");
  assert.equal(resolveThread(threads, { kind: "new", value: null }), null);
});

test("resolveThread rejects ambiguous title selectors with candidates", () => {
  assert.throws(
    () => resolveThread(threads, { kind: "title", value: "organiza" }),
    (error) => error instanceof ThreadSelectorError && error.candidates.length === 2,
  );
});

test("extractFinalResponse prefers final answer over commentary", () => {
  assert.equal(
    extractFinalResponse({
      items: [
        { type: "agentMessage", phase: "commentary", text: "trabajando" },
        { type: "agentMessage", phase: "final_answer", text: "listo" },
      ],
    }),
    "listo",
  );
});

function fakeProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("exit", 0, "SIGTERM");
  child.stdin.setEncoding("utf8");
  let input = "";
  child.stdin.on("data", (chunk) => {
    input += chunk;
    let index;
    while ((index = input.indexOf("\n")) >= 0) {
      const line = input.slice(0, index);
      input = input.slice(index + 1);
      if (!line) continue;
      const request = JSON.parse(line);
      if (request.method === "initialize") {
        child.stdout.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
      }
      if (request.method === "thread/list") {
        child.stdout.write(
          `${JSON.stringify({ id: request.id, result: { data: threads, nextCursor: null } })}\n`,
        );
      }
    }
  });
  return child;
}

test("CodexAppServerClient initializes JSON-RPC and lists threads", async (t) => {
  const client = new CodexAppServerClient({ processFactory: fakeProcess });
  t.after(() => client.stop());
  await client.start();
  const result = await client.listThreads();
  assert.deepEqual(result, threads);
});

test("Codex error notifications do not trigger EventEmitter's fatal error event", async (t) => {
  const child = fakeProcess();
  const client = new CodexAppServerClient({ processFactory: () => child });
  t.after(() => client.stop());
  const errors = [];
  client.on("serverError", (value) => errors.push(value));
  await client.start();
  child.stdout.write(`${JSON.stringify({ method: "error", params: { message: "bad model" } })}\n`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [{ message: "bad model" }]);
});
