/**
 * Process items in parallel batches with a concurrency limit.
 * Returns { succeeded, failed } counts and per-item results.
 */
export async function batchProcess<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency: number = 5
): Promise<{ succeeded: number; failed: number; errors: Array<{ item: T; error: string }> }> {
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ item: T; error: string }> = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(fn));
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        succeeded++;
      } else {
        failed++;
        errors.push({
          item: chunk[j],
          error: (results[j] as PromiseRejectedResult).reason?.message || 'unknown',
        });
      }
    }
  }

  return { succeeded, failed, errors };
}
