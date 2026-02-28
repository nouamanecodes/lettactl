import {
  displayConversations,
  ConversationData,
  displayConversationDetails,
  ConversationDetailsData,
} from '../../../src/lib/ux/display';

// Force plain UX mode for testing
process.stdout.isTTY = false;

describe('conversation display', () => {
  describe('displayConversations', () => {
    it('should display a table of conversations', () => {
      const conversations: ConversationData[] = [
        {
          id: 'conv-abc12345-6789-0123-4567-890abcdef012',
          agentId: 'agent-123',
          summary: 'Hook conversation for testing',
          messageCount: 15,
          created: '2024-06-15T10:30:00Z',
        },
        {
          id: 'conv-def12345-6789-0123-4567-890abcdef012',
          agentId: 'agent-123',
          summary: 'B-roll conversation',
          messageCount: 3,
          created: '2024-06-16T14:00:00Z',
        },
      ];

      const result = displayConversations(conversations);

      expect(result).toContain('ID');
      expect(result).toContain('SUMMARY');
      expect(result).toContain('MESSAGES');
      expect(result).toContain('CREATED');
      expect(result).toContain('Hook conversation');
      expect(result).toContain('B-roll conversation');
    });

    it('should handle conversations with no summary', () => {
      const conversations: ConversationData[] = [
        {
          id: 'conv-123',
          agentId: 'agent-123',
          summary: '',
          messageCount: 0,
          created: '2024-01-01',
        },
      ];

      const result = displayConversations(conversations);

      expect(result).toContain('-');
    });

    it('should handle single conversation', () => {
      const conversations: ConversationData[] = [
        {
          id: 'conv-456',
          agentId: 'agent-789',
          summary: 'Only conversation',
          messageCount: 42,
        },
      ];

      const result = displayConversations(conversations);

      expect(result).toContain('Only conversation');
      expect(result).toContain('42');
    });
  });

  describe('displayConversationDetails', () => {
    it('should display conversation details in key-value format', () => {
      const data: ConversationDetailsData = {
        id: 'conv-abc12345',
        agentId: 'agent-123',
        agentName: 'my-agent',
        name: 'Test Conversation',
        summary: 'A test conversation for unit testing',
        messageCount: 25,
        status: 'active',
        created: '2024-06-15T10:30:00Z',
        updated: '2024-06-16T14:00:00Z',
      };

      const result = displayConversationDetails(data);

      expect(result).toContain('conv-abc12345');
      expect(result).toContain('my-agent');
      expect(result).toContain('agent-123');
      expect(result).toContain('Test Conversation');
      expect(result).toContain('25');
      expect(result).toContain('active');
    });

    it('should handle missing optional fields', () => {
      const data: ConversationDetailsData = {
        id: 'conv-minimal',
        agentId: 'agent-123',
      };

      const result = displayConversationDetails(data);

      expect(result).toContain('conv-minimal');
      expect(result).toContain('agent-123');
      expect(result).toContain('-'); // defaults for missing fields
    });

    it('should show agent name with ID when both available', () => {
      const data: ConversationDetailsData = {
        id: 'conv-1',
        agentId: 'agent-abc',
        agentName: 'production-agent',
        messageCount: 10,
      };

      const result = displayConversationDetails(data);

      expect(result).toContain('production-agent (agent-abc)');
    });

    it('should show only agent ID when name not available', () => {
      const data: ConversationDetailsData = {
        id: 'conv-1',
        agentId: 'agent-abc',
      };

      const result = displayConversationDetails(data);

      expect(result).toContain('agent-abc');
    });
  });
});
