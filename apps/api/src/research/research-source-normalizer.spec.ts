import { describe, expect, it } from 'vitest';
import { ResearchValidationError } from './research.errors.js';
import {
  deriveResearchSourceIndependenceGroup,
  normalizeResearchPublisher,
  normalizeResearchUrl,
} from './research-source-normalizer.js';

describe('normalizeResearchUrl', () => {
  it('normalizes scheme, host, default port, fragment, empty path, and trailing slash', () => {
    expect(normalizeResearchUrl(' HTTP://EXAMPLE.COM:80#section ')).toBe(
      'http://example.com/',
    );
    expect(
      normalizeResearchUrl('https://EXAMPLE.COM:443/reports/2026/#salary'),
    ).toBe('https://example.com/reports/2026');
  });

  it('removes only the conservative tracking-parameter allowlist', () => {
    expect(
      normalizeResearchUrl(
        'https://example.com/jobs/?utm_source=newsletter&utm_medium=email&utm_campaign=fall&utm_term=engineer&utm_content=hero&gclid=google&fbclid=facebook&role=backend&level=staff',
      ),
    ).toBe('https://example.com/jobs?role=backend&level=staff');
  });

  it('removes tracking parameters case-insensitively and preserves meaningful duplicates and order', () => {
    expect(
      normalizeResearchUrl(
        'https://example.com/search?role=backend&UTM_Source=x&role=platform',
      ),
    ).toBe('https://example.com/search?role=backend&role=platform');
  });

  it.each(['', '   ', '/relative/path', 'not a url', 'mailto:test@example.com', 'ftp://example.com/file'])(
    'rejects invalid or non-http(s) URL %j',
    (url) => {
      expect(() => normalizeResearchUrl(url)).toThrowError(
        expect.objectContaining<Partial<ResearchValidationError>>({
          code: 'INVALID_RESEARCH_SOURCE',
          reason: 'INVALID_URL',
        }),
      );
    },
  );
});

describe('Research source independence', () => {
  it('normalizes publisher case and repeated whitespace', () => {
    expect(normalizeResearchPublisher('  Glassdoor   Europe  ')).toBe(
      'glassdoor europe',
    );
    expect(
      deriveResearchSourceIndependenceGroup(
        '  Glassdoor   Europe  ',
        'https://one.example/a',
      ),
    ).toBe('glassdoor europe');
  });

  it('falls back to normalized hostname when publisher is absent', () => {
    expect(
      deriveResearchSourceIndependenceGroup(
        null,
        'https://company.example/careers',
      ),
    ).toBe('company.example');
  });

  it('groups equal publishers or hostnames and separates different publishers', () => {
    const publisherA = deriveResearchSourceIndependenceGroup(
      'Publisher A',
      'https://first.example/a',
    );
    const publisherASecondPage = deriveResearchSourceIndependenceGroup(
      'publisher a',
      'https://second.example/b',
    );
    const publisherB = deriveResearchSourceIndependenceGroup(
      'Publisher B',
      'https://first.example/c',
    );
    const hostA = deriveResearchSourceIndependenceGroup(
      null,
      'https://same.example/a',
    );
    const hostASecondPage = deriveResearchSourceIndependenceGroup(
      null,
      'https://same.example/b',
    );

    expect(publisherA).toBe(publisherASecondPage);
    expect(publisherA).not.toBe(publisherB);
    expect(hostA).toBe(hostASecondPage);
  });
});
