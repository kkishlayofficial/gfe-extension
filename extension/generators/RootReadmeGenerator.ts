import { MarkdownBuilder } from './MarkdownBuilder';
import type { RepoIndex, SyncConfig } from '../types';

export class RootReadmeGenerator {
  generate(index: RepoIndex, layout: SyncConfig['folderLayout']): string {
    const builder = new MarkdownBuilder();
    const entries = Object.entries(index.solutions);
    const grouped = new Map<string, typeof entries>();

    builder
      .heading(1, 'GreatFrontend Solutions')
      .paragraph('Auto-synced by the GreatFrontend Sync Chrome Extension.')
      .badge('Total solutions', String(entries.length))
      .hr();

    for (const [slug, entry] of entries) {
      const categoryEntries = grouped.get(entry.category) ?? [];
      categoryEntries.push([slug, entry]);
      grouped.set(entry.category, categoryEntries);
    }

    for (const [category, items] of [...grouped.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const rows = items
        .sort((left, right) => left[1].title.localeCompare(right[1].title))
        .map(([slug, entry]) => {
          const path = layout === 'categorized' ? `${category}/${slug}` : slug;

          return [
            new MarkdownBuilder().link(entry.title, path),
            entry.syncedAt.slice(0, 10),
            entry.commitSha.slice(0, 7),
          ];
        });

      builder.heading(2, category).table(['Solution', 'Synced', 'Commit'], rows);
    }

    return builder.build();
  }
}
