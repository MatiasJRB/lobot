import { boolFromEnv, envValue, intFromEnv, listFromEnv } from "./env.js";
import { appendSearchParams, fetchJson, safeErrorMessage } from "./http.js";

function githubToken() {
  return envValue("GITHUB_TOKEN") || envValue("GH_TOKEN");
}

function githubHeaders() {
  const headers = {
    "User-Agent": "lobot/1.0",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubApiGet(path, params = {}) {
  const url = appendSearchParams(`https://api.github.com${path}`, params);
  return fetchJson(url, {
    headers: githubHeaders(),
    timeoutMs: 25_000,
  });
}

function ownerFromRepoFullName(fullName = "") {
  return String(fullName).split("/")[0] || "";
}

function isAllowedOwner(fullName, allowlist) {
  if (!allowlist.length) return true;
  return allowlist.includes(ownerFromRepoFullName(fullName));
}

function signalFromNotification(notification) {
  const repo = notification.repository?.full_name || "repo desconocido";
  const reason = notification.reason || "notification";
  const subjectType = notification.subject?.type || "item";
  let priority = "P2";
  if (/security|vulnerability|dependabot/i.test(reason) || /security|vulnerability/i.test(notification.subject?.title || "")) {
    priority = "P0";
  } else if (["mention", "review_requested", "assign", "author"].includes(reason)) {
    priority = "P1";
  }
  return {
    source: "GitHub",
    priority,
    title: `${repo}: ${notification.subject?.title || subjectType}`,
    summary: `Notificación ${reason} (${subjectType})`,
    when: notification.updated_at || notification.last_read_at,
    url: githubApiUrlToWebUrl(notification.subject?.url) || notification.repository?.html_url,
    action: priority === "P0" ? "Revisar ya" : "Revisar cuando abras GitHub",
  };
}

function githubApiUrlToWebUrl(apiUrl = "") {
  if (!apiUrl) return "";
  return String(apiUrl)
    .replace("https://api.github.com/repos/", "https://github.com/")
    .replace("/pulls/", "/pull/");
}

function signalFromSearchItem(item, kind) {
  const repo = item.repository_url?.split("/repos/")[1] || item.html_url?.split("github.com/")[1]?.split("/issues/")[0] || "repo";
  const priorityByKind = {
    review: "P1",
    assigned: "P1",
    mention: "P2",
  };
  return {
    source: "GitHub",
    priority: priorityByKind[kind] || "P2",
    title: `${repo}: ${item.title}`,
    summary: kind === "review" ? "Review request" : kind === "assigned" ? "Asignado a Matías" : "Mención a Matías",
    when: item.updated_at || item.created_at,
    url: item.html_url,
    action: kind === "review" ? "Revisar PR pendiente" : "Decidir si requiere respuesta",
  };
}

function signalFromWorkflowRun(repoFullName, run) {
  return {
    source: "GitHub",
    priority: "P1",
    title: `${repoFullName}: CI fallida en ${run.name || run.workflow_id}`,
    summary: `${run.head_branch || "branch"} — ${run.conclusion || run.status}`,
    when: run.updated_at || run.created_at,
    url: run.html_url,
    action: "Ver si bloquea un proyecto personal o release",
  };
}

async function collectNotifications(allowlist, maxResults) {
  if (!githubToken()) return { items: [], signals: [], warning: "GITHUB_TOKEN no está configurado; se omiten notificaciones privadas." };
  const notifications = await githubApiGet("/notifications", {
    all: false,
    participating: true,
    per_page: maxResults,
  });
  const filtered = (notifications || []).filter((item) =>
    isAllowedOwner(item.repository?.full_name, allowlist),
  );
  return {
    items: filtered,
    signals: filtered.map(signalFromNotification),
  };
}

async function searchIssues(query, maxResults) {
  const data = await githubApiGet("/search/issues", {
    q: query,
    sort: "updated",
    order: "desc",
    per_page: maxResults,
  });
  return data?.items || [];
}

async function collectSearchSignals(username, ownerQuery, maxResults) {
  const queries = [
    { kind: "review", q: `review-requested:${username} is:pr is:open archived:false ${ownerQuery}` },
    { kind: "assigned", q: `assignee:${username} is:open archived:false ${ownerQuery}` },
    { kind: "mention", q: `mentions:${username} is:open archived:false ${ownerQuery}` },
  ];
  const items = [];
  const signals = [];
  for (const query of queries) {
    const found = await searchIssues(query.q.trim(), maxResults);
    for (const item of found) {
      items.push({ kind: query.kind, ...item });
      signals.push(signalFromSearchItem(item, query.kind));
    }
  }
  return { items, signals };
}

async function collectWorkflowSignals(username, allowlist, window) {
  if (!boolFromEnv("GITHUB_CHECK_WORKFLOW_RUNS", true)) return { items: [], signals: [] };
  const maxRepos = intFromEnv("GITHUB_WORKFLOW_MAX_REPOS", 8, { min: 1, max: 30 });
  const maxRuns = intFromEnv("GITHUB_WORKFLOW_MAX_RUNS_PER_REPO", 5, { min: 1, max: 20 });
  const repos = await githubApiGet(`/users/${encodeURIComponent(username)}/repos`, {
    type: "owner",
    sort: "updated",
    direction: "desc",
    per_page: maxRepos,
  });
  const sinceMs = Date.parse(window.since);
  const items = [];
  const signals = [];
  for (const repo of (repos || []).filter((r) => isAllowedOwner(r.full_name, allowlist)).slice(0, maxRepos)) {
    const runs = await githubApiGet(`/repos/${repo.full_name}/actions/runs`, {
      status: "failure",
      per_page: maxRuns,
    });
    for (const run of runs?.workflow_runs || []) {
      const updatedMs = Date.parse(run.updated_at || run.created_at);
      if (Number.isFinite(sinceMs) && Number.isFinite(updatedMs) && updatedMs < sinceMs) continue;
      items.push({ repo: repo.full_name, ...run });
      signals.push(signalFromWorkflowRun(repo.full_name, run));
    }
  }
  return { items, signals };
}

export async function collectGitHub({ window }) {
  const username = envValue("GITHUB_USERNAME", "MatiasJRB");
  const allowlist = listFromEnv("GITHUB_OWNER_ALLOWLIST", [username]);
  const ownerQuery = envValue(
    "GITHUB_SEARCH_OWNER_QUERY",
    allowlist.length === 1 ? `user:${allowlist[0]}` : allowlist.map((owner) => `user:${owner}`).join(" "),
  );
  const maxResults = intFromEnv("GITHUB_MAX_RESULTS", 15, { min: 1, max: 50 });
  const source = {
    name: "github",
    enabled: boolFromEnv("GITHUB_ENABLED", true),
    configured: Boolean(username),
    status: "disabled",
    items: [],
    signals: [],
    warnings: [],
  };

  if (!source.enabled) return source;
  if (!username) {
    source.status = "missing_credentials";
    source.warnings.push("Falta GITHUB_USERNAME.");
    return source;
  }

  try {
    const [notifications, searchSignals, workflowSignals] = await Promise.allSettled([
      collectNotifications(allowlist, maxResults),
      collectSearchSignals(username, ownerQuery, maxResults),
      collectWorkflowSignals(username, allowlist, window),
    ]);

    for (const result of [notifications, searchSignals, workflowSignals]) {
      if (result.status === "rejected") {
        source.warnings.push(`GitHub subconsulta falló: ${safeErrorMessage(result.reason)}`);
        continue;
      }
      if (result.value.warning) source.warnings.push(result.value.warning);
      source.items.push(...(result.value.items || []));
      source.signals.push(...(result.value.signals || []));
    }

    source.status = source.warnings.some((warning) => /fall[oó]/i.test(warning)) ? "partial" : "ok";
    return source;
  } catch (err) {
    source.status = "error";
    source.warnings.push(`GitHub API falló: ${safeErrorMessage(err)}`);
    return source;
  }
}
