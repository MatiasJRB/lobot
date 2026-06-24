import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import express from "express";
import httpProxy from "http-proxy";
import pty from "node-pty";
import { WebSocketServer } from "ws";

const PORT = Number.parseInt(
  process.env.PORT ?? process.env.OPENCLAW_GATEWAY_PORT ?? "8080",
  10,
);
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".openclaw");
const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();

function resolveGatewayToken() {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch (err) {
    console.warn(
      `[gateway-token] could not read existing token: ${err.code || err.message}`,
    );
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.warn(
      `[gateway-token] could not persist token: ${err.code || err.message}`,
    );
  }
  return generated;
}

const OPENCLAW_GATEWAY_TOKEN = resolveGatewayToken();
process.env.OPENCLAW_GATEWAY_TOKEN = OPENCLAW_GATEWAY_TOKEN;

let cachedOpenclawVersion = null;
let cachedChannelsHelp = null;

async function getOpenclawInfo() {
  if (!cachedOpenclawVersion) {
    const [version, channelsHelp] = await Promise.all([
      runCmd(OPENCLAW_NODE, clawArgs(["--version"])),
      runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"])),
    ]);
    cachedOpenclawVersion = version.output.trim();
    cachedChannelsHelp = channelsHelp.output;
  }
  return { version: cachedOpenclawVersion, channelsHelp: cachedChannelsHelp };
}

const INTERNAL_GATEWAY_PORT = Number.parseInt(
  process.env.INTERNAL_GATEWAY_PORT ?? "18789",
  10,
);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;
const GATEWAY_WS_TARGET = `ws://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

const OPENCLAW_ENTRY =
  process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";

const ENABLE_WEB_TUI = process.env.ENABLE_WEB_TUI?.toLowerCase() === "true";
const TUI_IDLE_TIMEOUT_MS = Number.parseInt(
  process.env.TUI_IDLE_TIMEOUT_MS ?? "300000",
  10,
);
const TUI_MAX_SESSION_MS = Number.parseInt(
  process.env.TUI_MAX_SESSION_MS ?? "1800000",
  10,
);

function clawArgs(args) {
  return [OPENCLAW_ENTRY, ...args];
}


function envValue(name) {
  return process.env[name]?.trim() || "";
}

function envSecretRef(name) {
  return { source: "env", provider: "default", id: name };
}

function boolFromEnv(name, fallback = false) {
  const value = envValue(name).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value);
}

function preferredAuthChoice() {
  if (envValue("GEMINI_API_KEY") || envValue("GOOGLE_API_KEY")) {
    return "gemini-api-key";
  }
  if (envValue("OPENAI_API_KEY")) return "openai-api-key";
  if (envValue("ANTHROPIC_API_KEY")) return "apiKey";
  if (envValue("OPENROUTER_API_KEY")) return "openrouter-api-key";
  return "";
}

function preferredModelFromEnv() {
  return (
    envValue("OPENCLAW_DEFAULT_MODEL") ||
    envValue("GEMINI_MODEL") ||
    envValue("OPENAI_MODEL") ||
    ""
  );
}

function redactSecrets(value, extraSecrets = []) {
  let text = String(value ?? "");
  const explicitSecrets = [
    OPENCLAW_GATEWAY_TOKEN,
    envValue("GEMINI_API_KEY"),
    envValue("GOOGLE_API_KEY"),
    envValue("DISCORD_BOT_TOKEN"),
    envValue("TELEGRAM_BOT_TOKEN"),
    envValue("SLACK_BOT_TOKEN"),
    envValue("SLACK_APP_TOKEN"),
    envValue("OPENAI_API_KEY"),
    envValue("ANTHROPIC_API_KEY"),
    envValue("OPENROUTER_API_KEY"),
    ...extraSecrets,
  ].filter((secret) => typeof secret === "string" && secret.length >= 6);

  for (const secret of explicitSecrets) {
    text = text.split(secret).join("[REDACTED]");
  }

  return text
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED:google-api-key]")
    .replace(/\bAQ\.[0-9A-Za-z_-]{20,}\b/g, "[REDACTED:gemini-api-key]")
    .replace(/\bsk-(?:ant-|or-)?[0-9A-Za-z_-]{20,}\b/g, "[REDACTED:api-key]")
    .replace(/\bxox[abpors]-[0-9A-Za-z-]{20,}\b/g, "[REDACTED:slack-token]")
    .replace(/\b\d{6,}:[0-9A-Za-z_-]{20,}\b/g, "[REDACTED:telegram-token]")
    .replace(/\b[MN][A-Za-z\d_-]{20,}\.[\w-]{6}\.[\w-]{20,}\b/g, "[REDACTED:discord-token]");
}

function buildDiscordGuildConfigFromEnv() {
  const guildId = envValue("DISCORD_GUILD_ID");
  if (!guildId) return undefined;

  const channelId = envValue("DISCORD_PERSONAL_CHANNEL_ID");
  const ownerUserId = envValue("DISCORD_OWNER_USER_ID");
  const requireMention = boolFromEnv("DISCORD_REQUIRE_MENTION", false);
  const guildConfig = {
    requireMention,
    ignoreOtherMentions: true,
  };

  if (ownerUserId) {
    guildConfig.users = [ownerUserId];
  }

  if (channelId) {
    guildConfig.channels = {
      [channelId]: { requireMention },
    };
  }

  return { [guildId]: guildConfig };
}

function discordApplicationIdFromEnv() {
  return (
    envValue("DISCORD_APPLICATION_ID") ||
    envValue("DISCORD_CLIENT_ID") ||
    envValue("DISCORD_APPLICATION_CLIENT_ID")
  );
}

function buildDiscordChannelConfig(token, opts = {}) {
  const cfg = {
    enabled: true,
    token,
    groupPolicy: "allowlist",
    dmPolicy: "pairing",
  };

  const applicationId =
    opts.applicationId?.trim?.() || discordApplicationIdFromEnv();
  if (applicationId) {
    cfg.applicationId = applicationId;
  }

  const guilds = buildDiscordGuildConfigFromEnv();
  if (guilds) cfg.guilds = guilds;

  return cfg;
}

function configPath() {
  return (
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    path.join(STATE_DIR, "openclaw.json")
  );
}

function isConfigured() {
  try {
    return fs.existsSync(configPath());
  } catch {
    return false;
  }
}

async function syncAllowedOrigins() {
  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (!publicDomain) return;

  const origin = `https://${publicDomain}`;
  const result = await runCmd(
    OPENCLAW_NODE,
    clawArgs([
      "config",
      "set",
      "--json",
      "gateway.controlUi.allowedOrigins",
      JSON.stringify([origin]),
    ]),
  );
  if (result.code === 0) {
    console.log("gateway", `set allowedOrigins to [${origin}]`);
  } else {
    console.warn("gateway", `failed to set allowedOrigins (exit=${result.code})`);
  }
}

async function syncGatewayRuntimeConfig() {
  await syncAllowedOrigins();

  const tokenResult = await runCmd(
    OPENCLAW_NODE,
    clawArgs([
      "config",
      "set",
      "--json",
      "gateway.auth.token",
      JSON.stringify(envSecretRef("OPENCLAW_GATEWAY_TOKEN")),
    ]),
  );
  if (tokenResult.code === 0) {
    console.log("gateway", "synced gateway.auth.token SecretRef from OPENCLAW_GATEWAY_TOKEN");
  } else {
    console.warn("gateway", `failed to sync gateway.auth.token (exit=${tokenResult.code})`);
  }
}

let gatewayProc = null;
let gatewayStarting = null;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const start = Date.now();
  const endpoints = ["/openclaw", "/openclaw", "/", "/health"];

  while (Date.now() - start < timeoutMs) {
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(`${GATEWAY_TARGET}${endpoint}`, {
          method: "GET",
        });
        if (res) {
          console.log(`[gateway] ready at ${endpoint}`);
          return true;
        }
      } catch (err) {
        if (err.code !== "ECONNREFUSED" && err.cause?.code !== "ECONNREFUSED") {
          const msg = err.code || err.message;
          if (msg !== "fetch failed" && msg !== "UND_ERR_CONNECT_TIMEOUT") {
            console.warn(`[gateway] health check error: ${msg}`);
          }
        }
      }
    }
    await sleep(250);
  }
  console.error(`[gateway] failed to become ready after ${timeoutMs / 1000} seconds`);
  return false;
}

async function startGateway() {
  if (gatewayProc) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  // for (const lockPath of [
  //   path.join(STATE_DIR, "gateway.lock"),
  //   "/tmp/openclaw-gateway.lock",
  // ]) {
  //   try {
  //     fs.rmSync(lockPath, { force: true });
  //   } catch {}
  // }

  const stopResult = await runCmd(OPENCLAW_NODE, clawArgs(["gateway", "stop"]));
  console.log("gateway", `stop existing gateway exit=${stopResult.code}`);

  const args = [
    "gateway",
    "run",
    "--bind",
    "loopback",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
    "--auth",
    "token",
    "--token",
    OPENCLAW_GATEWAY_TOKEN,
    "--allow-unconfigured",
  ];

  gatewayProc = childProcess.spawn(OPENCLAW_NODE, clawArgs(args), {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    },
  });

  const safeArgs = args.map((arg, i) =>
    args[i - 1] === "--token" ? "[REDACTED]" : arg
  );
  console.log(
    `[gateway] starting with command: ${OPENCLAW_NODE} ${clawArgs(safeArgs).join(" ")}`,
  );
  console.log(`[gateway] STATE_DIR: ${STATE_DIR}`);
  console.log(`[gateway] WORKSPACE_DIR: ${WORKSPACE_DIR}`);
  console.log(`[gateway] config path: ${configPath()}`);

  gatewayProc.on("error", (err) => {
    console.error(`[gateway] spawn error: ${String(err)}`);
    gatewayProc = null;
  });

  gatewayProc.on("exit", (code, signal) => {
    console.error(`[gateway] exited code=${code} signal=${signal}`);
    gatewayProc = null;
    if (!shuttingDown && isConfigured()) {
      console.log("[gateway] scheduling auto-restart in 2s...");
      setTimeout(() => {
        if (!shuttingDown && !gatewayProc && isConfigured()) {
          ensureGatewayRunning().catch((err) => {
            console.error(`[gateway] auto-restart failed: ${err.message}`);
          });
        }
      }, 2000);
    }
  });
}

async function ensureGatewayRunning() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  if (gatewayProc) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      await syncGatewayRuntimeConfig();
      await startGateway();
      const ready = await waitForGatewayReady({ timeoutMs: 60_000 });
      if (!ready) {
        throw new Error("Gateway did not become ready in time");
      }
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

function isGatewayStarting() {
  return gatewayStarting !== null;
}

function isGatewayReady() {
  return gatewayProc !== null && gatewayStarting === null;
}

async function restartGateway() {
  if (gatewayProc) {
    try {
      gatewayProc.kill("SIGTERM");
    } catch (err) {
      console.warn(`[gateway] kill error: ${err.message}`);
    }
    await sleep(750);
    gatewayProc = null;
  }
  return ensureGatewayRunning();
}

const setupRateLimiter = {
  attempts: new Map(),
  windowMs: 60_000,
  maxAttempts: 50,
  cleanupInterval: setInterval(function () {
    const now = Date.now();
    for (const [ip, data] of setupRateLimiter.attempts) {
      if (now - data.windowStart > setupRateLimiter.windowMs) {
        setupRateLimiter.attempts.delete(ip);
      }
    }
  }, 60_000),

  isRateLimited(ip) {
    const now = Date.now();
    const data = this.attempts.get(ip);
    if (!data || now - data.windowStart > this.windowMs) {
      this.attempts.set(ip, { windowStart: now, count: 1 });
      return false;
    }
    data.count++;
    return data.count > this.maxAttempts;
  },
};

function requireSetupAuth(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res
      .status(500)
      .type("text/plain")
      .send(
        "SETUP_PASSWORD is not set. Set it in Railway Variables before using /setup.",
      );
  }

  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  if (setupRateLimiter.isRateLimited(ip)) {
    return res.status(429).type("text/plain").send("Too many requests. Try again later.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Setup"');
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  const passwordHash = crypto.createHash("sha256").update(password).digest();
  const expectedHash = crypto.createHash("sha256").update(SETUP_PASSWORD).digest();
  const isValid = crypto.timingSafeEqual(passwordHash, expectedHash);
  if (!isValid) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Setup"');
    return res.status(401).send("Invalid password");
  }
  return next();
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", async (_req, res) => {
  let gateway = "unconfigured";
  if (isConfigured()) {
    gateway = isGatewayReady() ? "ready" : "starting";
  }
  res.json({ ok: true, gateway });
});

app.get("/setup/healthz", async (_req, res) => {
  const configured = isConfigured();
  const gatewayRunning = isGatewayReady();
  const starting = isGatewayStarting();
  let gatewayReachable = false;

  if (gatewayRunning) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(`${GATEWAY_TARGET}/`, { signal: controller.signal });
      clearTimeout(timeout);
      gatewayReachable = r !== null;
    } catch { }
  }

  res.json({
    ok: true,
    wrapper: true,
    configured,
    gatewayRunning,
    gatewayStarting: starting,
    gatewayReachable,
  });
});

app.get("/setup", requireSetupAuth, (_req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "public", "setup.html"));
});

app.get("/setup/api/status", requireSetupAuth, async (req, res) => {
  const { version, channelsHelp } = await getOpenclawInfo();
  const includeGatewayToken =
    req.query.includeGatewayToken === "true" ||
    req.query.includeGatewayToken === "1";

  const authGroups = [
    {
      value: "openai",
      label: "OpenAI",
      hint: "API key",
      options: [
        { value: "openai-api-key", label: "OpenAI API key" },
      ],
    },
    {
      value: "anthropic",
      label: "Anthropic",
      hint: "API key",
      options: [
        { value: "apiKey", label: "Anthropic API key" },
      ],
    },
    {
      value: "google",
      label: "Google",
      hint: "API key",
      options: [
        { value: "gemini-api-key", label: "Google Gemini API key" },
      ],
    },
    {
      value: "openrouter",
      label: "OpenRouter",
      hint: "API key",
      options: [{ value: "openrouter-api-key", label: "OpenRouter API key" }],
    },
    {
      value: "ai-gateway",
      label: "Vercel AI Gateway",
      hint: "API key",
      options: [
        { value: "ai-gateway-api-key", label: "Vercel AI Gateway API key" },
      ],
    },
    {
      value: "moonshot",
      label: "Moonshot AI",
      hint: "Kimi K2 + Kimi Code",
      options: [
        { value: "moonshot-api-key", label: "Moonshot AI API key" },
        { value: "kimi-code-api-key", label: "Kimi Code API key" },
      ],
    },
    {
      value: "zai",
      label: "Z.AI (GLM 4.7)",
      hint: "API key",
      options: [{ value: "zai-api-key", label: "Z.AI (GLM 4.7) API key" }],
    },
    {
      value: "minimax",
      label: "MiniMax",
      hint: "M2.1 (recommended)",
      options: [
        { value: "minimax-api", label: "MiniMax M2.1" },
        { value: "minimax-api-lightning", label: "MiniMax M2.1 Lightning" },
      ],
    },
    {
      value: "qwen",
      label: "Qwen",
      hint: "OAuth",
      options: [{ value: "qwen-portal", label: "Qwen OAuth" }],
    },
    {
      value: "copilot",
      label: "Copilot",
      hint: "GitHub + local proxy",
      options: [
        {
          value: "github-copilot",
          label: "GitHub Copilot (GitHub device login)",
        },
        { value: "copilot-proxy", label: "Copilot Proxy (local)" },
      ],
    },
    {
      value: "synthetic",
      label: "Synthetic",
      hint: "Anthropic-compatible (multi-model)",
      options: [{ value: "synthetic-api-key", label: "Synthetic API key" }],
    },
    {
      value: "opencode-zen",
      label: "OpenCode Zen",
      hint: "API key",
      options: [
        { value: "opencode-zen", label: "OpenCode Zen (multi-model proxy)" },
      ],
    },
  ];

  res.json({
    configured: isConfigured(),
    gatewayTarget: GATEWAY_TARGET,
    openclawVersion: version,
    channelsAddHelp: channelsHelp,
    authGroups,
    defaults: {
      authChoice: preferredAuthChoice(),
      model: preferredModelFromEnv(),
      discordTokenFromEnv: Boolean(envValue("DISCORD_BOT_TOKEN")),
      discordGuildFromEnv: Boolean(envValue("DISCORD_GUILD_ID")),
      discordChannelFromEnv: Boolean(envValue("DISCORD_PERSONAL_CHANNEL_ID")),
    },
    tuiEnabled: ENABLE_WEB_TUI,
    gatewayTokenAvailable: Boolean(OPENCLAW_GATEWAY_TOKEN),
    ...(includeGatewayToken ? { gatewayToken: OPENCLAW_GATEWAY_TOKEN } : {}),
  });
});

function buildOnboardArgs(payload) {
  const args = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--workspace",
    WORKSPACE_DIR,
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    "quickstart",
  ];

  const authChoice = (payload.authChoice || "").trim() || preferredAuthChoice();
  if (authChoice) {
    args.push("--auth-choice", authChoice);

    const envSecretByChoice = {
      "openai-api-key": "OPENAI_API_KEY",
      apiKey: "ANTHROPIC_API_KEY",
      "openrouter-api-key": "OPENROUTER_API_KEY",
      "ai-gateway-api-key": "AI_GATEWAY_API_KEY",
      "moonshot-api-key": "MOONSHOT_API_KEY",
      "kimi-code-api-key": "KIMI_CODE_API_KEY",
      "gemini-api-key": envValue("GEMINI_API_KEY") ? "GEMINI_API_KEY" : "GOOGLE_API_KEY",
      "zai-api-key": "ZAI_API_KEY",
      "minimax-api": "MINIMAX_API_KEY",
      "minimax-api-lightning": "MINIMAX_API_KEY",
      "synthetic-api-key": "SYNTHETIC_API_KEY",
      "opencode-zen": "OPENCODE_ZEN_API_KEY",
    };
    const secret = (payload.authSecret || "").trim() || envValue(envSecretByChoice[authChoice]);
    const flagByChoice = {
      "openai-api-key": "--openai-api-key",
      apiKey: "--anthropic-api-key",
      "openrouter-api-key": "--openrouter-api-key",
      "ai-gateway-api-key": "--ai-gateway-api-key",
      "moonshot-api-key": "--moonshot-api-key",
      "kimi-code-api-key": "--kimi-code-api-key",
      "gemini-api-key": "--gemini-api-key",
      "zai-api-key": "--zai-api-key",
      "minimax-api": "--minimax-api-key",
      "minimax-api-lightning": "--minimax-api-key",
      "synthetic-api-key": "--synthetic-api-key",
      "opencode-zen": "--opencode-zen-api-key",
    };
    const flag = flagByChoice[authChoice];
    if (flag && secret) {
      args.push(flag, secret);
    }
  }

  return args;
}

function runCmd(cmd, args, opts = {}) {
  const { secrets = [], ...spawnOpts } = opts;
  return new Promise((resolve) => {
    const proc = childProcess.spawn(cmd, args, {
      ...spawnOpts,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    proc.on("error", (err) => {
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: redactSecrets(out, secrets) });
    });

    proc.on("close", (code) =>
      resolve({ code: code ?? 0, output: redactSecrets(out, secrets) }),
    );
  });
}

async function setChannelConfig(name, cfgObj, opts = {}) {
  const secrets = opts.secrets || [];
  const set = await runCmd(
    OPENCLAW_NODE,
    clawArgs([
      "config",
      "set",
      "--json",
      `channels.${name}`,
      JSON.stringify(cfgObj),
    ]),
    { secrets },
  );
  const get = await runCmd(
    OPENCLAW_NODE,
    clawArgs(["config", "get", `channels.${name}`]),
    { secrets },
  );
  const setOutput = set.output || "(no output)";
  return {
    ok: set.code === 0 && get.code === 0,
    output:
      `\n[${name} config] exit=${set.code} (output ${set.output.length} chars)\n${setOutput}` +
      `\n[${name} verify] exit=${get.code} (output redacted, ${get.output.length} chars)`,
  };
}

function discordDeliveryTargetFromEnv() {
  return (
    envValue("DISCORD_PERSONAL_CHANNEL_TARGET") ||
    (envValue("DISCORD_PERSONAL_CHANNEL_ID")
      ? `channel:${envValue("DISCORD_PERSONAL_CHANNEL_ID")}`
      : "") ||
    (envValue("DISCORD_OWNER_USER_ID")
      ? `user:${envValue("DISCORD_OWNER_USER_ID")}`
      : "")
  );
}

const PERSONAL_DIGEST_CRON_JOBS = [
  {
    schedule: "0 9 * * *",
    name: "Personal digest — mañana",
    prompt:
      "Usá seed-workspace/prompts/digest.md. Prepará el digest personal de la mañana para Matías: agenda de hoy, mails/GitHub importantes, vencimientos, seguridad y próximos pasos. No mezcles Mango salvo impacto personal claro.",
  },
  {
    schedule: "0 15 * * *",
    name: "Personal digest — tarde",
    prompt:
      "Usá seed-workspace/prompts/digest.md. Revisá novedades personales desde la mañana y marcá solo lo que cambia prioridades de Matías para la tarde/noche.",
  },
  {
    schedule: "0 21 * * *",
    name: "Personal digest — noche",
    prompt:
      "Usá seed-workspace/prompts/digest.md. Cerrá el día personal de Matías: pendientes que quedan, agenda de mañana, alertas de dinero/seguridad/servicios y automatizaciones candidatas.",
  },
];

async function installPersonalDigestCrons(opts = {}) {
  const target = (opts.target || discordDeliveryTargetFromEnv()).trim();
  if (!target) {
    return {
      ok: false,
      output:
        "Missing Discord delivery target. Set DISCORD_PERSONAL_CHANNEL_TARGET or DISCORD_PERSONAL_CHANNEL_ID.",
    };
  }

  const channel = (opts.channel || envValue("OPENCLAW_CRON_CHANNEL") || "discord").trim();
  const tz = (opts.tz || envValue("OPENCLAW_CRON_TZ") || "America/Argentina/Buenos_Aires").trim();
  const model = (opts.model || envValue("OPENCLAW_CRON_MODEL") || "").trim();
  const thinking = (opts.thinking || envValue("OPENCLAW_CRON_THINKING") || "").trim();

  await ensureGatewayRunning();

  const list = await runCmd(
    OPENCLAW_NODE,
    clawArgs([
      "cron",
      "list",
      "--url",
      GATEWAY_WS_TARGET,
      "--token",
      OPENCLAW_GATEWAY_TOKEN,
    ]),
    { secrets: [OPENCLAW_GATEWAY_TOKEN] },
  );
  let output = `[cron list] exit=${list.code}\n${list.output || ""}\n`;
  let ok = list.code === 0;

  for (const job of PERSONAL_DIGEST_CRON_JOBS) {
    if (list.output.includes(job.name)) {
      output += `\n[skip] cron already exists: ${job.name}`;
      continue;
    }

    const args = [
      "cron",
      "create",
      job.schedule,
      job.prompt,
      "--name",
      job.name,
      "--tz",
      tz,
      "--session",
      "isolated",
      "--announce",
      "--channel",
      channel,
      "--to",
      target,
      "--url",
      GATEWAY_WS_TARGET,
      "--token",
      OPENCLAW_GATEWAY_TOKEN,
    ];

    if (model) args.push("--model", model);
    if (thinking) args.push("--thinking", thinking);

    const created = await runCmd(OPENCLAW_NODE, clawArgs(args), {
      secrets: [OPENCLAW_GATEWAY_TOKEN],
    });
    output += `\n[create] ${job.name} -> ${job.schedule} (${tz}) exit=${created.code}\n${created.output || ""}`;
    ok = ok && created.code === 0;
  }

  return { ok, output };
}

const VALID_AUTH_CHOICES = [
  "openai-api-key",
  "apiKey",
  "gemini-api-key",
  "openrouter-api-key",
  "ai-gateway-api-key",
  "moonshot-api-key",
  "kimi-code-api-key",
  "zai-api-key",
  "minimax-api",
  "minimax-api-lightning",
  "qwen-portal",
  "github-copilot",
  "copilot-proxy",
  "synthetic-api-key",
  "opencode-zen",
];

function validatePayload(payload) {
  if (payload.authChoice && !VALID_AUTH_CHOICES.includes(payload.authChoice)) {
    return `Invalid authChoice: ${payload.authChoice}`;
  }
  const stringFields = [
    "telegramToken",
    "discordToken",
    "slackBotToken",
    "slackAppToken",
    "authSecret",
    "model",
  ];
  for (const field of stringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") {
      return `Invalid ${field}: must be a string`;
    }
  }
  return null;
}

app.post("/setup/api/run", requireSetupAuth, async (req, res) => {
  try {
    if (isConfigured()) {
      await ensureGatewayRunning();
      return res.json({
        ok: true,
        output:
          "Already configured.\nUse Reset setup if you want to rerun onboarding.\n",
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = req.body || {};
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ ok: false, output: validationError });
    }
    const onboardArgs = buildOnboardArgs(payload);
    const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs), {
      secrets: [payload.authSecret].filter(Boolean),
    });

    let extra = "";
    extra += `\n[setup] Onboarding exit=${onboard.code} configured=${isConfigured()}\n`;

    const ok = onboard.code === 0 && isConfigured();

    if (ok) {
      extra += "\n[setup] Configuring gateway settings...\n";

      const allowInsecureResult = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "gateway.controlUi.allowInsecureAuth",
          "true",
        ]),
      );
      extra += `[config] gateway.controlUi.allowInsecureAuth=true exit=${allowInsecureResult.code}\n`;

      const tokenResult = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "gateway.auth.token",
          JSON.stringify(envSecretRef("OPENCLAW_GATEWAY_TOKEN")),
        ]),
        { secrets: [OPENCLAW_GATEWAY_TOKEN] },
      );
      extra += `[config] gateway.auth.token exit=${tokenResult.code}\n`;

      const proxiesResult = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "gateway.trustedProxies",
          '["127.0.0.1"]',
        ]),
      );
      extra += `[config] gateway.trustedProxies exit=${proxiesResult.code}\n`;

      const modelToSet = (payload.model?.trim() || preferredModelFromEnv()).trim();
      if (modelToSet) {
        extra += `[setup] Setting model to ${modelToSet}...\n`;
        const modelResult = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["models", "set", modelToSet]),
        );
        extra += `[models set] exit=${modelResult.code}\n${modelResult.output || ""}`;
      }

      async function configureChannel(name, cfgObj, opts = {}) {
        const secrets = opts.secrets || [];
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs([
            "config",
            "set",
            "--json",
            `channels.${name}`,
            JSON.stringify(cfgObj),
          ]),
          { secrets },
        );
        const get = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "get", `channels.${name}`]),
          { secrets },
        );
        const setOutput = set.output || "(no output)";
        return (
          `\n[${name} config] exit=${set.code} (output ${set.output.length} chars)\n${setOutput}` +
          `\n[${name} verify] exit=${get.code} (output redacted, ${get.output.length} chars)`
        );
      }

      if (payload.telegramToken?.trim()) {
        const telegramToken = payload.telegramToken.trim();
        extra += await configureChannel("telegram", {
          enabled: true,
          dmPolicy: "pairing",
          botToken: telegramToken,
          groupPolicy: "allowlist",
          streamMode: "partial",
        }, { secrets: [telegramToken] });
      }

      const discordPayloadToken = payload.discordToken?.trim() || "";
      const discordEnvToken = envValue("DISCORD_BOT_TOKEN");
      if (discordPayloadToken || discordEnvToken) {
        const discordToken = discordPayloadToken || envSecretRef("DISCORD_BOT_TOKEN");
        extra += await configureChannel(
          "discord",
          buildDiscordChannelConfig(discordToken),
          { secrets: [discordPayloadToken, discordEnvToken].filter(Boolean) },
        );
      }

      if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
        const slackBotToken = payload.slackBotToken?.trim() || undefined;
        const slackAppToken = payload.slackAppToken?.trim() || undefined;
        extra += await configureChannel("slack", {
          enabled: true,
          botToken: slackBotToken,
          appToken: slackAppToken,
        }, { secrets: [slackBotToken, slackAppToken].filter(Boolean) });
      }

      extra += "\n[setup] Starting gateway...\n";
      await restartGateway();
      extra += "[setup] Gateway started.\n";
    }

    return res.status(ok ? 200 : 500).json({
      ok,
      output: `${onboard.output}${extra}`,
    });
  } catch (err) {
    console.error("[/setup/api/run] error:", err);
    return res
      .status(500)
      .json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.get("/setup/api/debug", requireSetupAuth, async (_req, res) => {
  const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
  const help = await runCmd(
    OPENCLAW_NODE,
    clawArgs(["channels", "add", "--help"]),
  );
  res.json({
    wrapper: {
      node: process.version,
      port: PORT,
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
      configPath: configPath(),
      gatewayTokenFromEnv: Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim()),
      gatewayTokenPersisted: fs.existsSync(
        path.join(STATE_DIR, "gateway.token"),
      ),
      railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    },
    openclaw: {
      entry: OPENCLAW_ENTRY,
      node: OPENCLAW_NODE,
      version: v.output.trim(),
      channelsAddHelpIncludesTelegram: help.output.includes("telegram"),
    },
  });
});

app.post("/setup/api/pairing/approve", requireSetupAuth, async (req, res) => {
  const { channel, code } = req.body || {};
  if (!channel || !code) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing channel or code" });
  }
  const r = await runCmd(
    OPENCLAW_NODE,
    clawArgs(["pairing", "approve", String(channel), String(code)]),
  );
  return res
    .status(r.code === 0 ? 200 : 500)
    .json({ ok: r.code === 0, output: r.output });
});

app.post("/setup/api/reset", requireSetupAuth, async (_req, res) => {
  try {
    fs.rmSync(configPath(), { force: true });
    res
      .type("text/plain")
      .send("OK - deleted config file. You can rerun setup now.");
  } catch (err) {
    res.status(500).type("text/plain").send(String(err));
  }
});

app.post("/setup/api/doctor", requireSetupAuth, async (_req, res) => {
  const args = ["doctor", "--non-interactive", "--repair"];
  const result = await runCmd(OPENCLAW_NODE, clawArgs(args));
  return res.status(result.code === 0 ? 200 : 500).json({
    ok: result.code === 0,
    output: result.output,
  });
});

app.post("/setup/api/configure-discord", requireSetupAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ ok: false, output: validationError });
    }

    const discordPayloadToken = payload.discordToken?.trim() || "";
    const discordEnvToken = envValue("DISCORD_BOT_TOKEN");
    if (!discordPayloadToken && !discordEnvToken) {
      return res.status(400).json({
        ok: false,
        output: "Missing Discord token. Set DISCORD_BOT_TOKEN or pass discordToken.",
      });
    }

    const discordToken =
      discordPayloadToken || envSecretRef("DISCORD_BOT_TOKEN");
    const result = await setChannelConfig(
      "discord",
      buildDiscordChannelConfig(discordToken, {
        applicationId: payload.discordApplicationId || "",
      }),
      { secrets: [discordPayloadToken, discordEnvToken].filter(Boolean) },
    );

    let output = result.output;
    if (result.ok) {
      output += "\n[setup] Restarting gateway so Discord config is active...\n";
      await restartGateway();
      output += "[setup] Gateway restarted.\n";
    }

    return res.status(result.ok ? 200 : 500).json({
      ok: result.ok,
      output,
    });
  } catch (err) {
    console.error("[/setup/api/configure-discord] error:", err);
    return res
      .status(500)
      .json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.get("/setup/api/crons", requireSetupAuth, async (_req, res) => {
  const result = await runCmd(OPENCLAW_NODE, clawArgs(["cron", "list"]));
  return res.status(result.code === 0 ? 200 : 500).json({
    ok: result.code === 0,
    output: result.output,
  });
});

app.post("/setup/api/crons/install-personal", requireSetupAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await installPersonalDigestCrons({
      target: payload.target,
      channel: payload.channel,
      tz: payload.tz,
      model: payload.model,
      thinking: payload.thinking,
    });
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    console.error("[/setup/api/crons/install-personal] error:", err);
    return res
      .status(500)
      .json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.post("/setup/api/discord/test", requireSetupAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const target = (payload.target || discordDeliveryTargetFromEnv()).trim();
    if (!target) {
      return res.status(400).json({
        ok: false,
        output:
          "Missing Discord delivery target. Set DISCORD_PERSONAL_CHANNEL_TARGET or DISCORD_PERSONAL_CHANNEL_ID.",
      });
    }

    await ensureGatewayRunning();
    const message =
      (payload.message || "").trim() ||
      "✅ Clawbot Personal quedó conectado a Discord. Si ves esto, el canal de avisos funciona.";
    const result = await runCmd(
      OPENCLAW_NODE,
      clawArgs([
        "message",
        "send",
        "--channel",
        "discord",
        "--target",
        target,
        "--message",
        message,
      ]),
    );
    return res.status(result.code === 0 ? 200 : 500).json({
      ok: result.code === 0,
      output: result.output,
    });
  } catch (err) {
    console.error("[/setup/api/discord/test] error:", err);
    return res
      .status(500)
      .json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.get("/setup/api/devices", requireSetupAuth, async (_req, res) => {
  const args = ["devices", "list", "--json", "--token", OPENCLAW_GATEWAY_TOKEN];
  const result = await runCmd(OPENCLAW_NODE, clawArgs(args));
  console.log(`[devices] list exit=${result.code} output=${redactSecrets(result.output)}`);
  try {
    const jsonMatch = result.output.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
    if (!jsonMatch) {
      console.warn("[devices] no JSON found in output");
      return res.json({ ok: result.code === 0, raw: result.output });
    }
    const data = JSON.parse(jsonMatch[1]);
    console.log(`[devices] parsed keys=${Object.keys(data)} pending=${JSON.stringify(data.pending)} paired=${JSON.stringify(data.paired)}`);
    return res.json({ ok: true, data, raw: result.output });
  } catch (parseErr) {
    console.warn(`[devices] JSON parse failed: ${parseErr.message}`);
    return res.json({ ok: result.code === 0, raw: result.output });
  }
});

app.post("/setup/api/devices/approve", requireSetupAuth, async (req, res) => {
  const { requestId } = req.body || {};
  const args = ["devices", "approve"];
  if (requestId) {
    args.push(String(requestId));
  } else {
    args.push("--latest");
  }
  args.push("--token", OPENCLAW_GATEWAY_TOKEN);
  const result = await runCmd(OPENCLAW_NODE, clawArgs(args));
  return res
    .status(result.code === 0 ? 200 : 500)
    .json({ ok: result.code === 0, output: result.output });
});

app.post("/setup/api/devices/reject", requireSetupAuth, async (req, res) => {
  const { requestId } = req.body || {};
  if (!requestId) {
    return res.status(400).json({ ok: false, error: "Missing requestId" });
  }
  const args = [
    "devices", "reject", String(requestId),
    "--token", OPENCLAW_GATEWAY_TOKEN,
  ];
  const result = await runCmd(OPENCLAW_NODE, clawArgs(args));
  return res
    .status(result.code === 0 ? 200 : 500)
    .json({ ok: result.code === 0, output: result.output });
});

app.get("/setup/api/export", requireSetupAuth, async (_req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const zipName = `openclaw-export-${timestamp}.zip`;
  const tmpZip = path.join(os.tmpdir(), zipName);

  try {
    const dirsToExport = [];
    if (fs.existsSync(STATE_DIR)) dirsToExport.push(STATE_DIR);
    if (fs.existsSync(WORKSPACE_DIR)) dirsToExport.push(WORKSPACE_DIR);

    if (dirsToExport.length === 0) {
      return res.status(404).json({ ok: false, error: "No data directories found to export." });
    }

    const zipArgs = ["-r", "-P", SETUP_PASSWORD, tmpZip, ...dirsToExport];
    const result = await runCmd("zip", zipArgs);

    if (result.code !== 0 || !fs.existsSync(tmpZip)) {
      return res.status(500).json({ ok: false, error: "Failed to create export archive.", output: result.output });
    }

    const stat = fs.statSync(tmpZip);
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Content-Length": String(stat.size),
    });

    const stream = fs.createReadStream(tmpZip);
    stream.pipe(res);
    stream.on("end", () => {
      try { fs.rmSync(tmpZip, { force: true }); } catch { }
    });
    stream.on("error", (err) => {
      console.error("[export] stream error:", err);
      try { fs.rmSync(tmpZip, { force: true }); } catch { }
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "Stream error during export." });
      }
    });
  } catch (err) {
    try { fs.rmSync(tmpZip, { force: true }); } catch { }
    console.error("[export] error:", err);
    return res.status(500).json({ ok: false, error: `Export failed: ${err.message}` });
  }
});

app.get("/tui", requireSetupAuth, (_req, res) => {
  if (!ENABLE_WEB_TUI) {
    return res
      .status(403)
      .type("text/plain")
      .send("Web TUI is disabled. Set ENABLE_WEB_TUI=true to enable it.");
  }
  if (!isConfigured()) {
    return res.redirect("/setup");
  }
  res.sendFile(path.join(process.cwd(), "src", "public", "tui.html"));
});

let activeTuiSession = null;

function verifyTuiAuth(req) {
  if (!SETUP_PASSWORD) return false;
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  const passwordHash = crypto.createHash("sha256").update(password).digest();
  const expectedHash = crypto.createHash("sha256").update(SETUP_PASSWORD).digest();
  return crypto.timingSafeEqual(passwordHash, expectedHash);
}

function createTuiWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket?.remoteAddress || "unknown";
    console.log(`[tui] session started from ${clientIp}`);

    let ptyProcess = null;
    let idleTimer = null;
    let maxSessionTimer = null;

    activeTuiSession = {
      ws,
      pty: null,
      startedAt: Date.now(),
      lastActivity: Date.now(),
    };

    function resetIdleTimer() {
      if (activeTuiSession) {
        activeTuiSession.lastActivity = Date.now();
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log("[tui] session idle timeout");
        ws.close(4002, "Idle timeout");
      }, TUI_IDLE_TIMEOUT_MS);
    }

    function spawnPty(cols, rows) {
      if (ptyProcess) return;

      console.log(`[tui] spawning PTY with ${cols}x${rows}`);
      ptyProcess = pty.spawn(OPENCLAW_NODE, clawArgs(["tui"]), {
        name: "xterm-256color",
        cols,
        rows,
        cwd: WORKSPACE_DIR,
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: STATE_DIR,
          OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
          TERM: "xterm-256color",
        },
      });

      if (activeTuiSession) {
        activeTuiSession.pty = ptyProcess;
      }

      idleTimer = setTimeout(() => {
        console.log("[tui] session idle timeout");
        ws.close(4002, "Idle timeout");
      }, TUI_IDLE_TIMEOUT_MS);

      maxSessionTimer = setTimeout(() => {
        console.log("[tui] max session duration reached");
        ws.close(4002, "Max session duration");
      }, TUI_MAX_SESSION_MS);

      ptyProcess.onData((data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[tui] PTY exited code=${exitCode} signal=${signal}`);
        if (ws.readyState === ws.OPEN) {
          ws.close(1000, "Process exited");
        }
      });
    }

    ws.on("message", (message) => {
      resetIdleTimer();
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === "resize" && msg.cols && msg.rows) {
          const cols = Math.min(Math.max(msg.cols, 10), 500);
          const rows = Math.min(Math.max(msg.rows, 5), 200);
          if (!ptyProcess) {
            spawnPty(cols, rows);
          } else {
            ptyProcess.resize(cols, rows);
          }
        } else if (msg.type === "input" && msg.data && ptyProcess) {
          ptyProcess.write(msg.data);
        }
      } catch (err) {
        console.warn(`[tui] invalid message: ${err.message}`);
      }
    });

    ws.on("close", () => {
      console.log("[tui] session closed");
      clearTimeout(idleTimer);
      clearTimeout(maxSessionTimer);
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch { }
      }
      activeTuiSession = null;
    });

    ws.on("error", (err) => {
      console.error(`[tui] WebSocket error: ${err.message}`);
    });
  });

  return wss;
}

const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  xfwd: true,
  changeOrigin: true,
  proxyTimeout: 120_000,
  timeout: 120_000,
});

proxy.on("error", (err, _req, res) => {
  console.error("[proxy]", err);
  if (res && typeof res.headersSent !== "undefined" && !res.headersSent) {
    res.writeHead(503, { "Content-Type": "text/html" });
    try {
      const html = fs.readFileSync(
        path.join(process.cwd(), "src", "public", "loading.html"),
        "utf8",
      );
      res.end(html);
    } catch {
      res.end("Gateway unavailable. Retrying...");
    }
  }
});

const PROXY_ORIGIN = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : GATEWAY_TARGET;

proxy.on("proxyReq", (proxyReq, req, res) => {
  if (!req.url?.startsWith("/hooks/")) {
    proxyReq.setHeader("Authorization", `Bearer ${OPENCLAW_GATEWAY_TOKEN}`);
  }
  proxyReq.setHeader("Origin", PROXY_ORIGIN);
});

proxy.on("proxyReqWs", (proxyReq, req, socket, options, head) => {
  proxyReq.setHeader("Authorization", `Bearer ${OPENCLAW_GATEWAY_TOKEN}`);
  proxyReq.setHeader("Origin", PROXY_ORIGIN);
});

app.use(async (req, res) => {
  if (!isConfigured() && !req.path.startsWith("/setup")) {
    return res.redirect("/setup");
  }

  if (isConfigured()) {
    if (!isGatewayReady()) {
      try {
        await ensureGatewayRunning();
      } catch {
        return res
          .status(503)
          .sendFile(path.join(process.cwd(), "src", "public", "loading.html"));
      }

      if (!isGatewayReady()) {
        return res
          .status(503)
          .sendFile(path.join(process.cwd(), "src", "public", "loading.html"));
      }
    }
  }

  if (req.path === "/openclaw" && !req.query.token) {
    // Token is no longer auto-injected via URL.
    // Users must manually paste it in Dashboard > Overview > Gateway Token.
  }

  return proxy.web(req, res, { target: GATEWAY_TARGET });
});

const server = app.listen(PORT, () => {
  console.log(`[wrapper] listening on port ${PORT}`);
  console.log(`[wrapper] setup wizard: http://localhost:${PORT}/setup`);
  console.log(`[wrapper] web TUI: ${ENABLE_WEB_TUI ? "enabled" : "disabled"}`);
  console.log(`[wrapper] configured: ${isConfigured()}`);

  if (isConfigured()) {
    (async () => {
      try {
        console.log("[wrapper] running openclaw doctor --fix...");
        const dr = await runCmd(OPENCLAW_NODE, clawArgs(["doctor", "--fix"]));
        console.log(`[wrapper] doctor --fix exit=${dr.code}`);
        if (dr.output) console.log(dr.output);
      } catch (err) {
        console.warn(`[wrapper] doctor --fix failed: ${err.message}`);
      }
      await ensureGatewayRunning();
    })().catch((err) => {
      console.error(`[wrapper] failed to start gateway at boot: ${err.message}`);
    });
  }
});

const tuiWss = createTuiWebSocketServer(server);

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/tui/ws") {
    if (!ENABLE_WEB_TUI) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!verifyTuiAuth(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"OpenClaw TUI\"\r\n\r\n");
      socket.destroy();
      return;
    }

    if (activeTuiSession) {
      socket.write("HTTP/1.1 409 Conflict\r\n\r\n");
      socket.destroy();
      return;
    }

    tuiWss.handleUpgrade(req, socket, head, (ws) => {
      tuiWss.emit("connection", ws, req);
    });
    return;
  }

  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  try {
    await ensureGatewayRunning();
  } catch (err) {
    console.warn(`[websocket] gateway not ready: ${err.message}`);
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head, { target: GATEWAY_TARGET });
});

async function gracefulShutdown(signal) {
  console.log(`[wrapper] received ${signal}, shutting down`);
  shuttingDown = true;

  if (setupRateLimiter.cleanupInterval) {
    clearInterval(setupRateLimiter.cleanupInterval);
  }

  if (activeTuiSession) {
    try {
      activeTuiSession.ws.close(1001, "Server shutting down");
      activeTuiSession.pty.kill();
    } catch { }
    activeTuiSession = null;
  }

  server.close();

  if (gatewayProc) {
    try {
      gatewayProc.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => gatewayProc.on("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (gatewayProc && !gatewayProc.killed) {
        gatewayProc.kill("SIGKILL");
      }
    } catch (err) {
      console.warn(`[wrapper] error killing gateway: ${err.message}`);
    }
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
