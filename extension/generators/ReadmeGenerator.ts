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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class ReadmeGenerator {
  generate(snapshot: QuestionSnapshot): string {
    const builder = new MarkdownBuilder();
    const metadata = snapshot.metadata;

    const formatDisplay = FORMAT_DISPLAY[metadata.format] ?? capitalize(metadata.format);
    const difficultyDisplay = capitalize(metadata.difficulty);

    builder
      .heading(1, metadata.title)
      .badge('Difficulty', difficultyDisplay)
      .badge('Format', formatDisplay);

    if (metadata.duration > 0) {
      builder.badge('Duration', `${metadata.duration} minutes`);
    }

    if (metadata.languages.length > 0) {
      builder.heading(2, 'Languages').list(metadata.languages);
    }

    if (metadata.companies.length > 0) {
      builder.heading(2, 'Asked At').list(metadata.companies);
    }

    builder
      .heading(2, 'Source')
      .paragraph(new MarkdownBuilder().link('View on GreatFrontend', metadata.url));

    if (metadata.description) {
      builder.heading(2, 'Description').paragraph(metadata.description);
    }

    builder.heading(2, 'Project Structure').list(snapshot.files.map((file) => file.path));
    builder
      .hr()
      .paragraph(`_Synced at ${snapshot.completedAt} · extension v${snapshot.extensionVersion}_`);

    return builder.build();
  }
}
