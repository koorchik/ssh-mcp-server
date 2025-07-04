#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

class SSHMCPServer {
  private server: Server;
  private sshConfig: SSHConfig;

  constructor() {
    // Load SSH configuration from environment variables
    this.sshConfig = this.loadSSHConfig();

    this.server = new Server(
      {
        name: "ssh-command-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private loadSSHConfig(): SSHConfig {
    const host = process.env.SSH_HOST || '172.18.8.219';
    const port = parseInt(process.env.SSH_PORT || '22');
    const username = process.env.SSH_USERNAME || 'koorchik';
    const password = process.env.SSH_PASSWORD || 'koorchik';
    const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
    const passphrase = process.env.SSH_PASSPHRASE;

    if (!host || !username) {
      throw new Error(
        'SSH configuration incomplete. Required: SSH_HOST, SSH_USERNAME. ' +
        'Optional: SSH_PORT, SSH_PASSWORD, SSH_PRIVATE_KEY_PATH, SSH_PASSPHRASE'
      );
    }

    const config: SSHConfig = {
      host,
      port,
      username,
      password,
      passphrase,
    };

    // Load private key if path is provided
    if (privateKeyPath) {
      try {
        const keyPath = path.resolve(privateKeyPath);
        config.privateKey = fs.readFileSync(keyPath, 'utf8');
      } catch (error) {
        throw new Error(
          `Failed to read private key file '${privateKeyPath}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate authentication method
    if (!config.privateKey && !config.password) {
      throw new Error(
        'SSH authentication incomplete. Provide either SSH_PASSWORD or SSH_PRIVATE_KEY_PATH'
      );
    }

    return config;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "ssh_exec",
            description: "Execute command via SSH on the configured host",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "Command to execute",
                },
                timeout: {
                  type: "number",
                  description: "Timeout in milliseconds (default: 30000)",
                  default: 30000,
                },
                workingDirectory: {
                  type: "string",
                  description: "Working directory for command execution (optional)",
                },
              },
              required: ["command"],
            },
          },
          {
            name: "ssh_info",
            description: "Get information about the configured SSH host",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "ssh_exec":
            return await this.executeSSHCommand(args);
          case "ssh_info":
            return await this.getSSHInfo();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async getSSHInfo() {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            host: this.sshConfig.host,
            port: this.sshConfig.port,
            username: this.sshConfig.username,
            authMethod: this.sshConfig.privateKey ? "key" : "password",
            keyConfigured: !!this.sshConfig.privateKey,
            passwordConfigured: !!this.sshConfig.password,
          }, null, 2),
        },
      ],
    };
  }

  private async executeSSHCommand(args: any): Promise<any> {
    const { command, timeout = 30000, workingDirectory } = args;

    if (!command || typeof command !== 'string') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Command is required and must be a string'
      );
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      let errorOutput = '';
      let exitCode: number | null = null;

      const timeoutId = setTimeout(() => {
        conn.end();
        reject(new McpError(
          ErrorCode.InternalError,
          `SSH command timed out after ${timeout}ms`
        ));
      }, timeout);

      conn.on('ready', () => {
        // Prepare the command with working directory if specified
        let finalCommand = command;
        if (workingDirectory) {
          finalCommand = `cd "${workingDirectory}" && ${command}`;
        }

        conn.exec(finalCommand, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            conn.end();
            reject(new McpError(
              ErrorCode.InternalError,
              `Failed to execute command: ${err.message}`
            ));
            return;
          }

          stream.on('close', (code: number) => {
            clearTimeout(timeoutId);
            exitCode = code;
            conn.end();
            
            resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    command: finalCommand,
                    originalCommand: command,
                    workingDirectory,
                    exitCode,
                    stdout: output,
                    stderr: errorOutput,
                    success: exitCode === 0,
                    timestamp: new Date().toISOString(),
                  }, null, 2),
                },
              ],
            });
          });

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr?.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new McpError(
          ErrorCode.InternalError,
          `SSH connection failed: ${err.message}`
        ));
      });

      // Connect with the configuration
      const connectOptions: any = {
        host: this.sshConfig.host,
        port: this.sshConfig.port,
        username: this.sshConfig.username,
      };

      if (this.sshConfig.privateKey) {
        connectOptions.privateKey = this.sshConfig.privateKey;
        if (this.sshConfig.passphrase) {
          connectOptions.passphrase = this.sshConfig.passphrase;
        }
      } else if (this.sshConfig.password) {
        connectOptions.password = this.sshConfig.password;
      }

      conn.connect(connectOptions);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`SSH MCP server connected to ${this.sshConfig.host}:${this.sshConfig.port}`);
  }
}

// Start the server
try {
  const server = new SSHMCPServer();
  server.run().catch(console.error);
} catch (error) {
  console.error('Failed to start SSH MCP server:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}