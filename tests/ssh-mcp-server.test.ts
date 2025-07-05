import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the MCP SDK before importing
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { method: 'tools/call' },
  ErrorCode: {
    InvalidRequest: 'InvalidRequest',
    InternalError: 'InternalError',
    MethodNotFound: 'MethodNotFound',
  },
  ListToolsRequestSchema: { method: 'tools/list' },
  McpError: class McpError extends Error {
    constructor(code: string, message: string) {
      super(message);
      this.name = 'McpError';
    }
  },
}));

jest.mock('ssh2', () => ({
  Client: jest.fn(),
}));

// Now import the modules
import { SSHMCPServer } from '../src/ssh-mcp-server';
import { Client } from 'ssh2';

const MockedSshClient = Client as jest.MockedClass<typeof Client>;
const { Server: MockedMcpServer } = jest.requireMock('@modelcontextprotocol/sdk/server/index.js') as { Server: jest.MockedClass<any> };

describe('SSH MCP Server - Public API Tests', () => {
  let server: SSHMCPServer;
  let mockSshClientInstance: any;
  let mockMcpServerInstance: any;
  let listToolsHandler: Function;
  let callToolHandler: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock SSH client
    mockSshClientInstance = {
      on: jest.fn(),
      connect: jest.fn(),
      exec: jest.fn(),
      end: jest.fn(),
    };

    MockedSshClient.mockImplementation(() => mockSshClientInstance);

    // Mock MCP server
    mockMcpServerInstance = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
    };

    // Capture the request handlers when they're set
    mockMcpServerInstance.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
      if (schema.method === 'tools/list') {
        listToolsHandler = handler;
      } else if (schema.method === 'tools/call') {
        callToolHandler = handler;
      }
    });

    MockedMcpServer.mockImplementation(() => mockMcpServerInstance);

    server = new SSHMCPServer();
  });

  afterEach(async () => {
    await server.shutdown();
  });

  describe('Server Initialization', () => {
    test('should create server instance with correct configuration', () => {
      expect(MockedMcpServer).toHaveBeenCalledWith(
        {
          name: 'ssh-command-server',
          version: '0.1.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    test('should register tool handlers', () => {
      expect(mockMcpServerInstance.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tool Registration', () => {
    test('should list all available tools', async () => {
      const response = await listToolsHandler({
        method: 'tools/list',
        params: {},
      });

      expect(response.tools).toHaveLength(4);
      const toolNames = response.tools.map((tool: any) => tool.name);
      expect(toolNames).toEqual(['ssh_connect', 'ssh_disconnect', 'ssh_exec', 'ssh_status']);
    });

    test('should have correct schema for ssh_connect tool', async () => {
      const response = await listToolsHandler({
        method: 'tools/list',
        params: {},
      });

      const connectTool = response.tools.find((tool: any) => tool.name === 'ssh_connect');
      expect(connectTool).toBeDefined();
      expect(connectTool.inputSchema.required).toEqual(['host', 'username']);
      expect(connectTool.inputSchema.properties.host).toBeDefined();
      expect(connectTool.inputSchema.properties.username).toBeDefined();
      expect(connectTool.inputSchema.properties.password).toBeDefined();
      expect(connectTool.inputSchema.properties.privateKey).toBeDefined();
    });

    test('should have correct schema for ssh_exec tool', async () => {
      const response = await listToolsHandler({
        method: 'tools/list',
        params: {},
      });

      const execTool = response.tools.find((tool: any) => tool.name === 'ssh_exec');
      expect(execTool).toBeDefined();
      expect(execTool.inputSchema.required).toEqual(['command']);
      expect(execTool.inputSchema.properties.command).toBeDefined();
      expect(execTool.inputSchema.properties.timeout).toBeDefined();
      expect(execTool.inputSchema.properties.workingDirectory).toBeDefined();
    });
  });

  describe('SSH Connection via Tool API', () => {
    test('should validate required configuration fields', async () => {
      // Missing host
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: { username: 'test-user', password: 'test-password' },
        },
      })).rejects.toThrow('SSH configuration incomplete');

      // Missing username
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: { host: 'test-host', password: 'test-password' },
        },
      })).rejects.toThrow('SSH configuration incomplete');

      // Missing authentication
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: { host: 'test-host', username: 'test-user' },
        },
      })).rejects.toThrow('SSH authentication incomplete');
    });

    test('should connect with password authentication', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
            port: 22,
          },
        },
      });

      expect(MockedSshClient).toHaveBeenCalledTimes(1);
      expect(mockSshClientInstance.connect).toHaveBeenCalledWith({
        host: 'test-host',
        port: 22,
        username: 'test-user',
        password: 'test-password',
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.status).toBe('connected');
      expect(responseData.host).toBe('test-host');
      expect(responseData.username).toBe('test-user');
      expect(responseData.authMethod).toBe('password');
    });

    test('should connect with private key authentication', async () => {
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            privateKey: 'test-private-key',
            passphrase: 'test-passphrase',
          },
        },
      });

      expect(mockSshClientInstance.connect).toHaveBeenCalledWith({
        host: 'test-host',
        port: 22,
        username: 'test-user',
        privateKey: 'test-private-key',
        passphrase: 'test-passphrase',
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.authMethod).toBe('key');
    });

    test('should automatically disconnect when connecting to new server', async () => {
      // Mock successful connections
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // First connection
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'first-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Reset mock to track the second connection
      mockSshClientInstance.end.mockClear();

      // Second connection should trigger automatic disconnect
      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'second-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Verify that end() was called (automatic disconnect)
      expect(mockSshClientInstance.end).toHaveBeenCalled();
      
      // Verify new connection was established
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.status).toBe('connected');
      expect(responseData.host).toBe('second-host');
    });

    test('should handle connection errors', async () => {
      // Mock connection error
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Connection failed')));
        }
        return mockSshClientInstance;
      });

      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      })).rejects.toThrow('SSH connection failed: Connection failed');
    });
  });

  describe('SSH Status via Tool API', () => {
    test('should return disconnected status initially', async () => {
      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_status',
          arguments: {},
        },
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.connected).toBe(false);
      expect(responseData.host).toBe(null);
      expect(responseData.username).toBe(null);
    });

    test('should return connected status after successful connection', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Check status
      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_status',
          arguments: {},
        },
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.connected).toBe(true);
      expect(responseData.host).toBe('test-host');
      expect(responseData.username).toBe('test-user');
      expect(responseData.authMethod).toBe('password');
    });
  });

  describe('SSH Disconnect via Tool API', () => {
    test('should disconnect from active connection', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Disconnect
      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_disconnect',
          arguments: {},
        },
      });

      expect(mockSshClientInstance.end).toHaveBeenCalled();

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.status).toBe('disconnected');
    });

    test('should handle disconnect when no connection exists', async () => {
      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_disconnect',
          arguments: {},
        },
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.status).toBe('no_connection');
      expect(responseData.message).toBe('No active SSH connection to disconnect');
    });
  });

  describe('SSH Command Execution via Tool API', () => {
    test('should require connection for command execution', async () => {
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: { command: 'ls' },
        },
      })).rejects.toThrow('Not connected to SSH server');
    });

    test('should validate command parameter', async () => {
      // Mock successful connection first
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Test invalid command
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: { command: '' },
        },
      })).rejects.toThrow('Command is required and must be a string');
    });

    test('should execute command with working directory', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Mock successful command execution
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      mockSshClientInstance.exec.mockImplementation((command: string, callback: Function) => {
        process.nextTick(() => {
          callback(null, mockStream);
          
          // Simulate close event
          setTimeout(() => {
            const closeCallback = mockStream.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
            if (closeCallback && typeof closeCallback === 'function') {
              closeCallback(0);
            }
          }, 10);
        });
      });

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: {
            command: 'ls',
            workingDirectory: '/tmp',
          },
        },
      });

      expect(mockSshClientInstance.exec).toHaveBeenCalledWith('cd "/tmp" && ls', expect.any(Function));
      
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.command).toBe('cd "/tmp" && ls');
      expect(responseData.originalCommand).toBe('ls');
      expect(responseData.workingDirectory).toBe('/tmp');
    });

    test('should execute command successfully', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Mock successful command execution
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      mockSshClientInstance.exec.mockImplementation((command: string, callback: Function) => {
        process.nextTick(() => {
          callback(null, mockStream);
          
          // Simulate data and close events
          setTimeout(() => {
            const dataCallback = mockStream.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (dataCallback && typeof dataCallback === 'function') {
              dataCallback(Buffer.from('file1\nfile2\n'));
            }
            
            const closeCallback = mockStream.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
            if (closeCallback && typeof closeCallback === 'function') {
              closeCallback(0);
            }
          }, 10);
        });
      });

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: {
            command: 'ls -la',
            timeout: 5000,
          },
        },
      });

      expect(mockSshClientInstance.exec).toHaveBeenCalledWith('ls -la', expect.any(Function));
      
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.exitCode).toBe(0);
      expect(responseData.success).toBe(true);
      expect(responseData.stdout).toBe('file1\nfile2\n');
      expect(responseData.command).toBe('ls -la');
    });
  });

  describe('Error Handling via Tool API', () => {
    test('should handle unknown tool names', async () => {
      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      })).rejects.toThrow('Unknown tool: unknown_tool');
    });

    test('should handle SSH command execution errors', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Mock command execution error
      mockSshClientInstance.exec.mockImplementation((command: string, callback: Function) => {
        process.nextTick(() => {
          callback(new Error('Command execution failed'), null);
        });
      });

      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: { command: 'invalid-command' },
        },
      })).rejects.toThrow('Failed to execute command: Command execution failed');
    });

    test('should handle generic error in tool execution', async () => {
      // Force a non-McpError to be thrown
      const originalConnect = mockSshClientInstance.connect;
      mockSshClientInstance.connect = undefined; // This will cause a runtime error

      await expect(callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      })).rejects.toThrow('Tool execution failed:');

      // Restore for cleanup
      mockSshClientInstance.connect = originalConnect;
    });
  });

  describe('SSH Connection End Event', () => {
    test('should clean up connection state on end event', async () => {
      let endCallback: Function | undefined;

      // Mock successful connection with end event capture
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        } else if (event === 'end') {
          endCallback = callback;
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Verify connection is established
      const statusAfterConnect = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_status',
          arguments: {},
        },
      });
      expect(JSON.parse(statusAfterConnect.content[0].text).connected).toBe(true);

      // Simulate connection end
      if (endCallback) {
        endCallback();
      }

      // Verify connection state is cleaned up
      const statusAfterEnd = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_status',
          arguments: {},
        },
      });
      expect(JSON.parse(statusAfterEnd.content[0].text).connected).toBe(false);
    });
  });

  describe('SSH Command with stderr Output', () => {
    test('should capture stderr output from commands', async () => {
      // Mock successful connection
      mockSshClientInstance.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          process.nextTick(() => callback());
        }
        return mockSshClientInstance;
      });

      // Connect first
      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_connect',
          arguments: {
            host: 'test-host',
            username: 'test-user',
            password: 'test-password',
          },
        },
      });

      // Mock command execution with stderr
      const mockStream = {
        on: jest.fn(),
        stderr: { on: jest.fn() },
      };

      mockSshClientInstance.exec.mockImplementation((command: string, callback: Function) => {
        process.nextTick(() => {
          callback(null, mockStream);
          
          // Simulate stderr and close events
          setTimeout(() => {
            const stderrCallback = mockStream.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stderrCallback && typeof stderrCallback === 'function') {
              stderrCallback(Buffer.from('error message\n'));
            }
            
            const closeCallback = mockStream.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
            if (closeCallback && typeof closeCallback === 'function') {
              closeCallback(1); // Non-zero exit code
            }
          }, 10);
        });
      });

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'ssh_exec',
          arguments: {
            command: 'failing-command',
          },
        },
      });

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.stderr).toBe('error message\n');
      expect(responseData.exitCode).toBe(1);
      expect(responseData.success).toBe(false);
    });
  });
});