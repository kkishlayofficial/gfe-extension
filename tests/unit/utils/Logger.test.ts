import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Logger', () => {
  const originalProd = import.meta.env.PROD;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (import.meta.env as { PROD: boolean }).PROD = originalProd;
  });

  it('logs debug in dev', async () => {
    (import.meta.env as { PROD: boolean }).PROD = false;
    const { logger } = await import('../../../extension/utils/Logger');
    logger.debug('test-event', { k: 'v' });
    expect(console.log).toHaveBeenCalledWith('[GFE Sync] debug: test-event', { k: 'v' });
  });

  it('does NOT log debug in prod', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.debug('test-event');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('does NOT log info in prod', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.info('test-event');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('always logs warn', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.warn('warn-event', { k: 1 });
    expect(console.warn).toHaveBeenCalledWith('[GFE Sync] warn: warn-event', { k: 1 });
  });

  it('always logs error', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.error('boom');
    expect(console.error).toHaveBeenCalledWith('[GFE Sync] error: boom', undefined);
  });
});