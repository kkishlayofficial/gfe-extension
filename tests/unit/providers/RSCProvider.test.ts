import { describe, expect, it } from 'vitest';
import { RSCProvider } from '../../../extension/providers/RSCProvider';

const question = {
  title: 'Event Emitter',
  slug: 'event-emitter',
  difficulty: 'medium',
  format: 'javascript',
  duration: 30,
  description: 'Implement one.',
  languages: ['js'],
  companies: ['Google'],
  metadata: { url: 'https://www.greatfrontend.com/questions/javascript/event-emitter' },
};

describe('RSCProvider', () => {
  const provider = new RSCProvider();

  it('canHandle returns true when __next_f is a non-empty array', () => {
    expect(provider.canHandle({ __next_f: [[1, '{}']] })).toBe(true);
    expect(provider.canHandle({ __next_f: [] })).toBe(false);
    expect(provider.canHandle({})).toBe(false);
  });

  it('extracts metadata from nested __next_f payload', async () => {
    const raw = { __next_f: [[1, JSON.stringify({ nested: { deep: { question } } })]] };
    const meta = await provider.getMetadata(raw);
    expect(meta).toEqual({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 30,
      description: 'Implement one.',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: ['js'],
      companies: ['Google'],
    });
  });

  it('throws when no matching shape found', async () => {
    const raw = { __next_f: [[1, JSON.stringify({ foo: 'bar' })]] };
    await expect(provider.getMetadata(raw)).rejects.toThrow();
  });

  it('skips non-parseable entries and non-[1,x] entries', async () => {
    const raw = {
      __next_f: [
        [0, 'ignored'],
        [1, 'not json'],
        [1, JSON.stringify({ question })],
      ],
    };

    const meta = await provider.getMetadata(raw);
    expect(meta.slug).toBe('event-emitter');
  });

  it('derives format from the question URL when format is missing', async () => {
    const raw = {
      __next_f: [[1, JSON.stringify({ question: { ...question, format: undefined } })]],
    };

    const meta = await provider.getMetadata(raw);
    expect(meta.format).toBe('javascript');
  });

  it('defaults format to javascript when no URL or format is present', async () => {
    const raw = {
      __next_f: [
        [
          1,
          JSON.stringify({
            question: {
              title: 'Counter',
              slug: 'counter',
              difficulty: 'easy',
            },
          }),
        ],
      ],
    };

    const meta = await provider.getMetadata(raw);
    expect(meta).toMatchObject({
      title: 'Counter',
      slug: 'counter',
      difficulty: 'easy',
      format: 'javascript',
      duration: 0,
      description: '',
      url: '',
      languages: [],
      companies: [],
    });
  });
});
