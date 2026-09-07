import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { GenerationApiResponse } from './generation.models';
import { GenerationService } from './generation.service';

const applicationId = '10000000-0000-4000-8000-000000000000';
const documentId = '20000000-0000-4000-8000-000000000000';
const versionId = '30000000-0000-4000-8000-000000000000';

const apiResponse: GenerationApiResponse = {
  document: {
    id: documentId,
    candidateId: null,
    applicationId,
    type: 'COVER_LETTER',
    title: 'Cover Letter — Example Corp — Engineer',
    currentVersionId: versionId,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
  },
  currentVersion: {
    id: versionId,
    documentId,
    contentMarkdown: '# Title\n\nExample cover letter',
    metadata: {
      generation: {
        outputLanguage: 'fr',
        coverLetterMarket: 'UNITED_STATES',
        coverLetterSector: 'SOFTWARE_TECH',
        promptVersion: 'private-backend-metadata',
      },
    },
    createdAt: '2026-08-28T10:00:00.000Z',
  },
  warnings: ['NO_RESEARCH_AVAILABLE'],
};

describe('GenerationService', () => {
  let service: GenerationService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GenerationService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('loads the exact provider-free Cover Letter profile suggestion', async () => {
    const suggestion = {
      market: {
        value: 'UNITED_KINGDOM' as const,
        source: 'APPLICATION_LOCATION' as const,
      },
      sector: {
        value: 'QUANT_TRADING' as const,
        source: 'ROLE_TITLE' as const,
      },
    };
    const result = firstValueFrom(
      service.suggestCoverLetterProfile(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/generation/cover-letter-profile`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ suggestion });
    await expect(result).resolves.toEqual(suggestion);
  });

  it('generates through the Application endpoint and maps the returned current version directly', async () => {
    const command = {
      documentType: 'COVER_LETTER' as const,
      outputLanguage: 'fr' as const,
      market: 'UNITED_STATES' as const,
      sector: 'SOFTWARE_TECH' as const,
    };
    const result = firstValueFrom(
      service.generateDocument(applicationId, command),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/generation`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    request.flush(apiResponse);

    await expect(result).resolves.toEqual({
      document: {
        ...apiResponse.document,
        currentVersion: {
          id: versionId,
          documentId,
          contentMarkdown: '# Title\n\nExample cover letter',
          createdAt: '2026-08-28T10:00:00.000Z',
          coverLetterProfile: {
            outputLanguage: 'fr',
            market: 'UNITED_STATES',
            sector: 'SOFTWARE_TECH',
          },
        },
      },
      currentVersion: {
        id: versionId,
        documentId,
        contentMarkdown: '# Title\n\nExample cover letter',
        createdAt: '2026-08-28T10:00:00.000Z',
        coverLetterProfile: {
          outputLanguage: 'fr',
          market: 'UNITED_STATES',
          sector: 'SOFTWARE_TECH',
        },
      },
      warnings: ['NO_RESEARCH_AVAILABLE'],
    });
    expect('metadata' in (await result).currentVersion).toBe(false);
  });

  it('regenerates through the nested Document endpoint without sending Markdown', async () => {
    const command = {
      outputLanguage: 'en' as const,
      market: 'FRANCE' as const,
      sector: 'GENERAL' as const,
    };
    const result = firstValueFrom(
      service.regenerateDocument(applicationId, documentId, command),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/documents/${documentId}/regenerate`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    expect(request.request.body).not.toHaveProperty('contentMarkdown');
    request.flush(apiResponse);
    await expect(result).resolves.toMatchObject({
      document: { id: documentId, currentVersionId: versionId },
      currentVersion: { id: versionId },
      warnings: ['NO_RESEARCH_AVAILABLE'],
    });
  });

  it.each(['APPLICATION_BRIEF', 'INTERVIEW_BRIEF'] as const)(
    'keeps the %s Generate and Regenerate payloads profile-free',
    async (documentType) => {
      const generateResult = firstValueFrom(
        service.generateDocument(applicationId, { documentType }),
      );
      const generateRequest = httpController.expectOne(
        `/api/v1/applications/${applicationId}/generation`,
      );

      expect(generateRequest.request.body).toEqual({ documentType });
      expect(generateRequest.request.body).not.toHaveProperty('market');
      expect(generateRequest.request.body).not.toHaveProperty('sector');
      generateRequest.flush({
        ...apiResponse,
        document: { ...apiResponse.document, type: documentType },
      });
      await generateResult;

      const regenerateResult = firstValueFrom(
        service.regenerateDocument(applicationId, documentId, {}),
      );
      const regenerateRequest = httpController.expectOne(
        `/api/v1/applications/${applicationId}/documents/${documentId}/regenerate`,
      );

      expect(regenerateRequest.request.body).toEqual({});
      expect(regenerateRequest.request.body).not.toHaveProperty('market');
      expect(regenerateRequest.request.body).not.toHaveProperty('sector');
      regenerateRequest.flush({
        ...apiResponse,
        document: { ...apiResponse.document, type: documentType },
      });
      await regenerateResult;
    },
  );
});
