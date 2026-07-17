import { MonacoUnavailableError, WorkspaceFile } from '../types';

interface MonacoModel {
  uri: { path: string };
  getValue(): string;
  getLanguageId(): string;
}

interface MonacoAccessor {
  editor?: { getModels(): MonacoModel[] };
}

declare global {
  interface Window {
    monaco?: MonacoAccessor;
  }
}

export class MonacoExtractor {
  extract(): WorkspaceFile[] {
    const monaco = window.monaco;
    if (!monaco?.editor) {
      throw new MonacoUnavailableError();
    }

    return monaco.editor
      .getModels()
      .map<WorkspaceFile>((model) => ({
        path: model.uri.path.replace(/^\//, ''),
        content: model.getValue(),
        language: model.getLanguageId(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
