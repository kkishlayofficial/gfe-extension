const PREFIX = 'gfe.';

interface LastSync {
  slug: string;
  title: string;
  commitSha: string;
  syncedAt: string;
}

export class ExtensionStorage {
  static async get<T>(key: string): Promise<T | undefined> {
    const full = PREFIX + key;
    return new Promise<T | undefined>((resolve) => {
      chrome.storage.local.get(full, (result) => {
        resolve(result[full] as T | undefined);
      });
    });
  }

  static async set<T>(key: string, value: T): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [PREFIX + key]: value }, () => resolve());
    });
  }

  static async delete(key: string): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove(PREFIX + key, () => resolve());
    });
  }

  static async setLastSync(data: LastSync): Promise<void> {
    await ExtensionStorage.set('lastSync', data);
  }

  static async getLastSync(): Promise<LastSync | undefined> {
    return ExtensionStorage.get<LastSync>('lastSync');
  }
}
