import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";

test("tunnel server tolerates hosted discovery and duplicate initialize", async () => {
  const child = spawn(process.execPath, [path.resolve("src/mcp/personal-os-tunnel-server.js")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });

  const messages = [
    { jsonrpc: "2.0", id: "discover", method: "server/discover" },
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
  ];
  child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  const [code] = await once(child, "exit");
  assert.equal(code, 0);

  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].error.code, -32601);
  assert.equal(responses[1].result.serverInfo.name, "personal-os-readonly");
  assert.equal(responses[2].result.serverInfo.name, "personal-os-readonly");
  assert.deepEqual(responses[3].result.tools.map((tool) => tool.name), [
    "personal_os_search",
    "personal_os_get_card",
    "personal_os_executive_inbox",
    "personal_os_read_note",
  ]);
  assert.ok(responses[3].result.tools.every((tool) => tool.annotations.readOnlyHint));
});
