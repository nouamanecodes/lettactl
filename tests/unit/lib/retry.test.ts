import { retryOn409 } from '../../../src/lib/shared/retry';

function err(status: number, message = `HTTP ${status}`): Error {
  const e: any = new Error(message);
  e.status = status;
  return e;
}

describe('retryOn409', () => {
  it('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryOn409(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 409 then succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(err(409))
      .mockResolvedValueOnce('ok');
    const result = await retryOn409(fn, { baseDelayMs: 1, jitter: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts attempts and throws last 409', async () => {
    const fn = jest.fn().mockRejectedValue(err(409, 'conflict'));
    await expect(retryOn409(fn, { baseDelayMs: 1, jitter: 0 }))
      .rejects.toThrow('conflict');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-409', async () => {
    const fn = jest.fn().mockRejectedValue(err(500, 'server error'));
    await expect(retryOn409(fn, { baseDelayMs: 1 })).rejects.toThrow('server error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('detects 409 from response.status shape', async () => {
    const e: any = new Error('conflict');
    e.response = { status: 409 };
    const fn = jest.fn().mockRejectedValueOnce(e).mockResolvedValueOnce('ok');
    const result = await retryOn409(fn, { baseDelayMs: 1, jitter: 0 });
    expect(result).toBe('ok');
  });

  it('detects 409 from error message (fallback)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Failed to recompile conversation: 409 Conflict'))
      .mockResolvedValueOnce('ok');
    const result = await retryOn409(fn, { baseDelayMs: 1, jitter: 0 });
    expect(result).toBe('ok');
  });

  it('invokes onRetry between attempts', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(err(409))
      .mockRejectedValueOnce(err(409))
      .mockResolvedValueOnce('ok');
    const onRetry = jest.fn();
    await retryOn409(fn, { baseDelayMs: 1, jitter: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1);
    expect(onRetry.mock.calls[1][0]).toBe(2);
  });
});
