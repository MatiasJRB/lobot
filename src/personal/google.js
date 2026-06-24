import { firstEnv } from "./env.js";
import { fetchJson } from "./http.js";

const cachedAccessTokens = new Map();

const SERVICE_ENV = {
  gmail: {
    accessToken: ["GMAIL_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    clientId: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"],
    clientSecret: [
      "GMAIL_OAUTH_CLIENT_SECRET",
      "GMAIL_CLIENT_SECRET",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
    ],
    refreshToken: [
      "GMAIL_OAUTH_REFRESH_TOKEN",
      "GMAIL_REFRESH_TOKEN",
      "GOOGLE_OAUTH_REFRESH_TOKEN",
      "GOOGLE_REFRESH_TOKEN",
    ],
  },
  calendar: {
    accessToken: ["GOOGLE_CALENDAR_ACCESS_TOKEN", "CALENDAR_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    clientId: [
      "GOOGLE_CALENDAR_OAUTH_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_ID",
      "CALENDAR_OAUTH_CLIENT_ID",
      "CALENDAR_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
    ],
    clientSecret: [
      "GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "CALENDAR_OAUTH_CLIENT_SECRET",
      "CALENDAR_CLIENT_SECRET",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
    ],
    refreshToken: [
      "GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN",
      "GOOGLE_CALENDAR_REFRESH_TOKEN",
      "CALENDAR_OAUTH_REFRESH_TOKEN",
      "CALENDAR_REFRESH_TOKEN",
      "GOOGLE_OAUTH_REFRESH_TOKEN",
      "GOOGLE_REFRESH_TOKEN",
    ],
  },
  default: {
    accessToken: ["GOOGLE_ACCESS_TOKEN"],
    clientId: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"],
    clientSecret: ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"],
    refreshToken: ["GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN"],
  },
};

function envNamesForService(service = "default") {
  return SERVICE_ENV[service] || SERVICE_ENV.default;
}

export function googleCredentialsStatus(service = "default") {
  const envNames = envNamesForService(service);
  const directAccessToken = firstEnv(envNames.accessToken);
  const clientId = firstEnv(envNames.clientId);
  const clientSecret = firstEnv(envNames.clientSecret);
  const refreshToken = firstEnv(envNames.refreshToken);

  return {
    configured: Boolean(directAccessToken || (clientId && clientSecret && refreshToken)),
    directAccessToken: Boolean(directAccessToken),
    oauthRefresh: Boolean(clientId && clientSecret && refreshToken),
  };
}

export async function getGoogleAccessToken(service = "default") {
  const envNames = envNamesForService(service);
  const directAccessToken = firstEnv(envNames.accessToken);
  if (directAccessToken) return directAccessToken;

  const cachedAccessToken = cachedAccessTokens.get(service);
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = firstEnv(envNames.clientId);
  const clientSecret = firstEnv(envNames.clientSecret);
  const refreshToken = firstEnv(envNames.refreshToken);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `Google OAuth not configured for ${service}. Set service-specific OAuth env vars or GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN.`,
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const token = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    timeoutMs: 20_000,
  });

  if (!token?.access_token) {
    throw new Error("Google OAuth token response did not include access_token.");
  }

  cachedAccessTokens.set(service, {
    token: token.access_token,
    expiresAtMs: Date.now() + Number(token.expires_in || 3000) * 1000,
  });
  return token.access_token;
}

export async function googleApiGet(url, params = {}, opts = {}) {
  const accessToken = await getGoogleAccessToken(opts.service || "default");
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) target.searchParams.append(key, String(item));
    } else {
      target.searchParams.set(key, String(value));
    }
  }
  return fetchJson(target.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 25_000,
  });
}
