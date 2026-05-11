export interface RetryOn409Options {
  attempts?: number;
  baseDelayMs?: number;
  jitter?: number;
  onRetry?: (attempt: number, err: any, delayMs: number) => void;
}

export class HttpStatusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

function getStatus(err: any): number | undefined {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.statusCode === 'number') return err.statusCode;
  if (typeof err?.response?.status === 'number') return err.response.status;
  const msg: string = err?.message || '';
  const match = msg.match(/\b(\d{3})\b/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 400 && n < 600) return n;
  }
  return undefined;
}

/**
 * Retry on HTTP 409 (Conflict) only — for cases where a wait-for-idle gate
 * raced with a new run starting concurrently and the destructive op got rejected.
 *
 * Default: 3 attempts total, 500ms → 2000ms backoff, ±20% jitter.
 * Non-409 errors propagate immediately. Final 409 also propagates.
 */
export async function retryOn409<T>(
  fn: () => Promise<T>,
  opts: RetryOn409Options = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const jitter = opts.jitter ?? 0.2;

  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (getStatus(err) !== 409 || i === attempts - 1) {
        throw err;
      }
      const exp = baseDelay * Math.pow(4, i);
      const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
      const delay = Math.round(exp * jitterFactor);
      opts.onRetry?.(i + 1, err, delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
