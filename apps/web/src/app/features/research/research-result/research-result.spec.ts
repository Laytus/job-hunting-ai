import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ResearchClaim,
  ResearchDetail,
  ResearchSource,
} from '../research.models';
import { ResearchResult } from './research-result';

const applicationId = '10000000-0000-4000-8000-000000000000';
const researchId = '20000000-0000-4000-8000-000000000000';
const sourceId = '30000000-0000-4000-8000-000000000000';
const contradictingSourceId = '40000000-0000-4000-8000-000000000000';

const source: ResearchSource = {
  id: sourceId,
  url: 'https://example.com/research/platform-engineer',
  title: 'Platform engineering overview',
  publisher: 'Example Company',
  sourceType: 'OFFICIAL',
  sourceQuality: 'HIGH',
  publishedAt: '2026-08-20',
  retrievedAt: '2026-08-26T10:00:01.000Z',
  notes: null,
  createdAt: '2026-08-26T10:00:02.000Z',
};

const contradictingSource: ResearchSource = {
  ...source,
  id: contradictingSourceId,
  url: 'https://reports.example/interview',
  title: null,
  publisher: null,
  sourceType: 'INTERVIEW_REPORT',
  sourceQuality: 'MEDIUM',
  publishedAt: null,
};

function claim(overrides: Partial<ResearchClaim>): ResearchClaim {
  return {
    id: '50000000-0000-4000-8000-000000000000',
    type: 'COMPANY_DESCRIPTION',
    valueText: 'Builds reliable developer platforms.',
    valueJson: null,
    confidence: 'HIGH',
    evidenceType: 'FACT',
    notes: null,
    createdAt: '2026-08-26T10:00:02.000Z',
    ...overrides,
  };
}

const companyClaim = claim({});
const compensationClaim = claim({
  id: '60000000-0000-4000-8000-000000000000',
  type: 'SALARY_BASE',
  valueText: 'Reported base salary range.',
  confidence: 'MEDIUM',
  evidenceType: 'REPORTED',
  valueJson: {
    amount: 125000,
    amountMin: null,
    amountMax: null,
    currency: 'USD',
    period: 'YEAR',
    role: 'Platform Engineer',
    location: 'Paris',
    seniority: 'Senior',
    dataYear: 2026,
    stageOrder: null,
    frequency: null,
  },
});
const interviewClaim = claim({
  id: '70000000-0000-4000-8000-000000000000',
  type: 'INTERVIEW_STAGE',
  valueText: null,
  confidence: 'LOW',
  evidenceType: 'INFERRED',
  valueJson: {
    amount: null,
    amountMin: null,
    amountMax: null,
    currency: null,
    period: null,
    role: null,
    location: null,
    seniority: null,
    dataYear: null,
    stageOrder: 2,
    frequency: 'MULTIPLE_REPORTS',
  },
});
const technologyClaim = claim({
  id: '80000000-0000-4000-8000-000000000000',
  type: 'TECHNOLOGY',
  valueText: 'Uses TypeScript.',
});

const completed: ResearchDetail = {
  id: researchId,
  applicationId,
  status: 'COMPLETED',
  promptVersion: 'research-v1',
  researchDate: '2026-08-26T10:00:00.000Z',
  failureCode: null,
  failureMessage: null,
  startedAt: '2026-08-26T10:00:00.000Z',
  completedAt: '2026-08-26T10:00:02.000Z',
  failedAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:02.000Z',
  summaryMarkdown: 'Evidence-based overview.',
  warnings: [
    'NO_RELIABLE_COMPENSATION_DATA',
    'CONFLICTING_SALARY_DATA',
    'OUTDATED_INTERVIEW_REPORTS',
    'INSUFFICIENT_ROLE_SPECIFIC_DATA',
    'AMBIGUOUS_COMPANY_MATCH',
    'LOW_SOURCE_QUALITY',
    'OTHER',
  ],
  sources: [source, contradictingSource],
  claims: [companyClaim, compensationClaim, interviewClaim, technologyClaim],
  relationships: [
    {
      claimId: companyClaim.id,
      sourceId,
      relationship: 'SUPPORTS',
      evidenceText: 'The official company page describes the platform.',
    },
    {
      claimId: companyClaim.id,
      sourceId: contradictingSourceId,
      relationship: 'CONTRADICTS',
      evidenceText: 'A report describes a narrower product area.',
    },
  ],
};

async function render(
  research: ResearchDetail,
): Promise<ComponentFixture<ResearchResult>> {
  await TestBed.configureTestingModule({ imports: [ResearchResult] }).compileComponents();
  const fixture = TestBed.createComponent(ResearchResult);
  fixture.componentRef.setInput('research', research);
  fixture.detectChanges();
  return fixture;
}

describe('ResearchResult', () => {
  it('renders the summary, warning labels, claim groups, confidence, and evidence types', async () => {
    const fixture = await render(completed);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Evidence-based overview.');
    expect(text).toContain('No reliable compensation data found.');
    expect(text).toContain('Conflicting compensation information was found.');
    expect(text).toContain('Interview information may be outdated.');
    expect(text).toContain('Limited role-specific public information was found.');
    expect(text).toContain('The company identity could not be fully disambiguated.');
    expect(text).toContain('Some findings rely on lower-quality sources.');
    expect(text).toContain('Other research limitations were identified.');
    expect(text).toContain('Company & role');
    expect(text).toContain('Compensation');
    expect(text).toContain('Interview process');
    expect(text).toContain('Technology & culture');
    expect(text).toContain('High confidence');
    expect(text).toContain('Medium confidence');
    expect(text).toContain('Low confidence');
    expect(text).toContain('Verified fact');
    expect(text).toContain('Reported information');
    expect(text).toContain('Inferred');
  });

  it('renders a v2 summary as semantic Markdown without visible syntax tokens', async () => {
    const fixture = await render({
      ...completed,
      promptVersion: 'research-v2',
      summaryMarkdown:
        '## Research findings\n\n- **COMPANY DESCRIPTION:** Example company.\n- **ROLE INFORMATION:** Example role.',
    });
    const summary = fixture.nativeElement.querySelector(
      '.summary-markdown',
    ) as HTMLElement;

    expect(summary.querySelector('h2')?.textContent).toBe('Research findings');
    expect(summary.querySelectorAll('li')).toHaveLength(2);
    expect(summary.querySelectorAll('strong')).toHaveLength(2);
    expect(summary.textContent).toContain('COMPANY DESCRIPTION:');
    expect(summary.textContent).toContain('ROLE INFORMATION:');
    expect(summary.textContent).not.toContain('##');
    expect(summary.textContent).not.toContain('**');
  });

  it('renders a historical v1 plain-text summary without a version-specific path', async () => {
    const fixture = await render({
      ...completed,
      promptVersion: 'research-v1',
      summaryMarkdown: 'Historical plain-text Research summary.',
    });

    expect(
      fixture.nativeElement.querySelector('.summary-markdown p')?.textContent,
    ).toBe('Historical plain-text Research summary.');
  });

  it('keeps embedded HTML in a Research summary inert', async () => {
    const fixture = await render({
      ...completed,
      promptVersion: 'research-v2',
      summaryMarkdown: "Safe summary.\n\n<script>alert('unsafe')</script>",
    });
    const summary = fixture.nativeElement.querySelector(
      '.summary-markdown',
    ) as HTMLElement;

    expect(summary.querySelector('script')).toBeNull();
    expect(summary.textContent).toContain("<script>alert('unsafe')</script>");
  });

  it('renders compensation and interview structure without conversion or inference', async () => {
    const fixture = await render(completed);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('125,000 USD');
    expect(text).toContain('Per year');
    expect(text).toContain('Platform Engineer');
    expect(text).toContain('Paris');
    expect(text).toContain('Senior');
    expect(text).toContain('2026');
    expect(text).toContain('Stage 2');
    expect(text).toContain('Multiple reports');
    expect(text).toContain('do not guarantee a future process');
  });

  it('renders a v2 compensation range and remains compatible with a v1 exact amount', async () => {
    const rangeClaim = claim({
      id: '61000000-0000-4000-8000-000000000000',
      type: 'TOTAL_COMPENSATION',
      valueText: null,
      valueJson: {
        amount: null,
        amountMin: 140_000,
        amountMax: 175_000,
        currency: 'EUR',
        period: 'YEAR',
        role: 'Platform Engineer',
        location: 'Paris',
        seniority: 'Senior',
        dataYear: 2026,
        stageOrder: null,
        frequency: null,
      },
    });
    const legacyExactClaim = claim({
      id: '62000000-0000-4000-8000-000000000000',
      type: 'SALARY_BASE',
      valueText: null,
      valueJson: {
        amount: 95_000,
        currency: 'EUR',
        period: 'YEAR',
        role: null,
        location: null,
        seniority: null,
        dataYear: 2025,
        stageOrder: null,
        frequency: null,
      },
    });
    const fixture = await render({
      ...completed,
      promptVersion: 'research-v2',
      claims: [rangeClaim, legacyExactClaim],
      relationships: [],
    });
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('140,000–175,000 EUR');
    expect(text).toContain('95,000 EUR');
    expect(text).not.toContain('USD');
  });

  it('separates supports and contradictions and uses safe backend source links', async () => {
    const fixture = await render(completed);
    const text = fixture.nativeElement.textContent as string;
    const evidenceLinks = Array.from(
      fixture.nativeElement.querySelectorAll('.evidence-list a') as NodeListOf<HTMLAnchorElement>,
    );

    expect(text).toContain('Supporting evidence');
    expect(text).toContain('The official company page describes the platform.');
    expect(text).toContain('Contradicting evidence');
    expect(text).toContain('A report describes a narrower product area.');
    expect(evidenceLinks.map((link) => link.href)).toEqual([
      source.url,
      contradictingSource.url,
    ]);
    for (const link of evidenceLinks) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    }
  });

  it('renders persisted sources once in a consolidated section with null metadata hidden', async () => {
    const fixture = await render(completed);
    const sourceCards = fixture.nativeElement.querySelectorAll('.source-card') as NodeListOf<HTMLElement>;
    const sourceLinks = fixture.nativeElement.querySelectorAll('.source-link') as NodeListOf<HTMLAnchorElement>;
    const text = fixture.nativeElement.textContent as string;

    expect(sourceCards).toHaveLength(2);
    expect(sourceLinks).toHaveLength(2);
    expect(text).toContain('Official source');
    expect(text).toContain('Interview report');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('keeps evidence text visible when its source reference is unexpectedly absent', async () => {
    const missingSource = {
      ...completed,
      sources: [],
    } satisfies ResearchDetail;
    const fixture = await render(missingSource);

    expect(fixture.nativeElement.textContent).toContain(
      'The official company page describes the platform.',
    );
    expect(fixture.nativeElement.querySelector('.evidence-list a')).toBeNull();
  });

  it('renders a sparse COMPLETED Research as a successful limited result', async () => {
    const fixture = await render({
      ...completed,
      promptVersion: 'research-v2',
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      warnings: [
        'NO_RELIABLE_COMPENSATION_DATA',
        'INSUFFICIENT_ROLE_SPECIFIC_DATA',
      ],
      sources: [],
      claims: [],
      relationships: [],
    });
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Research result');
    expect(text).toContain(
      'No reliable external Research findings were available for this opportunity.',
    );
    expect(text).toContain('No reliable compensation data found.');
    expect(fixture.nativeElement.querySelector('.claim-group')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sources-section')).toBeNull();
  });

  it.each([
    [
      'FAILED' as const,
      'Research failed',
      'The Research provider could not complete.',
    ],
    ['RUNNING' as const, 'Research is running', 'Research is running.'],
  ])('renders %s Research safely without graph sections', async (status, heading, message) => {
    const research: ResearchDetail = {
      ...completed,
      status,
      summaryMarkdown: null,
      sources: [],
      claims: [],
      relationships: [],
      failureCode: status === 'FAILED' ? 'LLM_PROVIDER_FAILED' : null,
      failureMessage:
        status === 'FAILED' ? 'The Research provider could not complete.' : null,
      completedAt: null,
      failedAt: status === 'FAILED' ? '2026-08-26T10:00:03.000Z' : null,
    };
    const fixture = await render(research);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(heading);
    expect(text).toContain(message);
    expect(fixture.nativeElement.querySelector('.claim-group')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sources-section')).toBeNull();
  });
});
