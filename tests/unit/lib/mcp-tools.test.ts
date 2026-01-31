import { expandMcpToolsForAgents } from '../../../src/lib/mcp-tools';
import { warn } from '../../../src/lib/logger';

jest.mock('../../../src/lib/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
}));

describe('expandMcpToolsForAgents', () => {
  beforeEach(() => {
    (warn as jest.Mock).mockClear();
  });

  it('expands tools: all and preserves existing tools', async () => {
    const config = {
      agents: [
        {
          name: 'AgentA',
          tools: ['base_tool'],
          mcp_tools: [
            { server: 'mcp_server', tools: 'all' }
          ]
        }
      ]
    };

    const client = {
      listMcpServerTools: jest.fn().mockResolvedValue([
        { name: 'mcp_tool_a' },
        { name: 'mcp_tool_b' }
      ])
    } as any;

    const registry = new Map<string, string>([['mcp_server', 'server-id']]);

    await expandMcpToolsForAgents(config, client, registry);

    expect(config.agents[0].tools.sort()).toEqual(['base_tool', 'mcp_tool_a', 'mcp_tool_b'].sort());
    expect(warn).not.toHaveBeenCalled();
  });

  it('expands only selected MCP tools and de-dupes', async () => {
    const config = {
      agents: [
        {
          name: 'AgentB',
          tools: ['mcp_tool_a'],
          mcp_tools: [
            { server: 'mcp_server', tools: ['mcp_tool_a', 'missing_tool'] }
          ]
        }
      ]
    };

    const client = {
      listMcpServerTools: jest.fn().mockResolvedValue([
        { name: 'mcp_tool_a' },
        { name: 'mcp_tool_b' }
      ])
    } as any;

    const registry = new Map<string, string>([['mcp_server', 'server-id']]);

    await expandMcpToolsForAgents(config, client, registry);

    expect(config.agents[0].tools).toEqual(['mcp_tool_a']);
    expect(warn).toHaveBeenCalledWith('MCP server mcp_server missing tools: missing_tool');
  });

  it('skips expansion when server is missing', async () => {
    const config = {
      agents: [
        {
          name: 'AgentC',
          tools: ['base_tool'],
          mcp_tools: [
            { server: 'missing_server', tools: 'all' }
          ]
        }
      ]
    };

    const client = {
      listMcpServerTools: jest.fn()
    } as any;

    const registry = new Map<string, string>();

    await expandMcpToolsForAgents(config, client, registry);

    expect(config.agents[0].tools).toEqual(['base_tool']);
    expect(client.listMcpServerTools).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('MCP server not found: missing_server (skipping tool expansion)');
  });
});
