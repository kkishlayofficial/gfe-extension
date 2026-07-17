import { GitHubClient } from './GitHubClient';
import { RepoIndex, RepoIndexSchema } from '../types';
import { logger } from '../utils/Logger';

const INDEX_PATH = 'index.json';

export class IndexManager {
  constructor(private readonly client: GitHubClient) {}

  async get(owner: string, repo: string, token: string): Promise<RepoIndex> {
    const file = await this.client.getContents(owner, repo, token, INDEX_PATH);

    if (!file) {
      return { version: 1, solutions: {} };
    }

    try {
      return RepoIndexSchema.parse(JSON.parse(file.content));
    } catch (error) {
      logger.warn('index-parse-failed', { owner, repo, err: String(error) });
      return { version: 1, solutions: {} };
    }
  }
}
