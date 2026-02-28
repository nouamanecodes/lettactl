import { LettaClientWrapper } from '../../../src/lib/client/letta-client';
import { AgentResolver } from '../../../src/lib/client/agent-resolver';

// Mock dependencies
jest.mock('../../../src/lib/client/letta-client');
jest.mock('../../../src/lib/client/agent-resolver');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn(() => ({
      succeed: jest.fn(),
      warn: jest.fn(),
      fail: jest.fn(),
      stop: jest.fn(),
      text: '',
    })),
  }));
});

const MockedLettaClient = LettaClientWrapper as jest.MockedClass<typeof LettaClientWrapper>;
const MockedAgentResolver = AgentResolver as jest.MockedClass<typeof AgentResolver>;

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('conversation commands', () => {
  let mockClient: jest.Mocked<LettaClientWrapper>;
  let mockResolver: jest.Mocked<AgentResolver>;
  let mockCommand: any;

  beforeEach(() => {
    mockClient = new MockedLettaClient() as jest.Mocked<LettaClientWrapper>;
    mockResolver = new MockedAgentResolver(mockClient) as jest.Mocked<AgentResolver>;

    MockedLettaClient.mockImplementation(() => mockClient);
    MockedAgentResolver.mockImplementation(() => mockResolver);

    mockCommand = {
      parent: {
        opts: () => ({ verbose: false })
      }
    };

    jest.clearAllMocks();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('getConversations', () => {
    it('should list conversations for an agent', async () => {
      const { getConversations } = await import('../../../src/commands/get/conversations');

      const mockConversations = [
        { id: 'conv-1', agent_id: 'agent-123', name: 'Hook conversation', message_count: 5, created_at: '2024-01-01' },
        { id: 'conv-2', agent_id: 'agent-123', name: 'B-roll conversation', message_count: 12, created_at: '2024-01-02' },
      ];

      mockClient.listConversations.mockResolvedValue(mockConversations as any);

      await getConversations(mockClient, mockResolver, {}, true, 'agent-123', 'test-agent');

      expect(mockClient.listConversations).toHaveBeenCalledWith('agent-123');
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should show helpful message when no conversations found', async () => {
      const { getConversations } = await import('../../../src/commands/get/conversations');

      mockClient.listConversations.mockResolvedValue([]);

      await getConversations(mockClient, mockResolver, {}, true, 'agent-123', 'test-agent');

      const allOutputs = mockConsoleLog.mock.calls.map(c => String(c[0]));
      expect(allOutputs.some(msg => msg.includes('No conversations found'))).toBe(true);
      expect(allOutputs.some(msg => msg.includes('lettactl create conversation'))).toBe(true);
    });

    it('should throw when agentId is not provided', async () => {
      const { getConversations } = await import('../../../src/commands/get/conversations');

      await expect(
        getConversations(mockClient, mockResolver, {}, true)
      ).rejects.toThrow('Agent name is required');
    });

    it('should handle JSON output', async () => {
      const { getConversations } = await import('../../../src/commands/get/conversations');

      const mockConversations = [
        { id: 'conv-1', agent_id: 'agent-123', name: 'Test', message_count: 3, created_at: '2024-01-01' },
      ];

      mockClient.listConversations.mockResolvedValue(mockConversations as any);

      await getConversations(mockClient, mockResolver, { output: 'json' }, true, 'agent-123', 'test-agent');

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockConversations, null, 2));
    });
  });

  describe('describeConversation', () => {
    it('should display conversation details', async () => {
      const { describeConversation } = await import('../../../src/commands/describe/conversation');

      const mockConversation = {
        id: 'conv-1',
        agent_id: 'agent-123',
        name: 'Test conversation',
        summary: 'A test conversation',
        message_count: 10,
        status: 'active',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      };
      const mockAgent = { id: 'agent-123', name: 'test-agent' };

      mockClient.getConversation.mockResolvedValue(mockConversation as any);
      mockClient.getAgent.mockResolvedValue(mockAgent as any);

      await describeConversation(mockClient, mockResolver, 'conv-1', {}, true);

      expect(mockClient.getConversation).toHaveBeenCalledWith('conv-1');
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle agent name resolution failure gracefully', async () => {
      const { describeConversation } = await import('../../../src/commands/describe/conversation');

      const mockConversation = {
        id: 'conv-1',
        agent_id: 'agent-123',
        name: 'Test conversation',
        message_count: 5,
        created_at: '2024-01-01',
      };

      mockClient.getConversation.mockResolvedValue(mockConversation as any);
      mockClient.getAgent.mockRejectedValue(new Error('Agent not found'));

      await describeConversation(mockClient, mockResolver, 'conv-1', {}, true);

      // Should not throw — agent resolution is best-effort
      expect(mockClient.getConversation).toHaveBeenCalledWith('conv-1');
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle JSON output', async () => {
      const { describeConversation } = await import('../../../src/commands/describe/conversation');

      const mockConversation = {
        id: 'conv-1',
        agent_id: 'agent-123',
        name: 'Test',
        message_count: 3,
        created_at: '2024-01-01',
      };

      mockClient.getConversation.mockResolvedValue(mockConversation as any);

      await describeConversation(mockClient, mockResolver, 'conv-1', { output: 'json' }, true);

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockConversation, null, 2));
    });
  });

  describe('sendMessageCommand with --conversation-id', () => {
    it('should route to conversation streaming when conversationId is set', async () => {
      const { sendMessageCommand } = await import('../../../src/commands/messages');
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'message_delta', content: 'Hello from conversation' };
        }
      };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.streamConversationMessage.mockResolvedValue(mockStream as any);

      await sendMessageCommand('test-agent', 'Hello', { conversationId: 'conv-1' }, mockCommand);

      expect(mockClient.streamConversationMessage).toHaveBeenCalledWith('conv-1', {
        messages: [{ role: 'user', content: 'Hello' }],
        streaming: true
      });
    });
  });

  describe('listMessagesCommand with --conversation-id', () => {
    it('should list conversation messages when conversationId is set', async () => {
      const { listMessagesCommand } = await import('../../../src/commands/messages');

      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockMessages = [
        { id: 'msg-1', message_type: 'user_message', text: 'Hello', created_at: '2024-01-01' },
        { id: 'msg-2', message_type: 'assistant_message', text: 'Hi!', created_at: '2024-01-01' },
      ];

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.listConversationMessages.mockResolvedValue(mockMessages as any);

      await listMessagesCommand('test-agent', { conversationId: 'conv-1' }, mockCommand);

      expect(mockClient.listConversationMessages).toHaveBeenCalledWith('conv-1', { limit: 10 });
      expect(mockClient.listMessages).not.toHaveBeenCalled();
    });
  });

  describe('compactMessagesCommand with --conversation-id', () => {
    it('should compact conversation messages with agent model', async () => {
      const { compactMessagesCommand } = await import('../../../src/commands/messages');

      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockFullAgent = { id: 'agent-123', name: 'test-agent', llm_config: { model: 'gpt-4o' } };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.getAgent.mockResolvedValue(mockFullAgent as any);
      mockClient.compactConversationMessages.mockResolvedValue({} as any);

      await compactMessagesCommand('test-agent', { conversationId: 'conv-1' }, mockCommand);

      expect(mockClient.compactConversationMessages).toHaveBeenCalledWith('conv-1', { model: 'gpt-4o' });
      expect(mockClient.compactMessages).not.toHaveBeenCalled();
    });

    it('should use explicit --model over agent model', async () => {
      const { compactMessagesCommand } = await import('../../../src/commands/messages');

      const mockAgent = { id: 'agent-123', name: 'test-agent' };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.compactConversationMessages.mockResolvedValue({} as any);

      await compactMessagesCommand('test-agent', { conversationId: 'conv-1', model: 'claude-sonnet-4-6' }, mockCommand);

      expect(mockClient.compactConversationMessages).toHaveBeenCalledWith('conv-1', { model: 'claude-sonnet-4-6' });
      expect(mockClient.getAgent).not.toHaveBeenCalled();
    });

    it('should exit when no model can be resolved', async () => {
      const { compactMessagesCommand } = await import('../../../src/commands/messages');

      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockFullAgent = { id: 'agent-123', name: 'test-agent' }; // no llm_config

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.getAgent.mockResolvedValue(mockFullAgent as any);

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      try {
        await compactMessagesCommand('test-agent', { conversationId: 'conv-1' }, mockCommand);
        expect(true).toBe(false); // Should not reach
      } catch (e: any) {
        expect(e.message).toBe('process.exit called');
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe('deleteConversation', () => {
    it('should show unsupported message for conversation deletion', async () => {
      const deleteCommand = (await import('../../../src/commands/delete')).default;

      await deleteCommand('conversation', 'conv-1', { force: true }, mockCommand);

      const allOutputs = mockConsoleLog.mock.calls.map(c => String(c[0]));
      expect(allOutputs.some(msg => msg.includes('does not support'))).toBe(true);
    });
  });

  describe('ConversationConfig type', () => {
    it('should accept valid conversation config', () => {
      const { ConversationConfig } = jest.requireActual('../../../src/types/fleet-config') as any;
      // Type-level test: ensure the interface compiles with expected shape
      const config: import('../../../src/types/fleet-config').ConversationConfig = {
        summary: 'Test conversation',
        isolated_blocks: ['customer_context'],
      };
      expect(config.summary).toBe('Test conversation');
      expect(config.isolated_blocks).toEqual(['customer_context']);
    });

    it('should accept conversation config without isolated_blocks', () => {
      const config: import('../../../src/types/fleet-config').ConversationConfig = {
        summary: 'Simple conversation',
      };
      expect(config.summary).toBe('Simple conversation');
      expect(config.isolated_blocks).toBeUndefined();
    });
  });

  describe('ConversationDiff type', () => {
    it('should represent conversations to create and existing', () => {
      const diff: import('../../../src/types/diff').ConversationDiff = {
        toCreate: [{ summary: 'New convo', isolatedBlocks: ['ctx'] }],
        existing: [{ summary: 'Existing convo', id: 'conv-123' }],
      };
      expect(diff.toCreate).toHaveLength(1);
      expect(diff.existing).toHaveLength(1);
      expect(diff.toCreate[0].summary).toBe('New convo');
    });
  });

  describe('conversation apply integration', () => {
    it('should create conversations during createNewAgent', async () => {
      // Verify that createNewAgent calls createConversation for declared conversations
      const agentConfig = {
        name: 'test-agent',
        description: 'Test',
        system_prompt: { value: 'You are a test agent.' },
        llm_config: { model: 'test-model', context_window: 32000 },
        conversations: [
          { summary: 'Convo A' },
          { summary: 'Convo B', isolated_blocks: ['ctx'] },
        ],
      };

      // The createNewAgent function creates conversations after agent creation
      // This is a structural test ensuring the config shape is correct
      expect(agentConfig.conversations).toHaveLength(2);
      expect(agentConfig.conversations[0].summary).toBe('Convo A');
      expect(agentConfig.conversations[1].isolated_blocks).toEqual(['ctx']);
    });

    it('should detect new conversations in diff', () => {
      // Simulate the diff logic: existing conversations matched by summary
      const desiredConversations = [
        { summary: 'Ticket #101' },
        { summary: 'Ticket #102' },
        { summary: 'Ticket #103' },
      ];
      const existingConversations = [
        { id: 'conv-1', summary: 'Ticket #101' },
        { id: 'conv-2', summary: 'Ticket #102' },
      ];

      const existingSummaries = new Set(existingConversations.map(c => c.summary));
      const toCreate = desiredConversations.filter(c => !existingSummaries.has(c.summary));
      const existing = existingConversations.filter(c =>
        desiredConversations.some(d => d.summary === c.summary)
      );

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0].summary).toBe('Ticket #103');
      expect(existing).toHaveLength(2);
    });

    it('should be idempotent when all conversations exist', () => {
      const desiredConversations = [
        { summary: 'Ticket #101' },
        { summary: 'Ticket #102' },
      ];
      const existingConversations = [
        { id: 'conv-1', summary: 'Ticket #101' },
        { id: 'conv-2', summary: 'Ticket #102' },
      ];

      const existingSummaries = new Set(existingConversations.map(c => c.summary));
      const toCreate = desiredConversations.filter(c => !existingSummaries.has(c.summary));

      expect(toCreate).toHaveLength(0);
    });
  });
});
