/**
 * Safely extracts content from different message types
 */
export function getMessageContent(message: any): string | null {
  const msgType = message.message_type || message.type;

  // Tool call messages: show "toolName(args)"
  if (msgType === 'tool_call_message') {
    const name = message.tool_call?.name || message.name || 'unknown_tool';
    let args = '';
    const rawArgs = message.tool_call?.arguments || message.arguments;
    if (rawArgs) {
      args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
      if (args.length > 300) args = args.slice(0, 300) + '...';
    }
    return `${name}(${args})`;
  }

  // Tool return messages: show return value (prefixed with [ERROR] if status is error)
  if (msgType === 'tool_return_message') {
    let value = message.tool_return || message.return_value || message.content || '';
    if (typeof value !== 'string') value = JSON.stringify(value);
    if (value.length > 500) value = value.slice(0, 500) + '...';
    const isError = message.status === 'error';
    return isError ? `[ERROR] ${value}` : value;
  }

  // Reasoning messages
  if (msgType === 'reasoning_message') {
    return message.reasoning || null;
  }

  // Try different properties that might contain the message content
  if (message.text) return message.text;
  if (message.content) {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      // Handle content arrays (multi-modal content)
      return message.content
        .map((item: any) => item.text || item.content || '[Non-text content]')
        .join(' ');
    }
    return JSON.stringify(message.content);
  }
  if (message.message && typeof message.message === 'string') return message.message;
  return null;
}

/**
 * Format elapsed time as human-readable string
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const weeks = Math.floor(seconds / 604800);
  const days = Math.floor((seconds % 604800) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // Under 1 hour: Xm Ys
  if (seconds < 3600) {
    return `${mins}m ${secs}s`;
  }

  // Under 1 day: Xh Ym
  if (seconds < 86400) {
    return `${hours}h ${mins}m`;
  }

  // Under 1 week: Xd Yh
  if (seconds < 604800) {
    return `${days}d ${hours}h`;
  }

  // 1 week or more: just show weeks
  return `${weeks}w`;
}
