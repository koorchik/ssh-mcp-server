#!/usr/bin/env node

import { SSHMCPServer } from './ssh-mcp-server.js';

// Start the server
const server = new SSHMCPServer();
server.run().catch((error) => {
  console.error('Failed to start SSH MCP server:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});