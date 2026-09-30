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

function lateExitProcess() {
  const child = fakeProcess();
  child.killedWith = null;
  // A real app-server exits some time after SIGTERM, not synchronously.
  child.kill = (signal) => {
    child.killedWith = signal;
  };
  return child;
}

test("a recycled app-server that exits late does not orphan its replacement", async () => {
  const spawned = [];
  const client = new CodexAppServerClient({
    processFactory: () => {
      const child = lateExitProcess();
      spawned.push(child);
      return child;
    },
  });
  await client.start();
  const [first] = spawned;
  client.stop();
  assert.equal(first.killedWith, "SIGTERM");

  await client.start();
  const [, second] = spawned;
  first.emit("exit", 0, null);

  assert.deepEqual(await client.listThreads(), threads);
  client.stop();
  assert.equal(second.killedWith, "SIGTERM");
});

test("ALI QA runner pins thread, read-only sandbox and no network without personal prompt", async () => {
  const client = new CodexAppServerClient();
  const calls = [];
  const threadId = "0199abcd-aaaa-bbbb-cccc-123456789012";
  client.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/resume") return { thread: { id: threadId } };
    if (method === "turn/start") return { turn: { id: "turn-1" } };
    throw new Error(method);
  };
  client.waitForTurn = async () => ({ status: "completed", items: [
    { type: "agentMessage", phase: "final_answer", text: "Usá tarjeta TEST." },
  ] });
  const result = await client.runAliQaJob({ id: "job-1", source: "ali-group-mention",
    mode: "read-only", reply: { channel: "whatsapp-ali-group" },
    prompt: '{"body":"@lobot cómo pruebo débito?"}' },
  { threadId, cwd: "/ali", context: { issues: [{ number: 463 }] } });
  assert.equal(result.response, "Usá tarjeta TEST.");
  assert.equal(calls[0].params.threadId, threadId);
  assert.equal(calls[0].params.approvalPolicy, "never");
  assert.deepEqual(calls[1].params.sandboxPolicy, { type: "readOnly", networkAccess: false });
  assert.doesNotMatch(calls[1].params.input[0].text, /Secretario Personal/);
  await assert.rejects(() => client.runJob({ source: "ali-group-mention" }), /dedicated runner/);
});

test("ALI QA suppresses any response if a tool slips into an isolated turn", async () => {
  const client = new CodexAppServerClient();
  const threadId = "0199abcd-aaaa-bbbb-cccc-123456789012";
  client.request = async (method) => method === "thread/resume"
    ? { thread: { id: threadId } } : { turn: { id: "turn-1" } };
  client.waitForTurn = async () => ({ status: "completed", items: [
    { type: "mcpToolCall", server: "engram", tool: "mem_save" },
    { type: "agentMessage", phase: "final_answer", text: "No enviar" },
  ] });
  await assert.rejects(() => client.runAliQaJob({ id: "job-1", source: "ali-group-mention",
    mode: "read-only", reply: { channel: "whatsapp-ali-group" }, prompt: '{"body":"@lobot"}' },
  { threadId, cwd: "/ali", context: {} }), /tool use detected/);
});
