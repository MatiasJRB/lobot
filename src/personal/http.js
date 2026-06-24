export class HttpError extends Error {
  constructor(message, { status = 0, body = "", url = "" } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export async function fetchJson(url, options = {}) {
  const {
    timeoutMs = 20_000,
    headers = {},
    expectedStatuses = [200],
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers: {
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
  } catch (err) {
    const message = err?.name === "AbortError" ? "Request timed out" : err.message;
    throw new HttpError(message, { status: 0, url: String(url) });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  if (!expectedStatuses.includes(response.status)) {
    throw new HttpError(`HTTP ${response.status}`, {
      status: response.status,
      body: body.slice(0, 1000),
      url: String(url),
    });
  }

  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new HttpError(`Invalid JSON response: ${err.message}`, {
      status: response.status,
      body: body.slice(0, 1000),
      url: String(url),
    });
  }
}

export function appendSearchParams(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function safeErrorMessage(err) {
  if (!err) return "unknown error";
  if (err instanceof HttpError) {
    const suffix = err.status ? ` (HTTP ${err.status})` : "";
    return `${err.message}${suffix}`;
  }
  return err.message || String(err);
}
