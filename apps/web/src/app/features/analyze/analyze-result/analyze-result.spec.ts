import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { JobAnalysisDetail } from '../analyze.models';
import { AnalyzeResult } from './analyze-result';

const completedAnalysis: JobAnalysisDetail = {
  id: '20000000-0000-4000-8000-000000000000',
  applicationId: '10000000-0000-4000-8000-000000000000',
  status: 'COMPLETED',
  analysisData: {
    roleSummary: 'Own reliable platform services.',
    fitSummary: 'Strong backend experience with one domain gap.',
    requirements: [
      {
        requirement: 'Production TypeScript',
        importance: 'REQUIRED',
        matchStrength: 'STRONG',
        evidence: ['Built typed production services.'],
      },
    ],
    candidateEvidence: [
      {
        claim: 'Has service ownership experience.',
        evidence: ['Led a platform migration.'],
      },
    ],
    strengths: ['Strong TypeScript background.'],
    gaps: ['No explicit Kubernetes evidence.'],
    keywords: ['TypeScript', 'Platform'],
    hardConstraints: [
      {
        constraint: 'Eligible to work locally',
        satisfied: true,
        evidence: ['Candidate context confirms eligibility.'],
      },
      {
        constraint: 'On-site five days a week',
        satisfied: false,
        evidence: ['Candidate requires remote work.'],
      },
      {
        constraint: 'Security clearance',
        satisfied: null,
        evidence: [],
      },
    ],
    warnings: ['Seniority expectations are ambiguous.'],
  },
  suggestedScore: 82,
  failureCode: null,
  failureMessage: null,
  promptVersion: 'analyze-v1',
  startedAt: '2026-08-26T10:00:00.000Z',
  completedAt: '2026-08-26T10:00:02.000Z',
  failedAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:02.000Z',
};

async function createResult(
  analysis: JobAnalysisDetail,
): Promise<ComponentFixture<AnalyzeResult>> {
  await TestBed.configureTestingModule({ imports: [AnalyzeResult] }).compileComponents();
  const fixture = TestBed.createComponent(AnalyzeResult);
  fixture.componentRef.setInput('analysis', analysis);
  fixture.detectChanges();
  return fixture;
}

describe('AnalyzeResult', () => {
  it('renders the complete validated Analyze result without recomputing it', async () => {
    const fixture = await createResult(completedAnalysis);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Suggested fit score');
    expect(text).toContain('82');
    expect(text).toContain('Own reliable platform services.');
    expect(text).toContain('Strong backend experience with one domain gap.');
    expect(text).toContain('Production TypeScript');
    expect(text).toContain('Required');
    expect(text).toContain('Strong');
    expect(text).toContain('Built typed production services.');
    expect(text).toContain('Strong TypeScript background.');
    expect(text).toContain('No explicit Kubernetes evidence.');
    expect(text).toContain('Has service ownership experience.');
    expect(text).toContain('TypeScript');
    expect(text).toContain('Seniority expectations are ambiguous.');
  });

  it('renders all hard-constraint states distinctly', async () => {
    const fixture = await createResult(completedAnalysis);
    const states = Array.from(
      fixture.nativeElement.querySelectorAll('.constraint-state') as NodeListOf<HTMLElement>,
    ).map((element) => element.textContent?.trim());

    expect(states).toEqual(['Satisfied', 'Not satisfied', 'Unknown']);
  });

  it('does not render a null suggested score as zero', async () => {
    const fixture = await createResult({
      ...completedAnalysis,
      suggestedScore: null,
    });
    const score = fixture.nativeElement.querySelector(
      '.score-card',
    ) as HTMLElement;

    expect(score.textContent).toContain('Not enough evaluable requirements');
    expect(score.textContent).not.toContain('0/100');
  });

  it('renders safe FAILED and RUNNING states without result sections', async () => {
    const failedFixture = await createResult({
      ...completedAnalysis,
      status: 'FAILED',
      analysisData: null,
      suggestedScore: null,
      failureCode: 'LLM_PROVIDER_FAILED',
      failureMessage: 'The analysis could not be completed.',
      completedAt: null,
      failedAt: '2026-08-26T10:00:02.000Z',
    });

    expect(failedFixture.nativeElement.textContent).toContain('Analysis failed');
    expect(failedFixture.nativeElement.textContent).toContain(
      'The analysis could not be completed.',
    );
    expect(failedFixture.nativeElement.querySelector('.score-card')).toBeNull();

    failedFixture.componentRef.setInput('analysis', {
      ...completedAnalysis,
      status: 'RUNNING',
      analysisData: null,
      suggestedScore: null,
      completedAt: null,
    });
    failedFixture.detectChanges();
    expect(failedFixture.nativeElement.textContent).toContain(
      'Analysis in progress',
    );
    expect(failedFixture.nativeElement.querySelector('.score-card')).toBeNull();
  });
});
