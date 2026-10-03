import assert from "node:assert/strict";
import test from "node:test";
import { collectAliQaContext, explicitMpPaymentId,
  relevantIssueNumbers } from "./ali-qa-context.js";

test("ALI context fetches QA/refund issues and Project read-only with fixed gh args", async () => {
  const calls = [];
  const token = "gho_ali_existing_credential";
  const exec = (file, args, options) => {
    calls.push(args);
    if (file === "engram") {
      assert.notEqual(options.env?.GH_TOKEN, token);
      return "Found 1 memories:\n#1 — Débito TEST histórico (project: asiento-libre)";
    }
    if (args[0] === "auth") {
      assert.deepEqual(args, ["auth", "token", "--hostname", "github.com", "--user", "MatiasJRB"]);
      assert.equal(options.env.GH_TOKEN, undefined);
      assert.equal(options.env.GITHUB_TOKEN, undefined);
      return token;
    }
    assert.equal(options.env.GH_TOKEN, token);
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    assert.equal(options.env.GH_HOST, "github.com");
    if (args[0] === "api") {
      assert.deepEqual(args, ["api", "user", "--hostname", "github.com", "--jq", ".login"]);
      return "MatiasJRB\n";
    }
    if (args[0] === "issue") return JSON.stringify({ number: Number(args[2]),
      title: "QA TEST", state: "OPEN", body: "Revisar", url: `https://example/${args[2]}` });
    return JSON.stringify({ items: [
      { content: { number: 463, title: "Android QA" }, status: "In progress" },
      { content: { number: 490, title: "MP" }, status: "Todo" },
    ] });
  };
  assert.deepEqual(relevantIssueNumbers("mirá #50000 y issue 463"), [463, 490, 50000]);
  const context = await collectAliQaContext("#463", { cwd: "/repo", exec,
    env: { GH_TOKEN: "ambient_mango", GITHUB_TOKEN: "another_ambient", GH_HOST: "other.host" } });
  assert.deepEqual(context.issues.map((issue) => issue.number), [463, 490]);
  assert.deepEqual(context.project.items.map((item) => item.status), ["In progress", "Todo"]);
  assert.deepEqual(calls.map((args) => args[0]), ["auth", "api", "issue", "issue", "project", "search"]);
  assert.equal(context.engram.historicalOnly, true);
  assert.ok(calls[5].includes("--project"));
  assert.doesNotMatch(JSON.stringify(context), /gho_ali_existing_credential|ambient_mango|another_ambient/);
  assert.ok(calls.every((args) => !args.includes("edit") &&
    (args[0] === "api" || !args.includes("--jq"))));
});

test("ALI context does not use ambient credentials when the stored ALI account is missing", async () => {
  const calls = [];
  const context = await collectAliQaContext("#490", { cwd: "/repo",
    env: { GH_TOKEN: "ambient_mango" },
    exec(file, args) {
      calls.push([file, args[0]]);
      if (file === "engram") return "No historical notes";
      throw new Error("Stored account missing");
    } });
  assert.equal(context.issues[0].unavailable, true);
  assert.equal(context.project.unavailable, true);
  assert.deepEqual(calls, [["gh", "auth"], ["engram", "search"]]);
});

test("ALI context refuses a mismatched credential identity instead of ambient fallback", async () => {
  const calls = [];
  const context = await collectAliQaContext("#490", { cwd: "/repo",
    exec(file, args) {
      calls.push([file, args[0]]);
      if (args[0] === "auth") return "wrong_stored_token";
      if (args[0] === "api") return "lobitodemango\n";
      if (file === "engram") return "No historical notes";
      throw new Error("Must not read issues or Project under the wrong identity");
    } });
  assert.equal(context.issues[0].unavailable, true);
  assert.equal(context.project.unavailable, true);
  assert.deepEqual(calls, [["gh", "auth"], ["gh", "api"], ["engram", "search"]]);
  assert.doesNotMatch(JSON.stringify(context), /wrong_stored_token/);
});

test("ALI context labels unavailable sources rather than inventing state", async () => {
  const context = await collectAliQaContext("@lobot", { cwd: "/repo", exec() {
    throw new Error("offline");
  } });
  assert.equal(context.issues[0].unavailable, true);
  assert.equal(context.project.unavailable, true);
  assert.equal(context.engram.unavailable, true);
});

test("explicit MP TEST payment lookup uses GET and projects no personal fields", async () => {
  assert.equal(explicitMpPaymentId("pago MP 181477664134"), "181477664134");
  assert.equal(explicitMpPaymentId("tarjeta 5287338310253304"), null);
  const calls = [];
  const context = await collectAliQaContext('{"body":"@lobot pago MP 181477664134"}', {
    cwd: "/repo", env: { ALI_QA_MP_TEST_TOKEN: "TEST-12345678901234567890" },
    exec(file, args) {
      if (file !== "gh") return "Found 0 memories:";
      if (args[0] === "auth") return "gho_existing_ali_test";
      if (args[0] === "api") return "MatiasJRB";
      return '{"items":[]}';
    },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return { ok: true, async json() { return { status: "refunded",
        transaction_amount: 3500, payer: { email: "private@example.com" } }; } };
    },
  });
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].url, "https://api.mercadopago.com/v1/payments/181477664134");
  assert.equal(context.mpTest.status, "refunded");
  assert.doesNotMatch(JSON.stringify(context), /private@example.com|TEST-123456/);
});
