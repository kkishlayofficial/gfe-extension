import { METADATA_SCHEMA_VERSION, type QuestionSnapshot } from '../types';

export class MetadataFileGenerator {
  generate(snapshot: QuestionSnapshot): string {
    return JSON.stringify(
      {
        schemaVersion: METADATA_SCHEMA_VERSION,
        ...snapshot.metadata,
        hash: snapshot.hash,
        completedAt: snapshot.completedAt,
        extensionVersion: snapshot.extensionVersion,
        snapshotVersion: snapshot.snapshotVersion,
      },
      null,
      2,
    );
  }
}
