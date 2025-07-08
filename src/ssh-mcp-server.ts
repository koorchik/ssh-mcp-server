import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from 'ssh2';

interface SSHConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export class SSHMCPServer {
  private server: Server;
  private sshConnection: Client | null = null;
  private connectionConfig: SSHConnectionConfig | null = null;
  private isConnected = false;

  constructor() {
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

  private validateSSHConfig(config: SSHConnectionConfig): void {
    if (!config.host || !config.username) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SSH configuration incomplete. Required: host, username'
      );
    }

    if (!config.password && !config.privateKey) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SSH authentication incomplete. Provide either password or privateKey'
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "ssh_connect",
            description: "Connect to an SSH server and maintain the connection",
            inputSchema: {
              type: "object",
              properties: {
                host: {
                  type: "string",
                  description: "SSH host to connect to",
                },
                port: {
                  type: "number",
                  description: "SSH port (default: 22)",
                  default: 22,
                },
                username: {
                  type: "string",
                  description: "SSH username",
                },
                password: {
                  type: "string",
                  description: "SSH password (if using password authentication)",
                },
                privateKey: {
                  type: "string",
                  description: "SSH private key content (if using key authentication)",
                },
                passphrase: {
                  type: "string",
                  description: "Passphrase for encrypted private key (optional)",
                },
              },
              required: ["host", "username"],
            },
          },
          {
            name: "ssh_disconnect",
            description: "Disconnect from the current SSH server",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "ssh_exec",
            description: "Execute command on the connected SSH server",
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
            name: "ssh_status",
            description: "Get the current SSH connection status",
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
          case "ssh_connect":
            return await this.connectToSSH(args);
          case "ssh_disconnect":
            return await this.disconnectFromSSH();
          case "ssh_exec":
            return await this.executeSSHCommand(args);
          case "ssh_status":
            return await this.getSSHStatus();
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

  private async connectToSSH(args: any): Promise<any> {
    const { 
      host, 
      port = 22, 
      username, 
      password, 
      privateKey, 
      passphrase
    } = args;

    // Disconnect from existing connection if any
    if (this.sshConnection) {
      this.sshConnection.end();
      this.sshConnection = null;
      this.isConnected = false;
    }

    const sshConfig: SSHConnectionConfig = {
      host,
      port,
      username,
      password,
      privateKey,
      passphrase,
    };

    this.validateSSHConfig(sshConfig);

    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        this.sshConnection = conn;
        this.connectionConfig = sshConfig;
        this.isConnected = true;
        
        resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "connected",
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                authMethod: sshConfig.privateKey ? "key" : "password",
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
        });
      });

      conn.on('error', (err) => {
        this.sshConnection = null;
        this.connectionConfig = null;
        this.isConnected = false;
        reject(new McpError(
          ErrorCode.InternalError,
          `SSH connection failed: ${err.message}`
        ));
      });

      conn.on('end', () => {
        this.sshConnection = null;
        this.connectionConfig = null;
        this.isConnected = false;
      });

      const connectOptions: any = {
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
      };

      if (sshConfig.privateKey) {
        connectOptions.privateKey = sshConfig.privateKey;
        if (sshConfig.passphrase) {
          connectOptions.passphrase = sshConfig.passphrase;
        }
      } else if (sshConfig.password) {
        connectOptions.password = sshConfig.password;
      }

      conn.connect(connectOptions);
    });
  }

  private async disconnectFromSSH(): Promise<any> {
    if (this.sshConnection) {
      this.sshConnection.end();
      this.sshConnection = null;
      this.connectionConfig = null;
      this.isConnected = false;
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "disconnected",
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "no_connection",
            message: "No active SSH connection to disconnect",
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };
  }

  private async getSSHStatus(): Promise<any> {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            connected: this.isConnected,
            host: this.connectionConfig?.host || null,
            port: this.connectionConfig?.port || null,
            username: this.connectionConfig?.username || null,
            authMethod: this.connectionConfig ? 
              (this.connectionConfig.privateKey ? "key" : "password") : 
              null,
            timestamp: new Date().toISOString(),
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

    if (!this.sshConnection || !this.isConnected) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Not connected to SSH server. Use ssh_connect first.'
      );
    }

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let exitCode: number | null = null;

      const timeoutId = setTimeout(() => {
        reject(new McpError(
          ErrorCode.InternalError,
          `SSH command timed out after ${timeout}ms`
        ));
      }, timeout);

      let finalCommand = command;
      if (workingDirectory) {
        const validPathRegex = /^[a-zA-Z0-9\/\._-]+$/;
        if (!validPathRegex.test(workingDirectory)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Invalid working directory format'
          );
        }
        finalCommand = `cd "${workingDirectory}" && ${command}`;
      }

      this.sshConnection!.exec(finalCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(new McpError(
            ErrorCode.InternalError,
            `Failed to execute command: ${err.message}`
          ));
          return;
        }

        stream.on('close', (code: number) => {
          clearTimeout(timeoutId);
          exitCode = code;
          
          resolve({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  host: this.connectionConfig!.host,
                  port: this.connectionConfig!.port,
                  username: this.connectionConfig!.username,
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
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SSH MCP server started and ready to accept connections');
  }

  async shutdown() {
    if (this.sshConnection) {
      this.sshConnection.end();
      this.sshConnection = null;
      this.connectionConfig = null;
      this.isConnected = false;
    }
  }
}