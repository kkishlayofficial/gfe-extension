import { SyncState } from '../../types';

const MAP: Record<SyncState, { label: string; color: string }> = {
  [SyncState.Idle]: { label: 'Idle', color: 'grey' },
  [SyncState.Capturing]: { label: 'Capturing...', color: 'blue' },
  [SyncState.Building]: { label: 'Building...', color: 'blue' },
  [SyncState.Authenticating]: { label: 'Authenticating...', color: 'yellow' },
  [SyncState.Syncing]: { label: 'Syncing...', color: 'blue' },
  [SyncState.Success]: { label: 'Synced', color: 'green' },
  [SyncState.Failed]: { label: 'Failed', color: 'red' },
};

export function StatusBadge({ state }: { state: SyncState }) {
  const { label, color } = MAP[state];
  return (
    <span className={`badge badge-${color}`} data-color={color} role="status">
      {label}
    </span>
  );
}
