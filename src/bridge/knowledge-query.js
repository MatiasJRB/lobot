import childProcess from "node:child_process";
import path from "node:path";

export const DEFAULT_PERSONAL_OS_ROOT =
  "/Users/matiasrios/Documents/Codex/personal-organization";

function boundedText(value, max) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function formatKnowledgeResults(query, results) {
  if (!results.length) {
    return `No encontré conocimiento verificado sobre “${boundedText(query, 160)}” en la base personal.`;
  }
  const lines = ["Encontré esto en la base de conocimiento personal:", ""];
  for (const [index, item] of results.entries()) {
    const title = boundedText(item.title, 120) || "Sin título";
    const summary = boundedText(item.summary, 260);
    const source = boundedText(item.path, 220);
    lines.push(`${index + 1}. ${title}`);
    if (summary) lines.push(summary);
    lines.push(`Fuente: ${source}`, "");
  }
  lines.push("Son resultados de solo lectura; las fuentes marcadas como restringidas no se incluyeron.");
  return lines.join("\n").trim();
}

export function runKnowledgeQuery(job, {
  root = process.env.PERSONAL_OS_ROOT?.trim() || DEFAULT_PERSONAL_OS_ROOT,
  spawnSync = childProcess.spawnSync,
} = {}) {
  const query = boundedText(job?.prompt, 500);
  if (!query) throw new TypeError("knowledge query is required");
  const script = path.join(root, "bin/personal_os_knowledge.py");
  const run = spawnSync(
    "python3",
    [script, "search", query, "--limit", "5", "--audience", "lobot"],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 },
  );
  if (run.error || run.status !== 0) {
    throw new Error(`knowledge query failed: ${run.error?.message || run.stderr?.trim() || run.status}`);
  }
  let payload;
  try {
    payload = JSON.parse(run.stdout);
  } catch {
    throw new Error("knowledge query returned invalid JSON");
  }
  if (!Array.isArray(payload?.results)) {
    throw new Error("knowledge query returned an invalid result");
  }
  return {
    threadName: "Conocimiento personal",
    response: formatKnowledgeResults(query, payload.results.slice(0, 5)),
  };
}
