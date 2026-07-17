import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

interface QuestionShape {
  title: string;
  slug: string;
  difficulty: string;
  format?: string;
  duration?: number;
  description?: string;
  languages?: string[];
  companies?: string[];
  metadata?: { url?: string };
  url?: string;
}

function findQuestion(node: unknown): QuestionShape | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const record = node as Record<string, unknown>;

  if (
    typeof record.title === 'string' &&
    typeof record.slug === 'string' &&
    typeof record.difficulty === 'string'
  ) {
    return record as unknown as QuestionShape;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findQuestion(item);
        if (found) {
          return found;
        }
      }
      continue;
    }

    if (value && typeof value === 'object') {
      const found = findQuestion(value);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function formatFromUrl(url: string): string | null {
  const match = url.match(/\/questions\/([^/]+)\//);
  return match ? match[1] : null;
}

export class RSCProvider implements IMetadataProvider {
  canHandle(raw: RawMetadata): boolean {
    return Array.isArray(raw.__next_f) && raw.__next_f.length > 0;
  }

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const entries = raw.__next_f ?? [];

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2 || entry[0] !== 1) {
        continue;
      }

      const jsonString = entry[1];
      if (typeof jsonString !== 'string') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        continue;
      }

      const question = findQuestion(parsed);
      if (question) {
        return this.normalize(question);
      }
    }

    throw new MetadataUnavailableError('RSC payload did not contain question metadata');
  }

  private normalize(question: QuestionShape): QuestionMetadata {
    const url = question.metadata?.url ?? question.url ?? '';
    const format = question.format ?? formatFromUrl(url) ?? 'javascript';

    return {
      title: question.title,
      slug: question.slug,
      difficulty: question.difficulty.toLowerCase(),
      format,
      duration: question.duration ?? 0,
      description: question.description ?? '',
      url,
      languages: question.languages ?? [],
      companies: question.companies ?? [],
    };
  }
}