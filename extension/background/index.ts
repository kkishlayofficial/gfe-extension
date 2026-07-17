import { AuthHandler } from './AuthHandler';
import { EventBus } from './EventBus';
import { MessageRouter } from './MessageRouter';
import { SyncOrchestrator } from './SyncOrchestrator';
import { GitHubProvider } from '../github/GitHubProvider';
import { DOMProvider } from '../providers/DOMProvider';
import { MetadataResolver } from '../providers/MetadataResolver';
import { RSCProvider } from '../providers/RSCProvider';
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

chrome.runtime.onStartup.addListener(() => {
  logger.info('startup');
  void auth.validateStoredToken();
});

chrome.runtime.onInstalled.addListener(() => {
  logger.info('installed');
  void auth.validateStoredToken();
});
