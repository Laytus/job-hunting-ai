import type { LlmWebSource } from '../llm/llm.types.js';
import { ResearchValidationError } from './research.errors.js';
import type { ResearchOutput } from './research.schema.js';
import {
  buildResearchProviderProvenanceSet,
  normalizeResearchUrl,
} from './research-source-normalizer.js';
import { RESEARCH_MAX_SOURCES } from './research.types.js';

export interface VerifiedResearchProjectionCounts {
  readonly rawSources: number;
  readonly verifiedSources: number;
  readonly droppedSources: number;
  readonly rawClaims: number;
  readonly retainedClaims: number;
  readonly droppedClaims: number;
  readonly rawRelationships: number;
  readonly retainedRelationships: number;
}

export interface VerifiedResearchProjection {
  readonly output: ResearchOutput;
  readonly counts: VerifiedResearchProjectionCounts;
}

export function projectVerifiedResearchSubgraph(
  output: ResearchOutput,
  providerWebSources: readonly LlmWebSource[],
): VerifiedResearchProjection {
  if (output.sources.length > RESEARCH_MAX_SOURCES) {
    throw new ResearchValidationError(
      'RESEARCH_SOURCE_LIMIT_EXCEEDED',
      'TOO_MANY_SOURCES',
    );
  }

  const providerUrls = buildResearchProviderProvenanceSet(providerWebSources);
  const verifiedSources = output.sources.filter((source) =>
    providerUrls.has(normalizeResearchUrl(source.url)),
  );
  const verifiedSourceIds = new Set(
    verifiedSources.map((source) => source.id.trim()),
  );

  const retainedClaims = output.claims.flatMap((claim) => {
    const sourceLinks = claim.sourceLinks.filter((link) =>
      verifiedSourceIds.has(link.sourceId.trim()),
    );
    if (!sourceLinks.some(({ relationship }) => relationship === 'SUPPORTS')) {
      return [];
    }

    return [{ ...claim, sourceLinks }];
  });
  const referencedSourceIds = new Set(
    retainedClaims.flatMap((claim) =>
      claim.sourceLinks.map((link) => link.sourceId.trim()),
    ),
  );
  const referencedVerifiedSources = verifiedSources.filter((source) =>
    referencedSourceIds.has(source.id.trim()),
  );
  const rawRelationships = output.claims.reduce(
    (total, claim) => total + claim.sourceLinks.length,
    0,
  );
  const retainedRelationships = retainedClaims.reduce(
    (total, claim) => total + claim.sourceLinks.length,
    0,
  );

  return {
    output: {
      ...output,
      sources: referencedVerifiedSources,
      claims: retainedClaims,
    },
    counts: {
      rawSources: output.sources.length,
      verifiedSources: referencedVerifiedSources.length,
      droppedSources: output.sources.length - referencedVerifiedSources.length,
      rawClaims: output.claims.length,
      retainedClaims: retainedClaims.length,
      droppedClaims: output.claims.length - retainedClaims.length,
      rawRelationships,
      retainedRelationships,
    },
  };
}
