# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an SSH MCP (Model Context Protocol) server that enables executing commands on remote hosts via SSH. The server maintains a persistent SSH connection to one host at a time, allowing multiple commands to be executed efficiently without reconnecting.

**Main Tools:**
- `ssh_connect`: Establish a persistent connection to an SSH server
- `ssh_exec`: Execute commands on the connected SSH server
- `ssh_disconnect`: Close the current SSH connection
- `ssh_status`: Check the current connection status

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
- Maintains a persistent SSH connection to one host at a time
- Implements tool handlers for connection management and command execution
- Manages SSH connection lifecycle and error handling

**SSH Connection Management** (`src/index.ts:15-22`):
- Supports both password and private key authentication
- Maintains persistent connection until explicitly disconnected
- Includes timeout and working directory support for command execution
- Supports private key via direct content provided by agent
- Automatic connection cleanup on server shutdown

### Key Features

- **Persistent Connection**: Maintains one SSH connection at a time for efficient command execution
- **Dual Authentication**: Supports both password and private key authentication methods
- **Command Execution**: Executes commands with optional working directory and timeout control
- **Structured Output**: Returns detailed JSON responses including exit codes, stdout, stderr, and timestamps
- **Error Handling**: Comprehensive error handling with proper MCP error codes
- **Connection Management**: Tools to connect, disconnect, and check connection status

### Usage Workflow

1. **Connect**: Use `ssh_connect` to establish connection to an SSH server
2. **Execute**: Use `ssh_exec` multiple times to run commands on the connected server
3. **Switch**: Use `ssh_disconnect` then `ssh_connect` to switch to a different server
4. **Status**: Use `ssh_status` to check current connection details

### Tool Parameters

**ssh_connect** - Required parameters:
- `host`: SSH hostname or IP address
- `username`: SSH username

**ssh_connect** - Optional parameters:
- `port`: SSH port (default: 22)
- `password`: Password for authentication
- `privateKey`: Private key content for key-based authentication
- `passphrase`: Passphrase for encrypted private keys

**ssh_exec** - Required parameters:
- `command`: Command to execute

**ssh_exec** - Optional parameters:
- `timeout`: Command timeout in milliseconds (default: 30000)
- `workingDirectory`: Working directory for command execution

**Authentication**: Must provide either `password` OR `privateKey`

## File Structure

- `src/index.ts`: Single-file implementation containing the entire MCP server
- `build/`: TypeScript compilation output
- `package.json`: Defines the CLI binary as `ssh-mcp-server`