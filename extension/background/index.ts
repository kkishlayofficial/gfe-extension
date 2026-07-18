import { AuthHandler } from './AuthHandler';
import { EventBus } from './EventBus';
import { MessageRouter } from './MessageRouter';
import { SyncOrchestrator } from './SyncOrchestrator';
import { GitHubProvider } from '../github/GitHubProvider';
import { DOMProvider } from '../providers/DOMProvider';
import { MetadataResolver } from '../providers/MetadataResolver';
import { RSCProvider } from '../providers/RSCProvider';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { logger } from '../utils/Logger';

const eventBus = new EventBus();
const auth = new AuthHandler(eventBus);
const resolver = new MetadataResolver([new RSCProvider(), new DOMProvider()]);
const provider = new GitHubProvider();
const orchestrator = new SyncOrchestrator({
  eventBus,
  auth,
  resolver,
  provider,
  extensionVersion: (import.meta.env.EXTENSION_VERSION as string) ?? '0.0.0',
});
const router = new MessageRouter({ orchestrator, auth, eventBus });

router.register();

// Reset token validation cache on any auth state change so the next sync
// always re-checks the stored token rather than using a stale cached result.
eventBus.on('AUTH_COMPLETE', () => orchestrator.resetTokenValidation());
eventBus.on('AUTH_REVOKED', () => orchestrator.resetTokenValidation());
eventBus.on('TOKEN_EXPIRED', () => orchestrator.resetTokenValidation());

// Badge + persisted notification so the user sees feedback even when the popup was closed.
// Also broadcasts an inline toast to any open GFE tabs via the content script.
async function notifyGfeTabs(type: 'success' | 'error', message: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.greatfrontend.com/*' });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'SHOW_PAGE_TOAST', payload: { type, message } })
        .catch(() => {
          // Tab may not have the content script ready — silently ignore.
        });
    }
  }
}

eventBus.on('SYNC_COMPLETED', async (event) => {
  const lastSync = await ExtensionStorage.getLastSync();
  const message = `Synced: ${lastSync?.title ?? event.payload.slug}`;
  await chrome.storage.local.set({ pendingNotification: { type: 'success', message } });
  chrome.action.setBadgeText({ text: '\u2713' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  // Auto-clear the success badge after 5 seconds.
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);
  await notifyGfeTabs('success', message);
});

eventBus.on('SYNC_FAILED', async (event) => {
  await chrome.storage.local.set({ pendingNotification: { type: 'error', message: event.payload.error } });
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  await notifyGfeTabs('error', event.payload.error);
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('startup');
  void auth.validateStoredToken();
});

chrome.runtime.onInstalled.addListener(() => {
  logger.info('installed');
  void auth.validateStoredToken();

  // Inject the content script into any GFE tabs that were already open when
  // the extension was installed or reloaded, so the user doesn't have to
  // manually refresh.
  void (async () => {
    const manifest = chrome.runtime.getManifest();
    const files = manifest.content_scripts?.[0]?.js ?? [];
    if (files.length === 0) return;
    const tabs = await chrome.tabs.query({ url: 'https://www.greatfrontend.com/*' });
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files })
          .catch(() => {}); // tab may be a special page — ignore
      }
    }
  })();
});
