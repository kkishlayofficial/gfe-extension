import { AuthHandler } from './AuthHandler';
import { EventBus } from './EventBus';
import { SyncOrchestrator } from './SyncOrchestrator';
import { ConfigStore } from '../storage/ConfigStore';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { AppState, ExtensionMessage } from '../types';

interface Deps {
  orchestrator: SyncOrchestrator;
  auth: AuthHandler;
  eventBus: EventBus;
}

export class MessageRouter {
  constructor(private readonly deps: Deps) {}

  register(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      return this.handle(message as ExtensionMessage, sendResponse);
    });
  }

  handle(message: ExtensionMessage, sendResponse: (response?: unknown) => void): boolean {
    switch (message.type) {
      case 'QUESTION_COMPLETED':
        void this.deps.orchestrator.handleCapture(message.payload);
        return true;
      case 'AUTH_START':
        void this.deps.auth.startAuth();
        return true;
      case 'AUTH_REVOKE':
        void this.deps.auth.revokeAuth();
        return true;
      case 'GET_STATE':
        void this.buildAppState().then(sendResponse);
        return true;
      default:
        return false;
    }
  }

  private async buildAppState(): Promise<AppState> {
    const token = await ExtensionStorage.get<string>('token');
    const user = await ExtensionStorage.get<{ username: string; avatarUrl: string }>('user');
    const config = await ConfigStore.get();
    const lastSync = await ExtensionStorage.getLastSync();

    return {
      syncState: this.deps.orchestrator.getState(),
      auth: {
        connected: !!token,
        tokenExpired: false,
        username: user?.username,
        avatarUrl: user?.avatarUrl,
      },
      config,
      lastSync,
    };
  }
}