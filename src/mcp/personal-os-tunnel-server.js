#!/usr/bin/env node
import readline from "node:readline";

import {
  getExecutiveInbox,
  getPersonalOsCard,
  readKnowledgeNote,
  searchPersonalOs,
} from "./personal-os-tools.js";

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const tools = [
  {
    name: "personal_os_search",
    title: "Buscar en Personal OS",
    description: "Busca en las fichas operativas y notas verificadas del Personal OS canónico. Usar antes de afirmar que no hay información sobre un tema.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2, maxLength: 500, description: "Pregunta o tema a buscar, en lenguaje natural" },
        limit: { type: "integer", minimum: 1, maximum: 12, default: 8, description: "Máximo de fichas y notas" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: "personal_os_get_card",
    title: "Leer ficha exacta de Personal OS",
    description: "Obtiene una ficha por su ID exacto, incluyendo estado, responsable, próximo paso, fechas y evidencia disponible. Sólo lectura.",
    inputSchema: {
      type: "object",
      properties: { item_id: { type: "string", minLength: 1, maxLength: 100, description: "ID exacto devuelto por personal_os_search" } },
      required: ["item_id"],
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: "personal_os_executive_inbox",
    title: "Leer bandeja ejecutiva",
    description: "Devuelve la bandeja ejecutiva vigente del Personal OS para saber qué requiere acción, seguimiento o espera. Sólo lectura.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: "personal_os_read_note",
    title: "Leer nota verificada",
    description: "Lee una nota verificada del knowledge hub usando una ruta devuelta por personal_os_search. Rechaza Inbox, propuestas no verificadas y contenido restringido.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 3, maxLength: 500, description: "Ruta relativa .md devuelta por personal_os_search" } },
      required: ["path"],
      additionalProperties: false,
    },
    annotations,
  },
];

function result(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function callTool(name, args = {}) {
  switch (name) {
    case "personal_os_search":
      return result(searchPersonalOs(args.query, { limit: args.limit }));
    case "personal_os_get_card":
      return result(getPersonalOsCard(args.item_id));
    case "personal_os_executive_inbox":
      return result(getExecutiveInbox());
    case "personal_os_read_note":
      return result(readKnowledgeNote(args.path));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, value) {
  write({ jsonrpc: "2.0", id, result: value });
}

function failure(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(message) {
  const { id, method, params = {} } = message;

  // Hosted ChatGPT currently probes the newer stateless MCP method before
  // falling back to the legacy lifecycle. An immediate Method not found is the
  // compatibility signal; never forward it into the stateful SDK transport.
  if (method === "server/discover") {
    if (id !== undefined) failure(id, -32601, "Method not found");
    return;
  }

  // The tunnel may deliver two initialize requests for the same shared stdio
  // process. This server is deliberately stateless and answers both.
  if (method === "initialize") {
    success(id, {
      protocolVersion: params.protocolVersion || "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "personal-os-readonly", version: "0.1.0" },
    });
    return;
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") return success(id, {});
  if (method === "tools/list") return success(id, { tools });

  if (method === "tools/call") {
    try {
      success(id, callTool(params.name, params.arguments));
    } catch (error) {
      success(id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      });
    }
    return;
  }

  if (id !== undefined) failure(id, -32601, "Method not found");
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch (error) {
    console.error("Invalid MCP request", error);
    failure(null, -32700, "Parse error");
  }
});

console.error("Personal OS tunnel-compatible read-only MCP server ready on stdio");
