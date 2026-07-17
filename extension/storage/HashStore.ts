import { RepoIndex } from '../types';
import { ExtensionStorage } from './ExtensionStorage';

const KEY = 'hashes';

type HashMap = Record<string, string>;

export class HashStore {
  static async get(slug: string): Promise<string | undefined> {
    const all = (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
    return all[slug];
  }

  static async set(slug: string, hash: string): Promise<void> {
    const all = (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
    all[slug] = hash;
    await ExtensionStorage.set(KEY, all);
  }

  static async getAll(): Promise<HashMap> {
    return (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
  }

  static async import(index: RepoIndex): Promise<void> {
    const map: HashMap = {};
    for (const [slug, entry] of Object.entries(index.solutions)) {
      map[slug] = entry.hash;
    }
    await ExtensionStorage.set(KEY, map);
  }
}