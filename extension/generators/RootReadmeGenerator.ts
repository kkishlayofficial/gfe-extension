import { MarkdownBuilder } from './MarkdownBuilder';
import type { RepoIndex, SyncConfig } from '../types';

const FORMAT_DISPLAY: Record<string, string> = {
  javascript: 'JavaScript',
  'ui-coding': 'User Interface',
  css: 'CSS',
  html: 'HTML',
  react: 'React',
  vue: 'Vue',
  angular: 'Angular',
  svelte: 'Svelte',
  typescript: 'TypeScript',
};

const FORMAT_EMOJI: Record<string, string> = {
  javascript: '🟨',
  'ui-coding': '🎨',
  css: '🎨',
  html: '📄',
  react: '⚛️',
  vue: '💚',
  angular: '🔴',
  svelte: '🔥',
  typescript: '🟦',
};

const BAR_WIDTH = 20;

function progressBar(count: number, total: number): string {
  if (total === 0) return '░'.repeat(BAR_WIDTH);
  const filled = Math.round((count / total) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

export class RootReadmeGenerator {
  generate(index: RepoIndex, layout: SyncConfig['folderLayout']): string {
    const builder = new MarkdownBuilder();
    const entries = Object.entries(index.solutions);
    const total = entries.length;

    // Group by category
    const grouped = new Map<string, typeof entries>();
    let lastSynced = '';
    for (const [slug, entry] of entries) {
      const categoryEntries = grouped.get(entry.category) ?? [];
      categoryEntries.push([slug, entry]);
      grouped.set(entry.category, categoryEntries);
      if (!lastSynced || entry.syncedAt > lastSynced) lastSynced = entry.syncedAt;
    }
    const lastSyncedDate = lastSynced ? lastSynced.slice(0, 10) : 'never';
    const sortedCategories = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

    // ── Header ──────────────────────────────────────────────
    builder
      .heading(1, '🚀 GreatFrontend Solutions')
      .paragraph(
        '> Automatically synced by [GFE Sync](https://github.com/kkishlayofficial/gfe-extension) ' +
          '— a Chrome extension that captures your solutions the moment you submit them.',
      )
      .shieldBadges([
        {
          alt: 'Total solutions',
          label: 'solutions',
          message: String(total),
          color: '6366f1',
        },
        {
          alt: 'Last synced',
          label: 'last synced',
          message: lastSyncedDate,
          color: '22c55e',
        },
      ])
      .hr();

    // ── Progress overview ────────────────────────────────────
    builder.heading(2, '📊 Progress');

    const statsRows = sortedCategories.map(([category, items]) => {
      const emoji = FORMAT_EMOJI[category] ?? '📦';
      const label = FORMAT_DISPLAY[category] ?? category;
      return [
        `${emoji} **${label}**`,
        String(items.length),
        `\`${progressBar(items.length, total)}\``,
      ];
    });
    builder.table(['Category', 'Solved', 'Progress'], statsRows);

    // Mermaid pie chart (only useful with 2+ categories)
    if (sortedCategories.length > 1) {
      const pieLines = sortedCategories
        .map(([cat, items]) => `    "${FORMAT_DISPLAY[cat] ?? cat}" : ${items.length}`)
        .join('\n');
      builder.mermaid(`pie title Solutions by Category\n${pieLines}`);
    }

    builder.hr();

    // ── Per-category tables ──────────────────────────────────
    for (const [category, items] of sortedCategories) {
      const emoji = FORMAT_EMOJI[category] ?? '📦';
      const label = FORMAT_DISPLAY[category] ?? category;

      const rows = items
        .sort((a, b) => a[1].title.localeCompare(b[1].title))
        .map(([slug, entry]) => {
          const path = layout === 'categorized' ? `${category}/${slug}` : slug;
          return [
            new MarkdownBuilder().link(entry.title, path),
            entry.syncedAt.slice(0, 10),
            `\`${entry.commitSha.slice(0, 7)}\``,
          ];
        });

      builder
        .heading(2, `${emoji} ${label} · ${items.length} ${items.length === 1 ? 'solution' : 'solutions'}`)
        .table(['Solution', 'Synced', 'Commit'], rows);
    }

    // ── Footer ───────────────────────────────────────────────
    builder
      .hr()
      .paragraph(
        `_Last updated: ${lastSyncedDate} · Powered by [GFE Sync](https://github.com/kkishlayofficial/gfe-extension)_`,
      );

    return builder.build();
  }
}

