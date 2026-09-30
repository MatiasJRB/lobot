import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PERSONAL_OS_ROOT =
  "/Users/matiasrios/Documents/Codex/personal-organization";

const MAX_NOTE_CHARS = 16_000;
const STOPWORDS = new Set([
  "acerca", "algo", "cual", "cuál", "cuando", "cómo", "como", "con", "de",
  "del", "el", "en", "hay", "la", "las", "lo", "los", "me", "para", "por",
  "que", "qué", "saber", "sabemos", "sobre", "tenemos", "un", "una", "y",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query) {
  return normalize(query)
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.filter((term) => term.length > 1 && !STOPWORDS.has(term)) ?? [];
}

function termMatches(haystack, term) {
  if (haystack.includes(term)) return true;
  if (term.length > 4 && term.endsWith("es")) return haystack.includes(term.slice(0, -2));
  if (term.length > 3 && term.endsWith("s")) return haystack.includes(term.slice(0, -1));
  return false;
}

function runJson(script, args, { spawnSync = childProcess.spawnSync } = {}) {
  const run = spawnSync("python3", [script, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) {
    throw new Error(run.error?.message || run.stderr?.trim() || `exit ${run.status}`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error("Personal OS returned invalid JSON");
  }
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return {};
  return Object.fromEntries(
    text.slice(4, end).split("\n")
      .filter((line) => line.includes(":") && !/^\s/.test(line))
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

export function searchPersonalOs(query, {
  root = process.env.PERSONAL_OS_ROOT?.trim() || DEFAULT_PERSONAL_OS_ROOT,
  limit = 8,
  spawnSync = childProcess.spawnSync,
} = {}) {
  const terms = queryTerms(query);
  if (!terms.length) throw new TypeError("query must include a meaningful term");
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 8, 12));
  const cli = path.join(root, "bin/personal_os.py");
  const knowledgeCli = path.join(root, "bin/personal_os_knowledge.py");

  const cardsPayload = runJson(cli, ["cards"], { spawnSync });
  const cards = Array.isArray(cardsPayload?.cards) ? cardsPayload.cards : [];
  const matchingCards = cards
    .map((card) => {
      const haystack = normalize(Object.values(card).flat().join(" "));
      const score = terms.reduce((sum, term) => sum + (termMatches(haystack, term) ? 1 : 0), 0);
      return { card, score };
    })
    .filter(({ score }) => score === terms.length)
    .sort((a, b) => b.score - a.score || String(a.card.title).localeCompare(String(b.card.title), "es"))
    .slice(0, boundedLimit)
    .map(({ card }) => ({
      id: card.id,
      title: card.title,
      domain: card.domain,
      status: card.status,
      priority: card.priority,
      owner: card.owner,
      current_state: card.current_state,
      next_action: card.next_action,
      next_check_at: card.next_check_at,
      closure_condition: card.closure_condition,
    }));

  const knowledgePayload = runJson(
    knowledgeCli,
    ["search", String(query).slice(0, 500), "--limit", String(boundedLimit), "--audience", "lobot"],
    { spawnSync },
  );
  const notes = Array.isArray(knowledgePayload?.results) ? knowledgePayload.results : [];

  return {
    query: String(query).slice(0, 500),
    cards: matchingCards,
    notes: notes.slice(0, boundedLimit),
    caveat: "An empty result means no verified match was found; it does not prove the subject never existed.",
  };
}

export function getPersonalOsCard(itemId, {
  root = process.env.PERSONAL_OS_ROOT?.trim() || DEFAULT_PERSONAL_OS_ROOT,
  spawnSync = childProcess.spawnSync,
} = {}) {
  const id = String(itemId ?? "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id)) throw new TypeError("invalid card id");
  return runJson(path.join(root, "bin/personal_os.py"), ["card", id], { spawnSync });
}

export function getExecutiveInbox({
  root = process.env.PERSONAL_OS_ROOT?.trim() || DEFAULT_PERSONAL_OS_ROOT,
  spawnSync = childProcess.spawnSync,
} = {}) {
  return runJson(
    path.join(root, "bin/personal_os.py"),
    ["executive-inbox", "--format", "json"],
    { spawnSync },
  );
}

export function readKnowledgeNote(relativePath, {
  root = process.env.PERSONAL_OS_ROOT?.trim() || DEFAULT_PERSONAL_OS_ROOT,
  readFileSync = fs.readFileSync,
  realpathSync = fs.realpathSync,
} = {}) {
  const requested = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!requested || path.isAbsolute(requested) || !requested.endsWith(".md")) {
    throw new TypeError("path must be a relative Markdown path returned by personal_os_search");
  }
  const vault = realpathSync(path.join(root, "knowledge-hub"));
  const target = realpathSync(path.join(vault, requested));
  if (target !== vault && !target.startsWith(`${vault}${path.sep}`)) {
    throw new Error("path escapes the knowledge vault");
  }
  const text = readFileSync(target, "utf8");
  const metadata = parseFrontmatter(text);
  if (
    metadata.visibility === "restricted" ||
    metadata.trust === "unverified-proposal" ||
    metadata.status === "inbox"
  ) {
    throw new Error("note is not available to the Secretary read-only audience");
  }
  return {
    path: requested,
    metadata,
    content: text.slice(0, MAX_NOTE_CHARS),
    truncated: text.length > MAX_NOTE_CHARS,
  };
}
