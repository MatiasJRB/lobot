#!/usr/bin/env node
import fs from "node:fs";
import { boolFromEnv } from "../personal/env.js";
import { googleApiJson } from "../personal/google.js";

// Gmail action CLI. MVP scope: create DRAFTS only, never send.
// Sending is intentionally not implemented; outbound email belongs to a later
// phase with explicit per-message confirmation (geome7ric-engineering#19/#20).
// Requires the gmail.compose (or gmail.modify) OAuth scope on the refresh
// token; the read-only scope used by the digest is not enough to create drafts.

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function command() {
  const cmd = process.argv.find((arg, idx) => idx > 1 && !arg.startsWith("--"));
  return cmd || "help";
}

function usage() {
  return `Uso:
  node src/cli/gmail-action.js draft --confirm --to dest@dominio --subject "..." --body "..." \\
      [--cc a@b] [--bcc a@b] [--thread-id ID] [--in-reply-to <Message-Id>] [--body-file ruta]

Seguridad:
  - Solo crea BORRADORES; nunca envía. Enviar es una fase posterior con confirmación explícita.
  - Requiere GMAIL_WRITE_ENABLED=true y --confirm.
  - Requiere scope gmail.compose en el refresh token (el de solo lectura del digest no alcanza).
  - Pedí confirmación explícita de Matías antes de crear el borrador.
`;
}

function requireGmailWrite(action) {
  if (!boolFromEnv("GMAIL_WRITE_ENABLED", false)) {
    throw new Error(`${action} bloqueado: seteá GMAIL_WRITE_ENABLED=true para permitir borradores de Gmail.`);
  }
  if (!hasFlag("confirm")) {
    throw new Error(`${action} bloqueado: falta --confirm. Confirmá explícitamente con Matías antes de crear el borrador.`);
  }
}

function requireValue(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Falta --${name}`);
  return value;
}

// RFC 2047 encode a header only when it carries non-ASCII characters.
function encodeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMessage({ to, cc, bcc, subject, body, inReplyTo }) {
  const headers = [`To: ${to}`];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${encodeHeader(subject || "(sin asunto)")}`);
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");
  const encodedBody = Buffer.from(body || "", "utf8").toString("base64");
  const raw = `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

async function createDraft() {
  requireGmailWrite("draft");
  const to = requireValue("to");
  const subject = argValue("subject");
  const bodyFile = argValue("body-file");
  const body = argValue("body") || (bodyFile ? fs.readFileSync(bodyFile, "utf8") : "");
  const message = {
    raw: buildRawMessage({
      to,
      cc: argValue("cc"),
      bcc: argValue("bcc"),
      subject,
      body,
      inReplyTo: argValue("in-reply-to"),
    }),
  };
  const threadId = argValue("thread-id");
  if (threadId) message.threadId = threadId;

  const data = await googleApiJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    service: "gmail",
    method: "POST",
    body: { message },
  });
  return {
    ok: true,
    action: "draft",
    draftId: data.id,
    messageId: data.message?.id,
    threadId: data.message?.threadId,
    to,
    subject: subject || "(sin asunto)",
    note: "Borrador creado. Revisalo y envialo vos desde Gmail; este CLI no envía.",
  };
}

async function main() {
  switch (command()) {
    case "draft":
      return createDraft();
    case "send":
      throw new Error("Enviar no está implementado por diseño. Creá un borrador con `draft` y envialo vos.");
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return null;
    default:
      throw new Error(`Comando desconocido.\n${usage()}`);
  }
}

main()
  .then((result) => {
    if (result) console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(err.message || String(err));
    process.exit(1);
  });
