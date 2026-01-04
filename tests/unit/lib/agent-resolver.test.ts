import { AgentResolver } from '../../../src/lib/agent-resolver';
import { LettaClientWrapper } from '../../../src/lib/letta-client';

// Mock LettaClientWrapper
jest.mock('../../../src/lib/letta-client');
const MockedLettaClient = LettaClientWrapper as jest.MockedClass<typeof LettaClientWrapper>;

describe('AgentResolver', () => {
  let agentResolver: AgentResolver;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new MockedLettaClient() as jest.Mocked<LettaClientWrapper>;
    agentResolver = new AgentResolver(mockClient);
    jest.clearAllMocks();
  });

  describe('findAgentByName', () => {
    it('should find agent by name', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'test-agent', system: 'You are a test agent' },
        { id: 'agent-2', name: 'other-agent', system: 'You are another agent' }
      ];

      mockClient.listAgents.mockResolvedValue(mockAgents as any);

      const result = await agentResolver.findAgentByName('test-agent');

      expect(result.agent).toEqual(mockAgents[0]);
      expect(result.allAgents).toEqual(mockAgents);
      expect(mockClient.listAgents).toHaveBeenCalledTimes(1);
    });

    it('should throw error when agent not found', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'other-agent', system: 'You are another agent' }
      ];

      mockClient.listAgents.mockResolvedValue(mockAgents as any);

      await expect(agentResolver.findAgentByName('nonexistent-agent'))
        .rejects.toThrow('Agent "nonexistent-agent" not found');
    });

    it('should handle empty agent list', async () => {
      mockClient.listAgents.mockResolvedValue([] as any);

      await expect(agentResolver.findAgentByName('any-agent'))
        .rejects.toThrow('Agent "any-agent" not found');
    });
  });

  describe('getAllAgents', () => {
    it('should return all agents', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'test-agent-1' },
        { id: 'agent-2', name: 'test-agent-2' }
      ];

      mockClient.listAgents.mockResolvedValue(mockAgents as any);

      const result = await agentResolver.getAllAgents();

      expect(result).toEqual(mockAgents);
      expect(mockClient.listAgents).toHaveBeenCalledTimes(1);
    });

    it('should handle normalized response format', async () => {
      const mockResponse = { items: [
        { id: 'agent-1', name: 'test-agent' }
      ]};

      mockClient.listAgents.mockResolvedValue(mockResponse as any);

      const result = await agentResolver.getAllAgents();

      expect(result).toEqual([{ id: 'agent-1', name: 'test-agent' }]);
    });
  });

  describe('getAgentWithDetails', () => {
    it('should get agent details by ID', async () => {
      const mockAgent = {
        id: 'agent-123',
        name: 'test-agent',
        system: 'You are a test agent',
        memory: { blocks: [] },
        tools: ['archival_memory_insert']
      };

      mockClient.getAgent.mockResolvedValue(mockAgent as any);

      const result = await agentResolver.getAgentWithDetails('agent-123');

      expect(result).toEqual(mockAgent);
      expect(mockClient.getAgent).toHaveBeenCalledWith('agent-123');
    });
  });
});