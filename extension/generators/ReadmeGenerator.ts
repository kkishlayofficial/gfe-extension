import { MarkdownBuilder } from './MarkdownBuilder';
import type { QuestionSnapshot } from '../types';

export class ReadmeGenerator {
  generate(snapshot: QuestionSnapshot): string {
    const builder = new MarkdownBuilder();
    const metadata = snapshot.metadata;

    builder
      .heading(1, metadata.title)
      .badge('Difficulty', metadata.difficulty)
      .badge('Format', metadata.format)
      .badge('Duration', `${metadata.duration} minutes`);

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
    builder.hr().paragraph(`_Synced at ${snapshot.completedAt} · extension v${snapshot.extensionVersion}_`);

    return builder.build();
  }
}