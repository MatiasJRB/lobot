const DEFAULT_AUDIO_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_AUDIO_TIMEOUT_SECONDS = 90;

function envValue(env, name) {
  return String(env[name] ?? "").trim();
}

function booleanFromEnv(env, name, fallback) {
  const value = envValue(env, name).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function buildPersonalAudioMediaConfig(env = process.env) {
  const enabled = booleanFromEnv(env, "PERSONAL_AUDIO_INTAKE_ENABLED", true);
  const model = envValue(env, "PERSONAL_AUDIO_TRANSCRIPTION_MODEL") || DEFAULT_AUDIO_MODEL;
  const maxBytes = boundedInteger(
    envValue(env, "PERSONAL_AUDIO_MAX_BYTES"),
    DEFAULT_AUDIO_MAX_BYTES,
    1024,
    25 * 1024 * 1024,
  );
  const timeoutSeconds = boundedInteger(
    envValue(env, "PERSONAL_AUDIO_TIMEOUT_SECONDS"),
    DEFAULT_AUDIO_TIMEOUT_SECONDS,
    10,
    300,
  );

  return {
    models: [
      {
        type: "provider",
        provider: "google",
        model,
        capabilities: ["audio"],
        maxBytes,
        timeoutSeconds,
        language: "es",
      },
    ],
    audio: {
      enabled,
      preferredModel: `google/${model}`,
      maxBytes,
      timeoutSeconds,
      language: "es",
      echoTranscript: false,
      attachments: {
        mode: "first",
        maxAttachments: 1,
      },
      scope: {
        default: "deny",
        rules: [
          {
            action: "allow",
            match: {
              channel: "whatsapp",
              chatType: "direct",
            },
          },
        ],
      },
    },
  };
}
