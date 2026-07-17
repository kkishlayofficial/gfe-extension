import { GitHubClient } from './GitHubClient';
import type { QuestionSnapshot, SyncTransaction } from '../types';
import { logger } from '../utils/Logger';

export class GitDataService {
  constructor(private readonly client: GitHubClient) {}

  async commit(
    owner: string,
    repo: string,
    token: string,
    snapshot: QuestionSnapshot,
    files: Array<{ path: string; content: string }>,
    message: string,
  ): Promise<SyncTransaction> {
    const tx: SyncTransaction = {
      snapshot,
      blobs: [],
      treeSha: null,
      commitSha: null,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
    const started = performance.now();

    try {
      const ref = await this.client.getRef(owner, repo, token, 'heads/main');
      const baseCommit = await this.client.getCommit(owner, repo, token, ref.object.sha);

      tx.blobs = await Promise.all(
        files.map(async (file) => {
          const blob = await this.client.createBlob(owner, repo, token, file.content, 'utf-8');
          return { path: file.path, sha: blob.sha };
        }),
      );
      tx.status = 'blobs_created';

      const tree = await this.client.createTree(
        owner,
        repo,
        token,
        baseCommit.tree.sha,
        tx.blobs.map((blob) => ({
          path: blob.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        })),
      );
      tx.treeSha = tree.sha;
      tx.status = 'tree_created';

      const nextCommit = await this.client.createCommit(owner, repo, token, {
        message,
        treeSha: tree.sha,
        parentShas: [ref.object.sha],
      });
      tx.commitSha = nextCommit.sha;
      tx.status = 'committed';

      await this.client.updateRef(owner, repo, token, 'heads/main', nextCommit.sha);

      tx.finishedAt = new Date().toISOString();
      tx.durationMs = Math.round(performance.now() - started);
      return tx;
    } catch (error) {
      tx.status = 'failed';
      tx.finishedAt = new Date().toISOString();
      tx.durationMs = Math.round(performance.now() - started);
      logger.error('git-data-commit-failed', { tx, err: String(error) });
      throw error;
    }
  }
}
