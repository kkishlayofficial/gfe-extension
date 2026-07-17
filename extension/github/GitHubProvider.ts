import type { QuestionSnapshot, RepoIndexEntry, RepositoryProvider, SyncConfig } from '../types';
import { GitHubClient } from './GitHubClient';
import { GitDataService } from './GitDataService';
import { RepoManager } from './RepoManager';
import { IndexManager } from './IndexManager';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderCommitMessage(template: string, snapshot: QuestionSnapshot): string {
  return template
    .replace(/\{slug\}/g, snapshot.metadata.slug)
    .replace(/\{title\}/g, snapshot.metadata.title)
    .replace(/\{date\}/g, today());
}

function basePath(config: SyncConfig, snapshot: QuestionSnapshot): string {
  if (config.folderLayout === 'flat') {
    return snapshot.metadata.slug;
  }

  return `${snapshot.metadata.format}/${snapshot.metadata.slug}`;
}

export class GitHubProvider implements RepositoryProvider {
  private readonly client = new GitHubClient();
  private readonly dataService = new GitDataService(this.client);
  private readonly repoManager = new RepoManager(this.client);
  private readonly indexManager = new IndexManager(this.client);

  protected renderReadme(snapshot: QuestionSnapshot): string {
    return `# ${snapshot.metadata.title}\n\n${snapshot.metadata.description}`;
  }

  protected renderMetadataJson(snapshot: QuestionSnapshot): string {
    return JSON.stringify(
      {
        schemaVersion: 1,
        title: snapshot.metadata.title,
        slug: snapshot.metadata.slug,
        difficulty: snapshot.metadata.difficulty,
        format: snapshot.metadata.format,
        duration: snapshot.metadata.duration,
        url: snapshot.metadata.url,
        languages: snapshot.metadata.languages,
        companies: snapshot.metadata.companies,
        hash: snapshot.hash,
        completedAt: snapshot.completedAt,
        extensionVersion: snapshot.extensionVersion,
        snapshotVersion: snapshot.snapshotVersion,
      },
      null,
      2,
    );
  }

  protected renderRootReadme(index: { solutions: Record<string, RepoIndexEntry> }): string {
    const solvedCount = Object.keys(index.solutions).length;
    return `# GreatFrontend Solutions\n\n**Total solved:** ${solvedCount}\n`;
  }

  async ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }> {
    return this.repoManager.ensureRepo(token, config);
  }

  async synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }> {
    const { owner, repo } = await this.ensureRepository(token, config);
    const pathPrefix = basePath(config, snapshot);

    const files: Array<{ path: string; content: string }> = [
      ...snapshot.files.map((file) => ({ path: `${pathPrefix}/workspace/${file.path}`, content: file.content })),
      { path: `${pathPrefix}/README.md`, content: this.renderReadme(snapshot) },
      { path: `${pathPrefix}/metadata.json`, content: this.renderMetadataJson(snapshot) },
    ];

    const message = renderCommitMessage(config.commitMessageTemplate, snapshot);
    const tx = await this.dataService.commit(owner, repo, token, snapshot, files, message);

    if (!tx.commitSha) {
      throw new Error('Commit missing sha');
    }

    void this.indexManager;
    void this.renderRootReadme;

    return { commitSha: tx.commitSha };
  }
}