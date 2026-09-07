import {
  serializeDocumentMetadata,
  serializeDocumentVersion,
} from '../document/document-api.mapper.js';
import type { GenerationExecutionResult } from './generation-service.js';

export function serializeGenerationResult(result: GenerationExecutionResult) {
  return {
    document: serializeDocumentMetadata(result.document),
    currentVersion: serializeDocumentVersion(result.currentVersion),
    warnings: [...result.warnings],
  };
}
