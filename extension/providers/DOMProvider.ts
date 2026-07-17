import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

function parseDuration(rawDuration: string): number {
  const match = rawDuration.match(/(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins|h|m)\b/i);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit.startsWith('h') ? value * 60 : value;
}

export class DOMProvider implements IMetadataProvider {
  canHandle(raw: RawMetadata): boolean {
    return !!raw.domSnapshot;
  }

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const snapshot = raw.domSnapshot;
    if (!snapshot) {
      throw new MetadataUnavailableError('No DOM snapshot available');
    }

    const match = snapshot.url.match(/\/questions\/([^/]+)\/([^/?#]+)/);
    if (!match) {
      throw new MetadataUnavailableError(`URL is not a GFE question: ${snapshot.url}`);
    }

    return {
      title: snapshot.title,
      slug: match[2],
      difficulty: snapshot.difficulty.toLowerCase(),
      format: match[1],
      duration: parseDuration(snapshot.duration),
      description: snapshot.description,
      url: snapshot.url,
      languages: [],
      companies: [],
    };
  }
}