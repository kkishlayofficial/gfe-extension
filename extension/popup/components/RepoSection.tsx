import { AppState } from '../../types';

export function RepoSection({ state }: { state: AppState }) {
  const owner = state.auth.username;
  const repo = state.config.repoName;
  if (!owner) return null;
  const url = `https://github.com/${owner}/${repo}`;
  return (
    <section className="section">
      <h2>Repository</h2>
      <a href={url} target="_blank" rel="noreferrer">
        {owner}/{repo}
      </a>
    </section>
  );
}
