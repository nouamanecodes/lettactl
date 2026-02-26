import { listMessagesCommand, sendMessageCommand } from '../../../src/commands/messages';
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

// Mock console.log
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('messages commands', () => {
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
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe('listMessagesCommand', () => {
    it('should list messages for an agent', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockMessages = [
        { id: 'msg-1', text: 'Hello', created_at: '2023-01-01T00:00:00Z' },
        { id: 'msg-2', content: 'How are you?', created_at: '2023-01-01T00:01:00Z' }
      ];

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.listMessages.mockResolvedValue(mockMessages as any);

      await listMessagesCommand('test-agent', { limit: 10 }, mockCommand);

      expect(mockResolver.findAgentByName).toHaveBeenCalledWith('test-agent');
      expect(mockClient.listMessages).toHaveBeenCalledWith('agent-123', { limit: 10 });
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle verbose output', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const verboseCommand = {
        parent: {
          opts: () => ({ verbose: true })
        }
      };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.listMessages.mockResolvedValue([] as any);

      await listMessagesCommand('test-agent', {}, verboseCommand);

      expect(mockConsoleLog).toHaveBeenCalledWith('Listing messages for agent: test-agent (agent-123)');
    });

    it('should handle JSON output format', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockMessages = [{ id: 'msg-1', text: 'Hello' }];

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.listMessages.mockResolvedValue(mockMessages as any);

      await listMessagesCommand('test-agent', { output: 'json' }, mockCommand);

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockMessages, null, 2));
    });
  });

  describe('sendMessageCommand', () => {
    it('should send a message to an agent with --sync flag', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockResponse = {
        messages: [{ message_type: 'assistant_message', text: 'Response from agent' }]
      };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.createMessage.mockResolvedValue(mockResponse as any);

      await sendMessageCommand('test-agent', 'Hello agent', { sync: true }, mockCommand);

      expect(mockResolver.findAgentByName).toHaveBeenCalledWith('test-agent');
      expect(mockClient.createMessage).toHaveBeenCalledWith('agent-123', {
        messages: [{ role: 'user', content: 'Hello agent' }]
      });
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should send async message and return run ID with --no-wait', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockRunResponse = { id: 'run-456', status: 'pending' };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.createAsyncMessage.mockResolvedValue(mockRunResponse as any);

      await sendMessageCommand('test-agent', 'Hello agent', { noWait: true }, mockCommand);

      expect(mockClient.createAsyncMessage).toHaveBeenCalledWith('agent-123', {
        messages: [{ role: 'user', content: 'Hello agent' }]
      });
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle streaming option', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Hello' } }] };
          yield { choices: [{ delta: { content: ' there' } }] };
        }
      };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.streamMessage.mockResolvedValue(mockStream as any);

      await sendMessageCommand('test-agent', 'Hello', { stream: true }, mockCommand);

      expect(mockClient.streamMessage).toHaveBeenCalledWith('agent-123', {
        messages: [{ role: 'user', content: 'Hello' }],
        streaming: true
      });
    });

    it('should recover response from a false-failed run', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockRunResponse = { id: 'run-789', status: 'pending' };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.createAsyncMessage.mockResolvedValue(mockRunResponse as any);

      // First poll returns failed run
      mockClient.getRun.mockResolvedValue({
        id: 'run-789',
        status: 'failed',
        stop_reason: 'context_window_overflow_in_system_prompt',
      } as any);

      // getRunMessages returns messages including an assistant_message
      mockClient.getRunMessages.mockResolvedValue([
        { message_type: 'reasoning_message', reasoning: 'thinking...' },
        { message_type: 'assistant_message', content: 'Here is the recovered response' },
      ] as any);

      await sendMessageCommand('test-agent', 'Hello agent', {}, mockCommand);

      // Should have called getRunMessages to attempt recovery
      expect(mockClient.getRunMessages).toHaveBeenCalledWith('run-789');

      // Should output the recovered response (not exit with failure)
      const allOutputs = mockConsoleLog.mock.calls.map(c => c[0]);
      const hasRecoveredContent = allOutputs.some(
        (msg: string) => typeof msg === 'string' && msg.includes('Here is the recovered response')
      );
      expect(hasRecoveredContent).toBe(true);
    });

    it('should exit on failed run with no assistant response to recover', async () => {
      const mockAgent = { id: 'agent-123', name: 'test-agent' };
      const mockRunResponse = { id: 'run-999', status: 'pending' };

      mockResolver.findAgentByName.mockResolvedValue({ agent: mockAgent, allAgents: [] });
      mockClient.createAsyncMessage.mockResolvedValue(mockRunResponse as any);

      mockClient.getRun.mockResolvedValue({
        id: 'run-999',
        status: 'failed',
        stop_reason: 'error',
      } as any);

      // getRunMessages returns only non-assistant messages
      mockClient.getRunMessages.mockResolvedValue([
        { message_type: 'reasoning_message', reasoning: 'thinking...' },
        { message_type: 'tool_call_message', tool_call: { name: 'search', arguments: '{}' } },
      ] as any);

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      try {
        await sendMessageCommand('test-agent', 'Hello agent', {}, mockCommand);
        // Should not reach here
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toBe('process.exit called');
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });
});