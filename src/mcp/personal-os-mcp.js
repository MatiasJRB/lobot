import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  getExecutiveInbox,
  getPersonalOsCard,
  readKnowledgeNote,
  searchPersonalOs,
} from "./personal-os-tools.js";

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function result(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function createPersonalOsMcpServer() {
  const server = new McpServer({ name: "personal-os-readonly", version: "0.1.0" });

  server.registerTool("personal_os_search", {
    title: "Buscar en Personal OS",
    description: "Busca en las fichas operativas y notas verificadas del Personal OS canónico. Usar antes de afirmar que no hay información sobre un tema.",
    inputSchema: {
      query: z.string().min(2).max(500).describe("Pregunta o tema a buscar, en lenguaje natural"),
      limit: z.number().int().min(1).max(12).default(8).describe("Máximo de fichas y notas"),
    },
    annotations: readOnlyAnnotations,
  }, async ({ query, limit }) => result(searchPersonalOs(query, { limit })));

  server.registerTool("personal_os_get_card", {
    title: "Leer ficha exacta de Personal OS",
    description: "Obtiene una ficha por su ID exacto, incluyendo estado, responsable, próximo paso, fechas y evidencia disponible. Sólo lectura.",
    inputSchema: { item_id: z.string().min(1).max(100).describe("ID exacto devuelto por personal_os_search") },
    annotations: readOnlyAnnotations,
  }, async ({ item_id }) => result(getPersonalOsCard(item_id)));

  server.registerTool("personal_os_executive_inbox", {
    title: "Leer bandeja ejecutiva",
    description: "Devuelve la bandeja ejecutiva vigente del Personal OS para saber qué requiere acción, seguimiento o espera. Sólo lectura.",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  }, async () => result(getExecutiveInbox()));

  server.registerTool("personal_os_read_note", {
    title: "Leer nota verificada",
    description: "Lee una nota verificada del knowledge hub usando una ruta devuelta por personal_os_search. Rechaza Inbox, propuestas no verificadas y contenido restringido.",
    inputSchema: { path: z.string().min(3).max(500).describe("Ruta relativa .md devuelta por personal_os_search") },
    annotations: readOnlyAnnotations,
  }, async ({ path }) => result(readKnowledgeNote(path)));

  return server;
}
