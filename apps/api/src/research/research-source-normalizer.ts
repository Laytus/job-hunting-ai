import { ResearchValidationError } from './research.errors.js';

const removableTrackingParameters = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

export function normalizeResearchUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  let url: URL;

  try {
    url = new URL(trimmedUrl);
  } catch {
    throw new ResearchValidationError(
      'INVALID_RESEARCH_SOURCE',
      'INVALID_URL',
    );
  }

  if (
    trimmedUrl.length === 0 ||
    (url.protocol !== 'http:' && url.protocol !== 'https:')
  ) {
    throw new ResearchValidationError(
      'INVALID_RESEARCH_SOURCE',
      'INVALID_URL',
    );
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/u, '');
  }

  const removableKeys = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (removableTrackingParameters.has(key.toLowerCase())) {
      removableKeys.add(key);
    }
  }
  for (const key of removableKeys) {
    url.searchParams.delete(key);
  }

  return url.toString();
}

export function buildResearchProviderProvenanceSet(
  providerSources: readonly { readonly url: string }[],
): ReadonlySet<string> {
  const providerUrls = new Set<string>();

  for (const { url } of providerSources) {
    try {
      providerUrls.add(normalizeResearchUrl(url));
    } catch (error) {
      if (
        error instanceof ResearchValidationError &&
        error.code === 'INVALID_RESEARCH_SOURCE' &&
        error.reason === 'INVALID_URL'
      ) {
        continue;
      }
      throw error;
    }
  }

  return providerUrls;
}

export function normalizeOptionalResearchText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function normalizeResearchPublisher(publisher: string): string {
  return publisher.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function deriveResearchSourceIndependenceGroup(
  publisher: string | null,
  normalizedUrl: string,
): string {
  const normalizedPublisher =
    publisher === null ? '' : normalizeResearchPublisher(publisher);

  return normalizedPublisher.length > 0
    ? normalizedPublisher
    : new URL(normalizedUrl).hostname.toLowerCase();
}
