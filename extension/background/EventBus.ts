import type { ExtensionEvent } from '../types';

type EventType = ExtensionEvent['type'];
type Handler<T extends EventType> = (
  event: Extract<ExtensionEvent, { type: T }>,
) => void | Promise<void>;

const BRIDGED_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'STATE_CHANGED',
  'SYNC_COMPLETED',
  'SYNC_FAILED',
  'SYNC_SKIPPED',
  'AUTH_COMPLETE',
  'AUTH_FAILED',
  'TOKEN_EXPIRED',
]);

export class EventBus {
  private handlers = new Map<EventType, Set<(event: ExtensionEvent) => void | Promise<void>>>();

  async emit(event: ExtensionEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);

    if (handlers) {
      for (const handler of handlers) {
        await handler(event);
      }
    }

    if (BRIDGED_TYPES.has(event.type)) {
      try {
        chrome.runtime.sendMessage(event);
      } catch {
        // Popup not open, so this bridge is optional.
      }
    }
  }

  on<T extends EventType>(type: T, handler: Handler<T>): void {
    const handlers =
      this.handlers.get(type) ?? new Set<(event: ExtensionEvent) => void | Promise<void>>();
    handlers.add(handler as (event: ExtensionEvent) => void | Promise<void>);
    this.handlers.set(type, handlers);
  }

  off<T extends EventType>(type: T, handler: Handler<T>): void {
    this.handlers.get(type)?.delete(handler as (event: ExtensionEvent) => void | Promise<void>);
  }
}
