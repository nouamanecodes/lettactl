import { withErrorHandling, createNotFoundError } from '../../../src/lib/error-handler';

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
});