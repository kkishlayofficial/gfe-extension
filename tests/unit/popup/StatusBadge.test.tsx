import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../extension/test-utils/testing-library';
import { StatusBadge } from '../../../extension/popup/components/StatusBadge';
import { SyncState } from '../../../extension/types';

describe('StatusBadge', () => {
  it.each([
    [SyncState.Idle, 'Idle', 'grey'],
    [SyncState.Capturing, 'Capturing...', 'blue'],
    [SyncState.Building, 'Building...', 'blue'],
    [SyncState.Authenticating, 'Authenticating...', 'yellow'],
    [SyncState.Syncing, 'Syncing...', 'blue'],
    [SyncState.Success, 'Synced', 'green'],
    [SyncState.Failed, 'Failed', 'red'],
  ])('renders %s with label %s and colour %s', (state, label, colour) => {
    render(<StatusBadge state={state} />);
    const el = screen.getByText(label);
    expect(el).toBeInTheDocument();
    expect(el.getAttribute('data-color')).toBe(colour);
  });
});