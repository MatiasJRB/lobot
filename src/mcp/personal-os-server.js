#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPersonalOsMcpServer } from "./personal-os-mcp.js";

const server = createPersonalOsMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Personal OS read-only MCP server ready on stdio");
