import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../extension/utils/Retry';

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow('nope');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry hook with attempt number and error', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('uses exponential backoff', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', (fn: () => void, ms: number) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    });
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(delays).toEqual([10, 20]);
    vi.unstubAllGlobals();
  });

  it('does NOT retry when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('non-retryable');
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, shouldRetry: () => false }),
    ).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries when shouldRetry returns true', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('retryable');
      return 'ok';
    });
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 0,
      shouldRetry: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes the thrown error to shouldRetry', async () => {
    const seen: Error[] = [];
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 0,
      shouldRetry: (err) => {
        seen.push(err);
        return true;
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.message).toBe('first');
  });
});