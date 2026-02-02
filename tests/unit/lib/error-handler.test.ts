import { withErrorHandling, createNotFoundError, formatLettaError } from '../../../src/lib/shared/error-handler';

// Mock console.error and process.exit for testing
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('error-handler', () => {
  beforeEach(() => {
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('withErrorHandling', () => {
    it('should return result when function succeeds', async () => {
      const successFn = jest.fn().mockResolvedValue('success result');
      const wrappedFn = withErrorHandling('test-command', successFn);

      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('success result');
      expect(successFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should handle errors with message', async () => {
      const errorFn = jest.fn().mockRejectedValue(new Error('Test error message'));
      const wrappedFn = withErrorHandling('test-command', errorFn);

      await expect(wrappedFn()).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'test-command failed:',
        'Test error message'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('createNotFoundError', () => {
    it('should create error with correct message', () => {
      const error = createNotFoundError('Agent', 'test-agent');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Agent "test-agent" not found');
    });
  });

  describe('formatLettaError', () => {
    it('should format memory block character limit error', () => {
      const rawError = `422 {"detail":"[{'type': 'value_error', 'msg': 'Value error, Edit failed: Exceeds 4000 character limit (requested 6538)'}]"}`;
      const result = formatLettaError(rawError);

      expect(result).toContain('Memory block exceeds character limit');
      expect(result).toContain('Limit: 4,000 characters');
      expect(result).toContain('Actual: 6,538 characters');
      expect(result).toContain('Hint:');
    });

    it('should include block name when provided in context', () => {
      const rawError = 'Exceeds 4000 character limit (requested 6538)';
      const result = formatLettaError(rawError, { blockName: 'creative_guidelines' });

      expect(result).toContain("Memory block 'creative_guidelines' exceeds character limit");
    });

    it('should format provider not supported error', () => {
      const rawError = 'Provider anthropic is not supported';
      const result = formatLettaError(rawError);

      expect(result).toContain("Provider 'anthropic' is not configured");
      expect(result).toContain('ANTHROPIC_API_KEY');
    });

    it('should return original message for unknown errors', () => {
      const rawError = 'Some unknown error';
      const result = formatLettaError(rawError);

      expect(result).toBe('Some unknown error');
    });
  });
});