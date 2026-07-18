import { describe, it, expect } from 'vitest';
import { RootReadmeGenerator } from '../../../extension/generators/RootReadmeGenerator';
import { RepoIndex } from '../../../extension/types';

describe('RootReadmeGenerator', () => {
  it('renders stats and per-category tables', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'a', commitSha: 'c1', syncedAt: '2025-01-01T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'javascript', title: 'Event Emitter',
        },
        'counter': {
          hash: 'b', commitSha: 'c2', syncedAt: '2025-01-02T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'categorized');
    expect(md).toContain('# GreatFrontend Solutions');
    expect(md).toContain('**Total solutions:** 2');
    expect(md).toContain('## JavaScript');
    expect(md).toContain('## React');
    expect(md).toContain('[Event Emitter](javascript/event-emitter)');
    expect(md).toContain('[Counter](react/counter)');
  });

  it('uses flat paths when layout is flat', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        counter: {
          hash: 'x', commitSha: 'c', syncedAt: '2025', extensionVersion: '0.1.0',
          snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'flat');
    expect(md).toContain('[Counter](counter)');
  });
});