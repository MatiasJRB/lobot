export class BridgeApiClient {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    if (!baseUrl) throw new Error("CODEX_BRIDGE_URL is required");
    if (!token) throw new Error("CODEX_BRIDGE_TOKEN is required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async request(pathname, { method = "GET", body, timeoutMs } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Bridge API returned HTTP ${response.status}`);
    }
    return payload;
  }

  listThreads() {
    return this.request("/threads");
  }

  listPersonalOsEvents(cursor, limit = 50) {
    return this.request(`/personal-os/events?cursor=${cursor}&limit=${limit}`,
      { timeoutMs: 10_000 });
  }

  listPersonalOsNotices(cursor, limit = 50) {
    return this.request(`/personal-os/notices?cursor=${cursor}&limit=${limit}`,
      { timeoutMs: 10_000 });
  }

  enqueueJob(input) {
    return this.request("/jobs", { method: "POST", body: input });
  }

  getJob(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`);
  }

  claimJob(workerId, leaseMs) {
    return this.request("/jobs/claim", {
      method: "POST",
      body: { workerId, leaseMs },
    });
  }

  completeJob(jobId, result) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/complete`, {
      method: "POST",
      body: result,
    });
  }

  deferJob(jobId, result) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/defer`, {
      method: "POST",
      body: result,
    });
  }

  heartbeat(input) {
    return this.request("/workers/heartbeat", { method: "POST", body: input });
  }
}
