import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

type CompanyEntry = string | { name?: string; slug?: string };

interface QuestionShape {
  title: string;
  slug: string;
  difficulty: string;
  format?: string;
  duration?: number;
  description?: string;
  languages?: string[];
  // GFE returns companies as plain strings or objects with a name field
  companies?: CompanyEntry[];
  metadata?: { url?: string };
  url?: string;
  href?: string; // relative path like /questions/javascript/slug
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
  return match ? match[1]! : null;
}

export class RSCProvider implements IMetadataProvider {
  canHandle(raw: RawMetadata): boolean {
    return Array.isArray(raw.__next_f) && raw.__next_f.length > 0;
  }

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const entries = raw.__next_f ?? [];
    const pageUrl = raw.domSnapshot?.url ?? '';

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2 || entry[0] !== 1) {
        continue;
      }

      const jsonString = entry[1];
      if (typeof jsonString !== 'string') {
        continue;
      }

      // Try the string as-is first (test fixtures use plain JSON).
      // Real GFE RSC data uses "hexId:payload" format — strip the id prefix.
      const candidates: string[] = [jsonString];
      const colonIdx = jsonString.indexOf(':');
      if (colonIdx !== -1 && colonIdx <= 4) {
        const payload = jsonString.slice(colonIdx + 1);
        // Skip binary/text chunks (T prefix) and module references (I prefix)
        if (!payload.startsWith('T') && !payload.startsWith('I')) {
          candidates.push(payload);
        }
      }

      let parsed: unknown;
      let found = false;
      for (const candidate of candidates) {
        try {
          parsed = JSON.parse(candidate);
          found = true;
          break;
        } catch {
          continue;
        }
      }
      if (!found) continue;

      const question = findQuestion(parsed);
      if (question) {
        return this.normalize(question, pageUrl);
      }
    }

    throw new MetadataUnavailableError('RSC payload did not contain question metadata');
  }

  private normalize(question: QuestionShape, pageUrl = ''): QuestionMetadata {
    // Prefer explicit URL, fall back to href (relative → absolute), then page URL
    const rawUrl =
      question.metadata?.url ??
      question.url ??
      (question.href ? `https://www.greatfrontend.com${question.href}` : undefined) ??
      pageUrl;
    const url = rawUrl.startsWith('http') ? rawUrl : (rawUrl ? `https://www.greatfrontend.com${rawUrl}` : '');
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
      companies: (question.companies ?? []).flatMap((c) =>
        typeof c === 'string' ? [c] : c.name ? [c.name] : [],
      ),
    };
  }
}
