import type { QuestionSnapshot, RepoIndexEntry, RepositoryProvider, SyncConfig } from '../types';
import { GitHubClient } from './GitHubClient';
import { GitDataService } from './GitDataService';
import { RepoManager } from './RepoManager';
import { IndexManager } from './IndexManager';
import { ReadmeGenerator } from '../generators/ReadmeGenerator';
import { MetadataFileGenerator } from '../generators/MetadataFileGenerator';
import { RootReadmeGenerator } from '../generators/RootReadmeGenerator';
import { logger } from '../utils/Logger';

export class GitHubProvider implements RepositoryProvider {
  private readonly client = new GitHubClient();
  private readonly repos = new RepoManager(this.client);
  private readonly gitData = new GitDataService(this.client);
  private readonly index = new IndexManager(this.client);
  private readonly readme = new ReadmeGenerator();
  private readonly metaFile = new MetadataFileGenerator();
  private readonly rootReadme = new RootReadmeGenerator();

  async ensureRepository(
    token: string,
    config: SyncConfig,
  ): Promise<{ owner: string; repo: string }> {
    return this.repos.ensureRepo(token, config);
  }

  async synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }> {
    const { owner, repo } = await this.ensureRepository(token, config);
    const base = this.basePath(snapshot, config);

    const [currentIndex, headRef] = await Promise.all([
      this.index.get(owner, repo, token),
      this.client.getRef(owner, repo, token, 'heads/main'),
    ]);
    const parentSha = headRef.object.sha;

    const newEntry: RepoIndexEntry = {
      hash: snapshot.hash,
      commitSha: parentSha,
      syncedAt: new Date().toISOString(),
      extensionVersion: snapshot.extensionVersion,
      snapshotVersion: snapshot.snapshotVersion,
      category: snapshot.metadata.format,
      title: snapshot.metadata.title,
    };
    const updatedIndex = {
      ...currentIndex,
      solutions: { ...currentIndex.solutions, [snapshot.metadata.slug]: newEntry },
    };

    const files: Array<{ path: string; content: string }> = [
      { path: `${base}/README.md`, content: this.readme.generate(snapshot) },
      { path: `${base}/metadata.json`, content: this.metaFile.generate(snapshot) },
      ...snapshot.files.map((file) => ({
        path: `${base}/workspace/${file.path}`,
        content: file.content,
      })),
      { path: 'index.json', content: JSON.stringify(updatedIndex, null, 2) },
    ];
    if (config.generateRootReadme) {
      files.push({
        path: 'README.md',
        content: this.rootReadme.generate(updatedIndex, config.folderLayout),
      });
    }

    const message = this.commitMessage(snapshot, config);
    const tx = await this.gitData.commit(owner, repo, token, snapshot, files, message);

    if (!tx.commitSha) {
      throw new Error('Commit returned no SHA');
    }

    logger.info('github.sync.committed', {
      slug: snapshot.metadata.slug,
      commitSha: tx.commitSha,
      durationMs: tx.durationMs,
      fileCount: files.length,
    });

    return { commitSha: tx.commitSha };
  }

  private basePath(snapshot: QuestionSnapshot, config: SyncConfig): string {
    return config.folderLayout === 'categorized'
      ? `${snapshot.metadata.format}/${snapshot.metadata.slug}`
      : snapshot.metadata.slug;
  }

  private commitMessage(snapshot: QuestionSnapshot, config: SyncConfig): string {
    return config.commitMessageTemplate
      .replace(/\{slug\}/g, snapshot.metadata.slug)
      .replace(/\{title\}/g, snapshot.metadata.title)
      .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  }
}
