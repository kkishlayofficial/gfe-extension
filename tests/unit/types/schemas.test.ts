import { describe, it, expect } from 'vitest';
import {
  WorkspaceFileSchema,
  QuestionMetadataSchema,
  QuestionSnapshotSchema,
  SyncConfigSchema,
  RepoIndexSchema,
  SNAPSHOT_VERSION,
  SyncState,
  GfeError,
  MonacoUnavailableError,
  MetadataUnavailableError,
  GitHubApiError,
  AuthError,
} from '../../../extension/types';
import { ZodError } from 'zod';

describe('WorkspaceFileSchema', () => {
  it('accepts a valid workspace file', () => {
    const result = WorkspaceFileSchema.parse({ path: 'src/a.js', content: 'x', language: 'javascript' });
    expect(result.path).toBe('src/a.js');
  });

  it('rejects missing path', () => {
    expect(() => WorkspaceFileSchema.parse({ content: 'x', language: 'javascript' })).toThrow(ZodError);
  });

  it('rejects non-string content', () => {
    expect(() => WorkspaceFileSchema.parse({ path: 'a', content: 42, language: 'javascript' })).toThrow(ZodError);
  });
});

describe('QuestionMetadataSchema', () => {
  it('accepts valid metadata', () => {
    const m = QuestionMetadataSchema.parse({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 20,
      description: 'Build an event emitter.',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: ['js'],
      companies: ['Google'],
    });
    expect(m.slug).toBe('event-emitter');
  });

  it('rejects missing slug', () => {
    expect(() =>
      QuestionMetadataSchema.parse({
        title: 't',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: '',
        url: 'https://x',
        languages: [],
        companies: [],
      }),
    ).toThrow(ZodError);
  });
});

describe('QuestionSnapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    const snap = QuestionSnapshotSchema.parse({
      metadata: {
        title: 'A',
        slug: 'a',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: '',
        url: 'https://x',
        languages: [],
        companies: [],
      },
      files: [{ path: 'a.js', content: 'x', language: 'javascript' }],
      hash: 'abc',
      completedAt: '2026-07-17T00:00:00Z',
      extensionVersion: '0.1.0',
      snapshotVersion: SNAPSHOT_VERSION,
    });
    expect(snap.snapshotVersion).toBe(1);
  });
});

describe('SyncConfigSchema', () => {
  it('applies defaults when parsing empty object', () => {
    const cfg = SyncConfigSchema.parse({});
    expect(cfg.repoName).toBe('greatfrontend-solutions');
    expect(cfg.folderLayout).toBe('categorized');
    expect(cfg.commitMessageTemplate).toBe('feat: add {slug} ({date})');
    expect(cfg.autoSync).toBe(true);
    expect(cfg.generateRootReadme).toBe(true);
    expect(cfg.repoVisibility).toBe('private');
  });

  it('accepts partial overrides', () => {
    const cfg = SyncConfigSchema.parse({ repoName: 'my-repo', folderLayout: 'flat' });
    expect(cfg.repoName).toBe('my-repo');
    expect(cfg.folderLayout).toBe('flat');
  });

  it('rejects invalid folderLayout', () => {
    expect(() => SyncConfigSchema.parse({ folderLayout: 'invalid' })).toThrow(ZodError);
  });
});

describe('RepoIndexSchema', () => {
  it('accepts empty solutions', () => {
    const idx = RepoIndexSchema.parse({ version: 1, solutions: {} });
    expect(idx.version).toBe(1);
  });

  it('accepts populated solutions', () => {
    const idx = RepoIndexSchema.parse({
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'abc',
          commitSha: 'def',
          syncedAt: '2026-07-17T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Event Emitter',
        },
      },
    });
    expect(idx.solutions['event-emitter']?.title).toBe('Event Emitter');
  });
});

describe('SyncState enum', () => {
  it('has all documented states', () => {
    expect(SyncState.Idle).toBe('idle');
    expect(SyncState.Capturing).toBe('capturing');
    expect(SyncState.Building).toBe('building');
    expect(SyncState.Authenticating).toBe('authenticating');
    expect(SyncState.Syncing).toBe('syncing');
    expect(SyncState.Success).toBe('success');
    expect(SyncState.Failed).toBe('failed');
  });
});

describe('Error hierarchy', () => {
  it('MonacoUnavailableError extends GfeError with correct code', () => {
    const e = new MonacoUnavailableError();
    expect(e).toBeInstanceOf(GfeError);
    expect(e.code).toBe('MONACO_UNAVAILABLE');
    expect(e.name).toBe('MonacoUnavailableError');
  });

  it('MetadataUnavailableError has default and custom messages', () => {
    expect(new MetadataUnavailableError().message).toMatch(/metadata/i);
    expect(new MetadataUnavailableError('custom').message).toBe('custom');
  });

  it('GitHubApiError preserves status and rateLimited flag', () => {
    const e = new GitHubApiError(403, 'rate limited', true);
    expect(e.status).toBe(403);
    expect(e.rateLimited).toBe(true);
  });

  it('AuthError has AUTH_ERROR code', () => {
    expect(new AuthError('bad').code).toBe('AUTH_ERROR');
  });
});
