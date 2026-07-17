import { logger } from '../utils/Logger';
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

export class MetadataResolver {
  constructor(private readonly providers: IMetadataProvider[]) {}

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      if (!provider.canHandle(raw)) {
        continue;
      }

      try {
        return await provider.getMetadata(raw);
      } catch (err) {
        const name = provider.constructor.name;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('metadata_provider_failed', { provider: name, error: message });
        errors.push(`${name}: ${message}`);
      }
    }

    throw new MetadataUnavailableError(
      errors.length
        ? `All providers failed: ${errors.join('; ')}`
        : 'No provider could handle metadata',
    );
  }
}