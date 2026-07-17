import { describe, it, expect } from 'vitest';
import { MetadataFileGenerator } from '../../../extension/generators/MetadataFileGenerator';
import { QuestionSnapshot } from '../../../extension/types';

describe('MetadataFileGenerator', () => {
  it('serializes snapshot metadata to pretty JSON', () => {
    const snap: QuestionSnapshot = {
      metadata: {
        title: 't',
        slug: 's',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: 'd',
        url: 'u',
        languages: [],
        companies: [],
      },
      files: [],
      hash: 'h',
      completedAt: '2025',
      extensionVersion: '0.1.0',
      snapshotVersion: 1,
    };
    const json = new MetadataFileGenerator().generate(snap);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.slug).toBe('s');
    expect(parsed.hash).toBe('h');
    expect(parsed.snapshotVersion).toBe(1);
    expect(parsed.extensionVersion).toBe('0.1.0');
    expect(json).toContain('\n');
  });
});