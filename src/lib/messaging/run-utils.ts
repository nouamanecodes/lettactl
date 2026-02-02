import { Run } from '../../types/run';

/**
 * Terminal statuses that indicate a run has finished
 */
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const;

/**
 * Stop reasons that indicate a run has finished (even if status isn't updated)
 * This handles Letta server edge cases where status stays 'running' but stop_reason is set
 *
 * Note: 'requires_approval' is NOT terminal - run is paused waiting for human approval
 */
export const TERMINAL_STOP_REASONS = [
  'end_turn',
  'error',
  'llm_api_error',
  'invalid_llm_response',
  'invalid_tool_call',
  'max_steps',
  'max_tokens_exceeded',
  'no_tool_call',
  'tool_rule',
  'cancelled',
  'context_window_overflow_in_system_prompt'
] as const;

/**
 * Check if a run has reached a terminal state
 * Uses both status and stop_reason for robust detection
 */
export function isRunTerminal(run: Run): boolean {
  if (TERMINAL_STATUSES.includes(run.status as any)) {
    return true;
  }

  if (run.stop_reason && TERMINAL_STOP_REASONS.includes(run.stop_reason as any)) {
    return true;
  }

  return false;
}

/**
 * Determine the effective status of a run
 * Returns 'completed' if stop_reason indicates success even if status doesn't
 */
export function getEffectiveRunStatus(run: Run): 'completed' | 'failed' | 'cancelled' | 'running' {
  if (run.status === 'completed') return 'completed';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'cancelled') return 'cancelled';

  if (run.stop_reason) {
    if (run.stop_reason === 'end_turn') return 'completed';
    if (run.stop_reason === 'cancelled') return 'cancelled';
    if (TERMINAL_STOP_REASONS.includes(run.stop_reason as any)) {
      return 'failed';
    }
  }

  return 'running';
}
