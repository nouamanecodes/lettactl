import { getMessageContent } from '../../../src/commands/messages/utils';

describe('getMessageContent', () => {
  describe('tool_call_message', () => {
    it('should display tool name and arguments', () => {
      const msg = {
        message_type: 'tool_call_message',
        tool_call: { name: 'archival_memory_search', arguments: '{"query":"hello"}' },
      };
      expect(getMessageContent(msg)).toBe('archival_memory_search({"query":"hello"})');
    });

    it('should handle object arguments', () => {
      const msg = {
        message_type: 'tool_call_message',
        tool_call: { name: 'send_message', arguments: { message: 'hi' } },
      };
      expect(getMessageContent(msg)).toBe('send_message({"message":"hi"})');
    });

    it('should truncate arguments at 300 chars', () => {
      const longArgs = 'x'.repeat(400);
      const msg = {
        message_type: 'tool_call_message',
        tool_call: { name: 'my_tool', arguments: longArgs },
      };
      const result = getMessageContent(msg)!;
      expect(result).toMatch(/^my_tool\(/);
      expect(result).toMatch(/\.\.\.\)$/);
      // "my_tool(" = 8, truncated args = 300, "..." = 3, ")" = 1
      expect(result.length).toBe(8 + 300 + 3 + 1);
    });

    it('should show empty parens when no arguments', () => {
      const msg = {
        message_type: 'tool_call_message',
        tool_call: { name: 'heartbeat' },
      };
      expect(getMessageContent(msg)).toBe('heartbeat()');
    });

    it('should fall back to message.name when tool_call.name missing', () => {
      const msg = {
        message_type: 'tool_call_message',
        name: 'fallback_tool',
        arguments: '{}',
      };
      expect(getMessageContent(msg)).toBe('fallback_tool({})');
    });

    it('should show unknown_tool when no name available', () => {
      const msg = { message_type: 'tool_call_message' };
      expect(getMessageContent(msg)).toBe('unknown_tool()');
    });

    it('should work with type instead of message_type', () => {
      const msg = {
        type: 'tool_call_message',
        tool_call: { name: 'search', arguments: '{"q":"test"}' },
      };
      expect(getMessageContent(msg)).toBe('search({"q":"test"})');
    });
  });

  describe('tool_return_message', () => {
    it('should display return value', () => {
      const msg = {
        message_type: 'tool_return_message',
        tool_return: 'Search returned 3 results',
      };
      expect(getMessageContent(msg)).toBe('Search returned 3 results');
    });

    it('should prefix with [ERROR] when status is error', () => {
      const msg = {
        message_type: 'tool_return_message',
        tool_return: 'Connection refused',
        status: 'error',
      };
      expect(getMessageContent(msg)).toBe('[ERROR] Connection refused');
    });

    it('should not prefix when status is not error', () => {
      const msg = {
        message_type: 'tool_return_message',
        tool_return: 'OK',
        status: 'success',
      };
      expect(getMessageContent(msg)).toBe('OK');
    });

    it('should truncate return value at 500 chars', () => {
      const msg = {
        message_type: 'tool_return_message',
        tool_return: 'y'.repeat(600),
      };
      const result = getMessageContent(msg)!;
      expect(result).toHaveLength(500 + 3); // 500 + "..."
      expect(result).toMatch(/\.\.\.$/);
    });

    it('should handle object return values', () => {
      const msg = {
        message_type: 'tool_return_message',
        tool_return: { results: [1, 2, 3] },
      };
      expect(getMessageContent(msg)).toBe('{"results":[1,2,3]}');
    });

    it('should fall back to return_value then content', () => {
      expect(getMessageContent({
        message_type: 'tool_return_message',
        return_value: 'from return_value',
      })).toBe('from return_value');

      expect(getMessageContent({
        message_type: 'tool_return_message',
        content: 'from content',
      })).toBe('from content');
    });

    it('should return empty string when no value available', () => {
      const msg = { message_type: 'tool_return_message' };
      expect(getMessageContent(msg)).toBe('');
    });
  });

  describe('reasoning_message', () => {
    it('should return reasoning text', () => {
      const msg = {
        message_type: 'reasoning_message',
        reasoning: 'The user wants to search their memory for past conversations.',
      };
      expect(getMessageContent(msg)).toBe(
        'The user wants to search their memory for past conversations.'
      );
    });

    it('should return null when reasoning is empty', () => {
      const msg = { message_type: 'reasoning_message' };
      expect(getMessageContent(msg)).toBeNull();
    });
  });

  describe('existing message types (unchanged)', () => {
    it('should return text property', () => {
      expect(getMessageContent({ text: 'hello' })).toBe('hello');
    });

    it('should return string content', () => {
      expect(getMessageContent({ content: 'world' })).toBe('world');
    });

    it('should handle content arrays', () => {
      const msg = { content: [{ text: 'part1' }, { content: 'part2' }] };
      expect(getMessageContent(msg)).toBe('part1 part2');
    });

    it('should return null for empty messages', () => {
      expect(getMessageContent({})).toBeNull();
    });
  });
});
