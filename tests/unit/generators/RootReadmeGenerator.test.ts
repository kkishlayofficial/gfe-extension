import { describe, it, expect } from 'vitest';
import { RootReadmeGenerator } from '../../../extension/generators/RootReadmeGenerator';
import { RepoIndex } from '../../../extension/types';

describe('RootReadmeGenerator', () => {
  it('renders header, progress table, and per-category sections', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'a', commitSha: 'c1abc123', syncedAt: '2025-01-01T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'javascript', title: 'Event Emitter',
        },
        counter: {
          hash: 'b', commitSha: 'c2def456', syncedAt: '2025-01-02T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'categorized');
    expect(md).toContain('GreatFrontend Solutions');
    expect(md).toContain('solutions-2-6366f1');               // shields.io total badge
    expect(md).toContain('## 📊 Progress');                   // stats section heading
    expect(md).toContain('pie title Solutions by Category');  // mermaid chart
    expect(md).toContain('[Event Emitter](javascript/event-emitter)');
    expect(md).toContain('[Counter](react/counter)');
    expect(md).toContain('`c1abc12`');                        // short sha in code span
  });

  it('uses flat paths when layout is flat', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        counter: {
          hash: 'x', commitSha: 'cabc123', syncedAt: '2025-01-01T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'flat');
    expect(md).toContain('[Counter](counter)');
  });

  it('omits mermaid chart when there is only one category', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        counter: {
          hash: 'x', commitSha: 'cabc123', syncedAt: '2025-01-01T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'flat');
    expect(md).not.toContain('pie title');
  });
});