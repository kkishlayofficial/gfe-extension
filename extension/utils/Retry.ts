export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, baseDelayMs, shouldRetry, onRetry } = options;
  let lastError: Error = new Error('withRetry called with maxAttempts <= 0');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLast = attempt >= maxAttempts;
      const retryable = shouldRetry ? shouldRetry(lastError) : true;
      if (isLast || !retryable) break;
      onRetry?.(attempt, lastError);
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
