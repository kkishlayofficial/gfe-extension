import { SyncConfig, SyncConfigSchema } from '../types';
import { ExtensionStorage } from './ExtensionStorage';

const KEY = 'config';

export class ConfigStore {
  static async get(): Promise<SyncConfig> {
    const raw = (await ExtensionStorage.get<Partial<SyncConfig>>(KEY)) ?? {};
    return SyncConfigSchema.parse(raw);
  }

  static async set(partial: Partial<SyncConfig>): Promise<void> {
    const current = await ConfigStore.get();
    const merged = SyncConfigSchema.parse({ ...current, ...partial });
    await ExtensionStorage.set(KEY, merged);
  }
}