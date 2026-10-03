import { execFileSync } from "node:child_process";

const REPO = "MatiasJRB/asiento-libre";
const ISSUE_URL = `https://github.com/${REPO}/issues/`;

export function aliIntakeGh({ exec = execFileSync, env = process.env } = {}) {
  const isolated = { ...env, GH_HOST: "github.com" };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) delete isolated[key];
  const options = { env: isolated, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000,
    stdio: ["pipe", "pipe", "ignore"] };
  const token = String(exec("gh", ["auth", "token", "--hostname", "github.com", "--user", "MatiasJRB"], options)).trim();
  if (!token || /\s/.test(token)) throw new Error("ALI GitHub credential unavailable");
  options.env = { ...isolated, GH_TOKEN: token };
  if (String(exec("gh", ["api", "user", "--jq", ".login"], options)).trim() !== "MatiasJRB") throw new Error("ALI GitHub identity mismatch");
  return (args, input) => JSON.parse(exec("gh", args, { ...options,
    ...(input === undefined ? {} : { input: JSON.stringify(input) }) }));
}

const safeMarkdown = (text) => String(text).replace(/@/g, "＠").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function intakeBody(record) {
  const kind = { definition: "Definición", task: "Trabajo pendiente", clarify: "Por aclarar" }[record.item.kind];
  const excerpt = record.sources.map((s) =>
    `- ${safeMarkdown(s.author)} · ${s.at} · mensaje \`${s.messageId}\`\n\n${safeMarkdown(s.body).split("\n").map((line) => `> ${line}`).join("\n")}`).join("\n\n");
  return `<!-- ali-intake:${record.key} -->\n## ${kind}: ${safeMarkdown(record.item.title)}\n\n${safeMarkdown(record.item.summary)}\n\n**Estado:** ${record.item.kind === "clarify" ? "pendiente de aclaración; no es una definición aceptada" : "registrado, pendiente de implementación y verificación"}.\n\n### Fuente\nGrupo Asiento Libre 🚘, remitentes autorizados:\n${excerpt}\n\nRegistro automático de conversación. No certifica implementación ni autoriza pagos, cambios de datos, merge, builds o deploy.\n`;
}

function validateReceipt(url) {
  if (typeof url !== "string" || !url.startsWith(ISSUE_URL) ||
      !/^\d+(?:#issuecomment-\d+)?$/.test(url.slice(ISSUE_URL.length))) throw new Error("ALI GitHub receipt invalid");
  return url;
}

export async function flushAliIntakeOutbox(journal, { ghFactory = aliIntakeGh } = {}) {
  const records = journal.state.outbox.filter((r) =>
    ["pending", "writing", "project_pending", "needs_attention"].includes(r.status) && r.attempts < 3 &&
    (!r.nextAttemptAt || r.nextAttemptAt <= journal.clock())).slice(0, 3);
  if (!records.length) return [];
  const gh = ghFactory();
  const receipts = [];
  for (const record of records) {
    const marker = `<!-- ali-intake:${record.key} -->`;
    let target = record.targetIssue || record.item.issue;
    try {
      // Reconcile provider uncertainty *before* writing, including after a process crash.
      if (target) {
        const issue = gh(["api", `repos/${REPO}/issues/${target}`]);
        if (issue.pull_request || issue.state !== "open") throw new Error("target_issue_not_open");
        if (String(issue.body || "").includes(marker)) record.url = validateReceipt(issue.html_url);
        if (!record.url) {
          const pages = gh(["api", `repos/${REPO}/issues/${target}/comments?per_page=100`, "--paginate", "--slurp"]);
          const found = pages.flat().find((c) => String(c.body || "").includes(marker));
          if (found) record.url = validateReceipt(found.html_url);
        }
      } else {
        // The search index may lag. Enumerate all issues since activation, including closed ones.
        const since = new Date(journal.state.enabledSince).toISOString();
        const pages = gh(["api", `repos/${REPO}/issues?state=all&since=${since}&per_page=100`, "--paginate", "--slurp"]);
        const found = pages.flat().find((i) => !i.pull_request && String(i.body || "").includes(marker));
        if (found) { target = found.number; record.url = validateReceipt(found.html_url); }
      }
      // A lost write receipt is never blindly retried: absence needs human review.
      if (!record.url && record.status === "writing") throw new Error("uncertain_write_requires_review");
      if (!record.url) {
        record.status = "writing"; record.attempts++; journal.save();
        const body = intakeBody(record);
        const result = target
          ? gh(["api", "--method", "POST", `repos/${REPO}/issues/${target}/comments`, "--input", "-"], { body })
          : gh(["api", "--method", "POST", `repos/${REPO}/issues`, "--input", "-"], {
            title: `[Ali][${record.item.kind === "clarify" ? "Por aclarar" : "Pendiente"}] ${safeMarkdown(record.item.title)}`, body });
        record.url = validateReceipt(result.html_url); target ||= result.number;
        record.targetIssue = target; journal.save();
      }
      record.targetIssue = target; journal.save();
      // Adding an existing item is idempotent; its active Project status is not overwritten.
      if (!record.projectAdded) {
        gh(["project", "item-add", "4", "--owner", "MatiasJRB", "--url", `${ISSUE_URL}${target}`, "--format", "json"]);
        record.projectAdded = true;
      }
      record.status = "written"; record.lastError = null; journal.save();
      receipts.push({ issue: target, url: record.url });
    } catch (error) {
      record.lastError = error.message === "target_issue_not_open" ? error.message
        : error.message === "uncertain_write_requires_review" ? error.message : "github_write_or_reconcile_failed";
      // Preserve 'writing' across transport errors. A known receipt only needs Project reconciliation.
      if (record.url) record.status = "project_pending";
      else if (record.lastError === "uncertain_write_requires_review") record.status = "uncertain";
      else if (record.status !== "writing") record.status = "needs_attention";
      if (record.status !== "writing") record.attempts++;
      record.nextAttemptAt = journal.clock() + 300_000;
      journal.save();
    }
  }
  return receipts;
}
