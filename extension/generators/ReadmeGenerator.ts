import { MarkdownBuilder } from './MarkdownBuilder';
import type { QuestionSnapshot } from '../types';

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

const FORMAT_LOGO: Record<string, string> = {
  javascript: '&logo=javascript&logoColor=black',
  typescript: '&logo=typescript&logoColor=white',
  react: '&logo=react&logoColor=white',
  vue: '&logo=vuedotjs&logoColor=white',
  angular: '&logo=angular&logoColor=white',
  svelte: '&logo=svelte&logoColor=white',
  css: '&logo=css3&logoColor=white',
  html: '&logo=html5&logoColor=white',
};

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '22c55e',
  medium: 'f59e0b',
  hard: 'ef4444',
};

const FORMAT_COLOR: Record<string, string> = {
  javascript: 'f7df1e',
  typescript: '3178c6',
  react: '61dafb',
  vue: '42b883',
  angular: 'dd0031',
  svelte: 'ff3e00',
  css: '264de4',
  html: 'e34c26',
  'ui-coding': '6366f1',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class ReadmeGenerator {
  generate(snapshot: QuestionSnapshot): string {
    const builder = new MarkdownBuilder();
    const meta = snapshot.metadata;

    const formatDisplay = FORMAT_DISPLAY[meta.format] ?? capitalize(meta.format);
    const difficultyDisplay = capitalize(meta.difficulty);
    const difficultyColor = DIFFICULTY_COLOR[meta.difficulty.toLowerCase()] ?? '6b7280';
    const formatColor = FORMAT_COLOR[meta.format] ?? '6b7280';
    const formatLogo = FORMAT_LOGO[meta.format] ?? '';

    // ── Header ───────────────────────────────────────────────
    const badges: Parameters<MarkdownBuilder['shieldBadges']>[0] = [
      { alt: difficultyDisplay, label: 'Difficulty', message: difficultyDisplay, color: difficultyColor },
      { alt: formatDisplay, label: 'Format', message: formatDisplay, color: formatColor, extra: formatLogo },
    ];
    if (meta.duration > 0) {
      badges.push({ alt: 'Duration', label: 'Duration', message: `${meta.duration} min`, color: '6b7280' });
    }

    builder.heading(1, meta.title).shieldBadges(badges);

    // ── Description ──────────────────────────────────────────
    if (meta.description) {
      builder.heading(2, '📝 Description').paragraph(meta.description);
    }

    // ── Companies ────────────────────────────────────────────
    if (meta.companies.length > 0) {
      builder.heading(2, '🏢 Asked At').list(meta.companies);
    }

    // ── Languages ────────────────────────────────────────────
    if (meta.languages.length > 0) {
      builder.heading(2, '💻 Languages').list(meta.languages);
    }

    // ── Source link ──────────────────────────────────────────
    builder
      .heading(2, '🔗 Source')
      .paragraph(new MarkdownBuilder().link('View on GreatFrontend →', meta.url));

    // ── Project structure ────────────────────────────────────
    builder
      .heading(2, '📁 Project Structure')
      .codeBlock('', snapshot.files.map((f) => f.path).join('\n'));

    // ── Footer ───────────────────────────────────────────────
    builder
      .hr()
      .paragraph(
        `_Synced: ${snapshot.completedAt.slice(0, 10)} · ` +
          `[GFE Sync](https://github.com/kkishlayofficial/gfe-extension) v${snapshot.extensionVersion}_`,
      );

    return builder.build();
  }
}

