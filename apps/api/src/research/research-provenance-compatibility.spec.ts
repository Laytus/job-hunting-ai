import { describe, expect, it, vi } from 'vitest';
import {
  OpenAiLlmProvider,
  type OpenAiResponsesClient,
} from '../llm/openai-llm-provider.js';
import { ResearchValidationError } from './research.errors.js';
import { ResearchGraphValidator } from './research-graph-validator.js';
import {
  researchOutputSchema,
  type ResearchOutput,
} from './research.schema.js';

const config = {
  defaultModel: 'gpt-5.6-terra',
  timeoutMs: 90_000,
} as const;
const researchDate = new Date('2026-09-01T12:00:00.000Z');

function output(url: string): ResearchOutput {
  return {
    summaryMarkdown: 'Provider-grounded result.',
    sources: [
      {
        id: 'source-1',
        url,
        title: 'Quantitative research report',
        publisher: 'Example',
        sourceType: 'NEWS',
        sourceQuality: 'HIGH',
        publishedAt: '2026-08-01',
      },
    ],
    claims: [
      {
        id: 'claim-1',
        type: 'ROLE_INFORMATION',
        valueText: 'The role combines quantitative research and engineering.',
        valueJson: null,
        evidenceType: 'FACT',
        sourceLinks: [
          {
            sourceId: 'source-1',
            relationship: 'SUPPORTS',
            evidenceText: 'The report describes the role.',
          },
        ],
      },
    ],
    warnings: [],
  };
}

function client(outputItems: readonly unknown[]): OpenAiResponsesClient {
  return {
    create: vi.fn(async () => ({
      output_text: JSON.stringify(
        output('https://example.com/research/quant?utm_source=model#claim'),
      ),
      model: 'gpt-5.6-terra',
      output: outputItems,
    })),
  };
}

describe('Research provider provenance compatibility', () => {
  it('accepts one resource represented across Terra-compatible provenance shapes', async () => {
    const responsesClient = client([
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          sources: [
            { type: 'url', url: 'https://provider-only.example/result' },
          ],
        },
      },
      {
        type: 'web_search_call',
        action: {
          type: 'open_page',
          url: 'HTTPS://EXAMPLE.COM/research/quant?utm_medium=provider#open',
        },
      },
      {
        type: 'web_search_call',
        action: {
          type: 'find_in_page',
          pattern: 'quantitative research',
          url: 'https://example.com/research/quant?fbclid=provider#find',
        },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'Structured result.',
            annotations: [
              {
                type: 'url_citation',
                url: 'https://example.com/research/quant?gclid=provider#citation',
                title: 'Quantitative research report',
                start_index: 0,
                end_index: 18,
              },
            ],
          },
        ],
      },
    ]);
    const provider = new OpenAiLlmProvider(config, responsesClient);

    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Research the role.' }],
      tools: [{ type: 'web_search' }],
    });
    const graph = new ResearchGraphValidator().validate({
      output: researchOutputSchema.parse(JSON.parse(response.content)),
      providerWebSources: response.webSources ?? [],
      researchDate,
    });

    expect(response.webSources).toEqual([
      { url: 'https://provider-only.example/result' },
      {
        url: 'HTTPS://EXAMPLE.COM/research/quant?utm_medium=provider#open',
      },
      {
        url: 'https://example.com/research/quant?fbclid=provider#find',
      },
      {
        url: 'https://example.com/research/quant?gclid=provider#citation',
      },
    ]);
    expect(graph.sources).toHaveLength(1);
    expect(graph.sources[0]?.normalizedUrl).toBe(
      'https://example.com/research/quant',
    );
  });

  it.each([
    ['a different path on the same domain', 'https://example.com/research/other'],
    ['a source absent from provenance', 'https://unreported.example/report'],
  ])('rejects %s', async (_label, structuredUrl) => {
    const responsesClient = client([
      {
        type: 'web_search_call',
        action: {
          type: 'open_page',
          url: 'https://example.com/research/quant',
        },
      },
    ]);
    const provider = new OpenAiLlmProvider(config, responsesClient);
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Research the role.' }],
      tools: [{ type: 'web_search' }],
    });

    expect(() =>
      new ResearchGraphValidator().validate({
        output: output(structuredUrl),
        providerWebSources: response.webSources ?? [],
        researchDate,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResearchValidationError>>({
        code: 'UNVERIFIED_RESEARCH_SOURCE',
        reason: 'SOURCE_NOT_REPORTED_BY_PROVIDER',
      }),
    );
  });
});
