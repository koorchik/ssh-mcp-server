# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an SSH MCP (Model Context Protocol) server that enables executing commands on remote hosts via SSH. The server provides two main tools:
- `ssh_exec`: Execute commands on a configured SSH host
- `ssh_info`: Get information about the configured SSH connection

## Development Commands

### Build and Run
```bash
# Build the TypeScript code
npm run build

# Run the built server
npm start

# Build and run in one step (development)
npm run dev
```

The compiled JavaScript output goes to the `build/` directory.

## Architecture

### Core Components

**SSHMCPServer Class** (`src/index.ts`):
- Main server implementation using the MCP SDK
- Handles SSH connection configuration via environment variables
- Implements tool handlers for SSH operations
- Manages SSH connection lifecycle and error handling

**SSH Configuration** (`src/index.ts:15-22`):
- Supports both password and private key authentication
- Configurable via environment variables (SSH_HOST, SSH_USERNAME, etc.)
- Includes timeout and working directory support for command execution

### Key Features

- **Environment-based Configuration**: SSH connection details loaded from environment variables with fallback defaults
- **Dual Authentication**: Supports both password and private key authentication methods
- **Command Execution**: Executes commands with optional working directory and timeout control
- **Structured Output**: Returns detailed JSON responses including exit codes, stdout, stderr, and timestamps
- **Error Handling**: Comprehensive error handling with proper MCP error codes

### Environment Variables

Required/Optional SSH configuration:
- `SSH_HOST` (default: hardcoded IP)
- `SSH_USERNAME` (default: hardcoded username)
- `SSH_PASSWORD` (optional, for password auth)
- `SSH_PRIVATE_KEY_PATH` (optional, for key auth)
- `SSH_PASSPHRASE` (optional, for encrypted keys)
- `SSH_PORT` (default: 22)

## File Structure

- `src/index.ts`: Single-file implementation containing the entire MCP server
- `build/`: TypeScript compilation output
- `package.json`: Defines the CLI binary as `ssh-mcp-server`