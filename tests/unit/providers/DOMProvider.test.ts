import { describe, expect, it } from 'vitest';
import { DOMProvider } from '../../../extension/providers/DOMProvider';

describe('DOMProvider', () => {
  const provider = new DOMProvider();

  it('canHandle only when domSnapshot present', () => {
    expect(provider.canHandle({})).toBe(false);
    expect(
      provider.canHandle({
        domSnapshot: { title: 't', difficulty: 'd', duration: 'u', description: '', url: 'x' },
      }),
    ).toBe(true);
  });

  it('parses duration in minutes and derives slug + format from URL', async () => {
    const meta = await provider.getMetadata({
      domSnapshot: {
        title: 'Event Emitter',
        difficulty: 'Medium',
        duration: '30 minutes',
        description: '<p>desc</p>',
        url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      },
    });

    expect(meta).toEqual({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 30,
      description: '<p>desc</p>',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: [],
      companies: [],
    });
  });

  it('handles hours in duration', async () => {
    const meta = await provider.getMetadata({
      domSnapshot: {
        title: 'x',
        difficulty: 'hard',
        duration: '2 hours',
        description: '',
        url: 'https://www.greatfrontend.com/questions/react/counter',
      },
    });

    expect(meta.duration).toBe(120);
    expect(meta.format).toBe('react');
  });

  it('throws when URL not a GFE question URL', async () => {
    await expect(
      provider.getMetadata({
        domSnapshot: { title: 't', difficulty: 'd', duration: '1m', description: '', url: 'x' },
      }),
    ).rejects.toThrow();
  });
});