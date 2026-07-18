import { describe, it, expect } from 'vitest';
import { ReadmeGenerator } from '../../../extension/generators/ReadmeGenerator';
import { QuestionSnapshot } from '../../../extension/types';

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter',
    slug: 'event-emitter',
    difficulty: 'medium',
    format: 'javascript',
    duration: 30,
    description: '<p>Build one.</p>',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js', 'ts'],
    companies: ['Google', 'Meta'],
  },
  files: [
    { path: 'src/index.js', content: '', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'abc',
  completedAt: '2025-01-01T00:00:00.000Z',
  extensionVersion: '0.1.0',
  snapshotVersion: 1,
};

describe('ReadmeGenerator', () => {
  it('generates README with heading, badges, languages, companies, source link, description, and structure', () => {
    const md = new ReadmeGenerator().generate(snapshot);
    expect(md).toContain('# Event Emitter');
    expect(md).toContain('**Difficulty:** Medium');
    expect(md).toContain('**Format:** JavaScript');
    expect(md).toContain('**Duration:** 30 minutes');
    expect(md).toContain('- js');
    expect(md).toContain('- ts');
    expect(md).toContain('- Google');
    expect(md).toContain('[View on GreatFrontend]');
    expect(md).toContain('<p>Build one.</p>');
    expect(md).toContain('## Project Structure');
    expect(md).toContain('- src/index.js');
    expect(md).toContain('- package.json');
  });
});