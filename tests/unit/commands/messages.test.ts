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
      fail: jest.fn(),
      stop: jest.fn(),
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
  });
});