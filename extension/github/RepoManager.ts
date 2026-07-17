import { GitHubClient } from './GitHubClient';
import type { SyncConfig } from '../types';
import { GitHubApiError } from '../types';

const BASE = 'https://api.github.com';

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export class RepoManager {
  constructor(private readonly client: GitHubClient) {}

  async ensureRepo(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }> {
    const userResponse = await fetch(`${BASE}/user`, {
      method: 'GET',
      headers: authHeaders(token),
    });

    if (!userResponse.ok) {
      throw new GitHubApiError(userResponse.status, `Failed to resolve user: ${userResponse.status}`);
    }

    const user = (await userResponse.json()) as { login?: string };
    if (!user.login) {
      throw new GitHubApiError(500, 'Failed to resolve user login');
    }

    const owner = user.login;
    const existing = await this.client.getRepo(owner, config.repoName, token);

    if (existing) {
      return { owner, repo: config.repoName };
    }

    const created = await this.client.createRepo(token, {
      name: config.repoName,
      private: config.repoVisibility === 'private',
      description: 'GreatFrontend solutions synced automatically by the GFE Sync extension',
    });

    return { owner, repo: created.name };
  }
}