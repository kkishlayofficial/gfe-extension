import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const SNAPSHOT_VERSION = 1;
export const METADATA_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export enum SyncState {
  Idle = 'idle',
  Capturing = 'capturing',
  Building = 'building',
  Authenticating = 'authenticating',
  Syncing = 'syncing',
  Success = 'success',
  Failed = 'failed',
}

// ─────────────────────────────────────────────────────────────
// Zod schemas (source of truth) — TS types inferred below
// ─────────────────────────────────────────────────────────────

export const WorkspaceFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  language: z.string().min(1),
});

export const QuestionMetadataSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  difficulty: z.string().min(1),
  format: z.string().min(1),
  duration: z.number().int().nonnegative(),
  description: z.string(),
  url: z.string().url(),
  languages: z.array(z.string()),
  companies: z.array(z.string()),
});

export const QuestionSnapshotSchema = z.object({
  metadata: QuestionMetadataSchema,
  files: z.array(WorkspaceFileSchema).min(1),
  hash: z.string().min(1),
  completedAt: z.string().min(1),
  extensionVersion: z.string().min(1),
  snapshotVersion: z.literal(SNAPSHOT_VERSION),
});

export const RawMetadataSchema = z.object({
  __next_f: z.array(z.unknown()).optional(),
  domSnapshot: z
    .object({
      title: z.string(),
      difficulty: z.string(),
      duration: z.string(),
      description: z.string(),
      url: z.string(),
      companies: z.array(z.string()).optional(),
    })
    .optional(),
});

export const CaptureResultSchema = z.object({
  workspace: z.array(WorkspaceFileSchema).min(1),
  metadata: RawMetadataSchema,
  timestamp: z.number().int().nonnegative(),
  pageUrl: z.string().url(),
});

export const SyncConfigSchema = z.object({
  repoName: z.string().min(1).default('greatfrontend-solutions'),
  folderLayout: z.enum(['categorized', 'flat']).default('categorized'),
  commitMessageTemplate: z.string().min(1).default('feat: add {slug} ({date})'),
  autoSync: z.boolean().default(true),
  generateRootReadme: z.boolean().default(true),
  repoVisibility: z.enum(['private', 'public']).default('private'),
});

export const RepoIndexEntrySchema = z.object({
  hash: z.string().min(1),
  commitSha: z.string().min(1),
  syncedAt: z.string().min(1),
  extensionVersion: z.string().min(1),
  snapshotVersion: z.number().int(),
  category: z.string().min(1),
  title: z.string().min(1),
});

export const RepoIndexSchema = z.object({
  version: z.literal(1),
  solutions: z.record(z.string(), RepoIndexEntrySchema),
});

// ─────────────────────────────────────────────────────────────
// Inferred TS types
// ─────────────────────────────────────────────────────────────

export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;
export type QuestionMetadata = z.infer<typeof QuestionMetadataSchema>;
export type QuestionSnapshot = z.infer<typeof QuestionSnapshotSchema>;
export type RawMetadata = z.infer<typeof RawMetadataSchema>;
export type CaptureResult = z.infer<typeof CaptureResultSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type RepoIndex = z.infer<typeof RepoIndexSchema>;
export type RepoIndexEntry = z.infer<typeof RepoIndexEntrySchema>;

// ─────────────────────────────────────────────────────────────
// Runtime state contracts (not user data — no Zod)
// ─────────────────────────────────────────────────────────────

export interface AppState {
  syncState: SyncState;
  auth: {
    connected: boolean;
    tokenExpired: boolean;
    username?: string;
    avatarUrl?: string;
  };
  config: SyncConfig;
  lastSync?: { slug: string; title: string; commitSha: string; syncedAt: string };
  lastError?: string;
}

export interface SyncTransaction {
  snapshot: QuestionSnapshot;
  blobs: Array<{ path: string; sha: string }>;
  treeSha: string | null;
  commitSha: string | null;
  status: 'pending' | 'blobs_created' | 'tree_created' | 'committed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

// ─────────────────────────────────────────────────────────────
// Provider interfaces (dependency-inversion boundaries)
// ─────────────────────────────────────────────────────────────

export interface IMetadataProvider {
  canHandle(raw: RawMetadata): boolean;
  getMetadata(raw: RawMetadata): Promise<QuestionMetadata>;
}

export interface RepositoryProvider {
  ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }>;
  synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }>;
}

// ─────────────────────────────────────────────────────────────
// EventBus event union
// ─────────────────────────────────────────────────────────────

export type ExtensionEvent =
  | { type: 'QUESTION_COMPLETED'; payload: CaptureResult }
  | { type: 'SNAPSHOT_CREATED'; payload: { snapshot: QuestionSnapshot } }
  | { type: 'SYNC_STARTED'; payload: { slug: string } }
  | {
      type: 'SYNC_COMPLETED';
      payload: { slug: string; commitSha: string; duration: number; fileCount: number };
    }
  | { type: 'SYNC_FAILED'; payload: { slug?: string; error: string } }
  | { type: 'SYNC_SKIPPED'; payload: { slug: string; reason: 'hash_match' } }
  | { type: 'STATE_CHANGED'; payload: { state: SyncState } }
  | { type: 'AUTH_COMPLETE'; payload: { username: string; avatarUrl: string } }
  | { type: 'AUTH_FAILED'; payload: { error: string } }
  | { type: 'AUTH_REVOKED'; payload: Record<string, never> }
  | { type: 'TOKEN_EXPIRED'; payload: Record<string, never> };

// ─────────────────────────────────────────────────────────────
// chrome.runtime message union
// ─────────────────────────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'QUESTION_COMPLETED'; payload: CaptureResult }
  | { type: 'AUTH_START' }
  | { type: 'AUTH_REVOKE' }
  | { type: 'GET_STATE' };

// ─────────────────────────────────────────────────────────────
// Error hierarchy
// ─────────────────────────────────────────────────────────────

export class GfeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'GfeError';
  }
}

export class MonacoUnavailableError extends GfeError {
  constructor() {
    super('Monaco editor not found', 'MONACO_UNAVAILABLE');
    this.name = 'MonacoUnavailableError';
  }
}

export class MetadataUnavailableError extends GfeError {
  constructor(msg = 'Could not extract question metadata') {
    super(msg, 'METADATA_UNAVAILABLE');
    this.name = 'MetadataUnavailableError';
  }
}

export class GitHubApiError extends GfeError {
  constructor(
    public readonly status: number,
    message: string,
    public readonly rateLimited = false,
  ) {
    super(message, 'GITHUB_API_ERROR');
    this.name = 'GitHubApiError';
  }
}

export class AuthError extends GfeError {
  constructor(msg: string) {
    super(msg, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}
