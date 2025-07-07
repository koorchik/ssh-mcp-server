# SSH MCP Server

An SSH MCP (Model Context Protocol) server that enables executing commands on remote hosts via SSH. The server maintains a persistent SSH connection to one host at a time, allowing multiple commands to be executed efficiently without reconnecting.

## Features

- **Persistent SSH Connection**: Maintains one SSH connection at a time for efficient command execution
- **Dual Authentication**: Supports both password and private key authentication methods
- **Command Execution**: Execute commands with optional working directory and timeout control
- **Structured Output**: Returns detailed JSON responses including exit codes, stdout, stderr, and timestamps
- **Error Handling**: Comprehensive error handling with proper MCP error codes
- **Connection Management**: Tools to connect, disconnect, and check connection status

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

### Build and Run

```bash
# Build the TypeScript code
npm run build

# Run the built server
npm start

# Build and run in one step (development)
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Usage

The SSH MCP server provides four main tools for managing SSH connections and executing commands:

### 1. Connect to SSH Server

```json
{
  "name": "ssh_connect",
  "arguments": {
    "host": "example.com",
    "username": "user",
    "port": 22,
    "password": "your-password"
  }
}
```

Or using private key authentication:

```json
{
  "name": "ssh_connect",
  "arguments": {
    "host": "example.com",
    "username": "user",
    "port": 22,
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "passphrase": "optional-passphrase"
  }
}
```

### 2. Execute Commands

```json
{
  "name": "ssh_exec",
  "arguments": {
    "command": "ls -la",
    "timeout": 30000,
    "workingDirectory": "/home/user"
  }
}
```

### 3. Check Connection Status

```json
{
  "name": "ssh_status",
  "arguments": {}
}
```

### 4. Disconnect

```json
{
  "name": "ssh_disconnect",
  "arguments": {}
}
```

## Tool Parameters

### ssh_connect

**Required:**
- `host`: SSH hostname or IP address
- `username`: SSH username

**Optional:**
- `port`: SSH port (default: 22)
- `password`: Password for authentication
- `privateKey`: Private key content for key-based authentication
- `passphrase`: Passphrase for encrypted private keys

**Note:** Must provide either `password` OR `privateKey` for authentication.

### ssh_exec

**Required:**
- `command`: Command to execute

**Optional:**
- `timeout`: Command timeout in milliseconds (default: 30000)
- `workingDirectory`: Working directory for command execution

### ssh_status

No parameters required.

### ssh_disconnect

No parameters required.

## Workflow

1. **Connect**: Use `ssh_connect` to establish connection to an SSH server
2. **Execute**: Use `ssh_exec` multiple times to run commands on the connected server
3. **Switch**: Use `ssh_disconnect` then `ssh_connect` to switch to a different server
4. **Status**: Use `ssh_status` to check current connection details

## Response Format

Command execution returns structured JSON with:
- `exitCode`: Command exit code
- `stdout`: Standard output
- `stderr`: Standard error output
- `timestamp`: Execution timestamp
- `success`: Boolean indicating if command succeeded

## Error Handling

The server provides comprehensive error handling with proper MCP error codes for:
- Connection failures
- Authentication errors
- Command execution timeouts
- Network issues
- Invalid parameters

## File Structure

- `src/index.ts`: Entry point that starts the MCP server
- `src/ssh-mcp-server.ts`: Main SSH MCP server implementation
- `tests/`: Jest unit tests for the server functionality
- `build/`: TypeScript compilation output
- `package.json`: Defines the CLI binary as `ssh-mcp-server`

## License

This project is licensed under the MIT License.