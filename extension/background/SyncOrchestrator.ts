import { z } from 'zod';
import { AuthHandler } from './AuthHandler';
import { EventBus } from './EventBus';
import { MetadataResolver } from '../providers/MetadataResolver';
import { ConfigStore } from '../storage/ConfigStore';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { HashStore } from '../storage/HashStore';
import {
  CaptureResult,
  QuestionSnapshot,
  QuestionSnapshotSchema,
  RepositoryProvider,
  SNAPSHOT_VERSION,
  SyncState,
  WorkspaceFileSchema,
} from '../types';
import { sha256 } from '../utils/Hash';
import { logger } from '../utils/Logger';

interface Deps {
  eventBus: EventBus;
  auth: Pick<AuthHandler, 'validateStoredToken'>;
  resolver: Pick<MetadataResolver, 'getMetadata'>;
  provider: RepositoryProvider;
  extensionVersion: string;
}

export class SyncOrchestrator {
  private state: SyncState = SyncState.Idle;
  private tokenValidatedThisSession = false;
  private tokenValidThisSession = false;

  constructor(private readonly deps: Deps) {}

  getState(): SyncState {
    return this.state;
  }

  async handleCapture(capture: CaptureResult): Promise<void> {
    try {
      const workspace = z.array(WorkspaceFileSchema).min(1).parse(capture.workspace);

      await this.setState(SyncState.Capturing);

      if (!this.tokenValidatedThisSession) {
        this.tokenValidThisSession = await this.deps.auth.validateStoredToken();
        this.tokenValidatedThisSession = true;
      }

      if (!this.tokenValidThisSession) {
        throw new Error('No valid GitHub token');
      }

      await this.setState(SyncState.Building);
      const metadata = await this.deps.resolver.getMetadata(capture.metadata);
      const files = [...workspace].sort((left, right) => left.path.localeCompare(right.path));
      const hash = await sha256(JSON.stringify({ metadata, files }));
      const snapshot: QuestionSnapshot = QuestionSnapshotSchema.parse({
        metadata,
        files,
        hash,
        completedAt: new Date(capture.timestamp).toISOString(),
        extensionVersion: this.deps.extensionVersion,
        snapshotVersion: SNAPSHOT_VERSION,
      });

      await this.deps.eventBus.emit({ type: 'SNAPSHOT_CREATED', payload: { snapshot } });

      const existingHash = await HashStore.get(metadata.slug);
      if (existingHash === hash) {
        await this.deps.eventBus.emit({
          type: 'SYNC_SKIPPED',
          payload: { slug: metadata.slug, reason: 'hash_match' },
        });
        await this.setState(SyncState.Success);
        return;
      }

      await this.setState(SyncState.Syncing);
      await this.deps.eventBus.emit({ type: 'SYNC_STARTED', payload: { slug: metadata.slug } });

      const config = await ConfigStore.get();
      const token = await ExtensionStorage.get<string>('token');
      if (!token) {
        throw new Error('No valid GitHub token');
      }

      await this.deps.provider.ensureRepository(token, config);
      const startedAt = Date.now();
      const { commitSha } = await this.deps.provider.synchronize(snapshot, token, config);
      const duration = Date.now() - startedAt;

      await HashStore.set(metadata.slug, hash);
      await ExtensionStorage.setLastSync({
        slug: metadata.slug,
        title: metadata.title,
        commitSha,
        syncedAt: new Date().toISOString(),
      });
      await this.deps.eventBus.emit({
        type: 'SYNC_COMPLETED',
        payload: { slug: metadata.slug, commitSha, duration, fileCount: snapshot.files.length },
      });
      await this.setState(SyncState.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('sync_failed', { error: message });
      await this.deps.eventBus.emit({ type: 'SYNC_FAILED', payload: { error: message } });
      await this.setState(SyncState.Failed);
    }
  }

  private async setState(next: SyncState): Promise<void> {
    this.state = next;
    await this.deps.eventBus.emit({ type: 'STATE_CHANGED', payload: { state: next } });
  }
}