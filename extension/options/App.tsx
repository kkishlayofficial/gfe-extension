import { useEffect, useRef, useState } from 'react';
import { ConfigStore } from '../storage/ConfigStore';
import { SyncConfig } from '../types';

function useDebouncedSave(config: SyncConfig | null): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void ConfigStore.set(config);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [config]);
}

export function App() {
  const [config, setConfig] = useState<SyncConfig | null>(null);

  useEffect(() => {
    void ConfigStore.get().then(setConfig);
  }, []);

  useDebouncedSave(config);

  if (!config) return <div>Loading…</div>;
  const patch = (partial: Partial<SyncConfig>) => setConfig({ ...config, ...partial });

  return (
    <main className="options">
      <section>
        <h2>Repository</h2>
        <label>
          Repository name
          <input
            aria-label="Repository name"
            value={config.repoName}
            onChange={(event) => patch({ repoName: event.target.value })}
          />
        </label>
        <fieldset>
          <legend>Visibility</legend>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={config.repoVisibility === 'private'}
              onChange={() => patch({ repoVisibility: 'private' })}
            />
            Private
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={config.repoVisibility === 'public'}
              onChange={() => patch({ repoVisibility: 'public' })}
            />
            Public
          </label>
        </fieldset>
      </section>

      <section>
        <h2>Layout</h2>
        <label>
          <input
            type="radio"
            name="layout"
            checked={config.folderLayout === 'categorized'}
            onChange={() => patch({ folderLayout: 'categorized' })}
          />
          Categorized — <code>javascript/event-emitter/</code>
        </label>
        <label>
          <input
            type="radio"
            name="layout"
            checked={config.folderLayout === 'flat'}
            onChange={() => patch({ folderLayout: 'flat' })}
          />
          Flat — <code>event-emitter/</code>
        </label>
      </section>

      <section>
        <h2>Commits</h2>
        <label>
          Commit message template
          <input
            aria-label="Commit template"
            value={config.commitMessageTemplate}
            onChange={(event) => patch({ commitMessageTemplate: event.target.value })}
          />
        </label>
        <small>Available tokens: {'{title}, {slug}, {date}'}</small>
      </section>

      <section>
        <h2>Automation</h2>
        <label>
          <input
            type="checkbox"
            checked={config.autoSync}
            onChange={(event) => patch({ autoSync: event.target.checked })}
          />
          Auto sync
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.generateRootReadme}
            onChange={(event) => patch({ generateRootReadme: event.target.checked })}
          />
          Generate root README
        </label>
      </section>

      <section className="danger">
        <h2>Danger Zone</h2>
        <button type="button" onClick={() => chrome.runtime.sendMessage({ type: 'AUTH_REVOKE' })}>
          Disconnect GitHub
        </button>
      </section>
    </main>
  );
}
