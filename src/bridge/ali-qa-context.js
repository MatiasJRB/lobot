import { execFileSync } from "node:child_process";
import { sanitizeAliGroupText } from "./ali-group.js";

const REPO = "MatiasJRB/asiento-libre";
const ISSUE_URL = "https://github.com/MatiasJRB/asiento-libre/issues/";
const MAX_ISSUES = 4;

function ghJson(args, { cwd, exec = execFileSync } = {}) {
  const output = exec("gh", args, { cwd, encoding: "utf8", timeout: 12_000,
    maxBuffer: 2_000_000, stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(output);
}

export function relevantIssueNumbers(prompt) {
  const referenced = [...String(prompt).matchAll(/(?:issue\s*|#)(\d{1,5})\b/gi)]
    .map((match) => Number(match[1])).filter((number) => number > 0);
  return [...new Set([463, 490, ...referenced])].slice(0, MAX_ISSUES);
}

export function explicitMpPaymentId(question) {
  const match = String(question).match(/\b(?:mp[_ -]?payment[_ -]?id|payment[_ -]?id|pago\s+MP|payment\s+MP)\s*[:=#]?\s*(\d{8,15})\b/i);
  return match?.[1] || null;
}

async function mpTestPayment(question, { env = process.env, fetchImpl = fetch } = {}) {
  const paymentId = explicitMpPaymentId(question);
  if (!paymentId) return null;
  const token = env.ALI_QA_MP_TEST_TOKEN?.trim() || "";
  if (!token.startsWith("TEST-") || token.length < 20) {
    return { paymentId, unavailable: "TEST token not configured" };
  }
  try {
    const response = await fetchImpl(`https://api.mercadopago.com/v1/payments/${paymentId}`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { paymentId, unavailable: `MP TEST GET HTTP ${response.status}` };
    const data = await response.json();
    return { paymentId, status: data.status || null, statusDetail: data.status_detail || null,
      method: data.payment_method_id || null, type: data.payment_type_id || null,
      amount: Number.isFinite(data.transaction_amount) ? data.transaction_amount : null,
      refundedAmount: Number.isFinite(data.transaction_amount_refunded)
        ? data.transaction_amount_refunded : null, source: "MP TEST GET /v1/payments/{id}" };
  } catch { return { paymentId, unavailable: "MP TEST GET failed" }; }
}

export async function collectAliQaContext(prompt, { cwd, exec = execFileSync,
  env = process.env, fetchImpl = fetch } = {}) {
  let question = String(prompt);
  try { question = JSON.parse(prompt).body || question; } catch { /* Already plain text. */ }
  const issueNumbers = relevantIssueNumbers(prompt);
  const issues = issueNumbers.map((number) => {
    try {
      const data = ghJson(["issue", "view", String(number), "--repo", REPO,
        "--json", "number,title,state,body,url,updatedAt,labels,comments"], { cwd, exec });
      return { number, title: data.title, state: data.state, url: data.url,
        updatedAt: data.updatedAt, body: String(data.body || "").slice(0, 3500),
        labels: (data.labels || []).map((label) => label.name).slice(0, 10),
        latestComments: (data.comments || []).slice(-1).map((comment) => ({
          createdAt: comment.createdAt, body: String(comment.body || "").slice(0, 1000),
        })) };
    } catch { return { number, url: `${ISSUE_URL}${number}`, unavailable: true }; }
  });
  let project = { url: "https://github.com/orgs/MatiasJRB/projects/4", unavailable: true };
  try {
    const data = ghJson(["project", "item-list", "4", "--owner", "MatiasJRB",
      "--format", "json", "--limit", "300"], { cwd, exec });
    project = { url: project.url, items: (data.items || []).filter((item) =>
      issueNumbers.some((number) => item.content?.number === number))
      .map((item) => ({ number: item.content?.number,
        title: item.content?.title, status: item.status || null })) };
  } catch { /* Do not invent Project state when GitHub is unavailable. */ }
  let engram = { unavailable: true };
  try {
    const query = String(question).replace(/@lobot\b/gi, "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (query) {
      const raw = exec("engram", ["search", query, "--project", "asiento-libre", "--limit", "3"],
        { cwd, encoding: "utf8", timeout: 8_000, maxBuffer: 100_000,
          stdio: ["ignore", "pipe", "ignore"] });
      engram = { historicalOnly: true, excerpt: sanitizeAliGroupText(raw, 1800) };
    }
  } catch { /* Memory is supplementary; unavailable is an explicit result. */ }
  const mpTest = await mpTestPayment(question, { env, fetchImpl });
  return { fetchedAt: new Date().toISOString(), issues, project, engram,
    ...(mpTest ? { mpTest } : {}),
    mercadoPagoTestDocs: {
      url: "https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases",
      note: "Enlace oficial de prueba de compras; el adaptador no verifica en vivo los datos de tarjetas ni CVV.",
    },
    repo: `https://github.com/${REPO}` };
}
