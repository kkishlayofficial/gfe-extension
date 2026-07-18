import { AppState } from '../../types';
import { StatusBadge } from './StatusBadge';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relative(iso: string): string {
  const delta = (new Date(iso).getTime() - Date.now()) / 1000;
  const minutes = Math.round(delta / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function SyncSection({ state }: { state: AppState }) {
  return (
    <section className="section">
      <header>
        <h2>Sync Status</h2>
        <StatusBadge state={state.syncState} />
      </header>
      {state.lastSync ? (
        <p>
          Last synced <strong>{state.lastSync.title}</strong>{' '}
          <span className="gfe-muted">·</span>{' '}
          {relative(state.lastSync.syncedAt)}{' '}
          <span className="gfe-muted">·</span>{' '}
          <code className="gfe-sha">{state.lastSync.commitSha.slice(0, 7)}</code>
        </p>
      ) : (
        <p className="gfe-muted">No sync recorded yet.</p>
      )}
    </section>
  );
}
