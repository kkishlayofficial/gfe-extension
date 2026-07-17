import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../extension/test-utils/testing-library';
import { App } from '../../../extension/options/App';
import { ConfigStore } from '../../../extension/storage/ConfigStore';
import { act } from 'react';

describe('Options App', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await chrome.storage.local.clear();
    chrome.runtime.sendMessage = vi.fn() as never;
  });

  it('renders all five sections', async () => {
    await act(async () => {
      render(<App />);
      await vi.runAllTimersAsync();
    });
    expect(screen.getByRole('heading', { name: 'Repository' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Commits' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Automation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeInTheDocument();
  });

  it('debounces writes to ConfigStore', async () => {
    await act(async () => {
      render(<App />);
      await vi.runAllTimersAsync();
    });
    const input = screen.getByLabelText(/Repository name/) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'my-repo' } });
    });
    const before = await ConfigStore.get();
    expect(before.repoName).not.toBe('my-repo');
    await vi.advanceTimersByTimeAsync(400);
    const after = await ConfigStore.get();
    expect(after.repoName).toBe('my-repo');
  });

  it('sends AUTH_REVOKE when Disconnect clicked', async () => {
    await act(async () => {
      render(<App />);
      await vi.runAllTimersAsync();
    });
    fireEvent.click(screen.getByRole('button', { name: /Disconnect GitHub/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_REVOKE' });
  });
});