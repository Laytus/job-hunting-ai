import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { GenerationTemplateError } from '../generation.errors.js';
import { GenerationTemplateLoader } from './generation-template-loader.js';
import { generationTemplateRegistry } from './generation-template-registry.js';

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'generation-templates-'));
  temporaryRoots.push(root);
  return root;
}

function rootUrl(root: string): URL {
  return pathToFileURL(`${root}${sep}`);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe('GenerationTemplateLoader', () => {
  it('loads all four active versioned templates as nonblank resources', async () => {
    const loader = new GenerationTemplateLoader();

    const templates = await Promise.all(
      generationTemplateRegistry.map(({ documentType, language }) =>
        loader.load(documentType, language),
      ),
    );

    expect(templates.map(({ id }) => id)).toEqual([
      'cover-letter-en-v2',
      'cover-letter-fr-v2',
      'application-brief-en-v1',
      'interview-brief-en-v1',
    ]);
    expect(templates.map(({ version }) => version)).toEqual([
      'v2',
      'v2',
      'v1',
      'v1',
    ]);
    expect(templates.every(({ content }) => content.trim().length > 0)).toBe(
      true,
    );
  });

  it('preserves the important writing and grounding contracts', async () => {
    const loader = new GenerationTemplateLoader();
    const [coverLetterEn, coverLetterFr, applicationBrief, interviewBrief] =
      await Promise.all([
        loader.load('COVER_LETTER', 'en'),
        loader.load('COVER_LETTER', 'fr'),
        loader.load('APPLICATION_BRIEF', 'en'),
        loader.load('INTERVIEW_BRIEF', 'en'),
      ]);

    expect(coverLetterEn.content).toContain('Never invent candidate');
    expect(coverLetterEn.content).toContain('supplied market convention');
    expect(coverLetterEn.content).not.toContain('250–400');
    expect(coverLetterFr.content).toContain('lettre de motivation');
    expect(coverLetterFr.content).toContain('Ne jamais inventer');
    expect(coverLetterFr.content).toContain(
      'ne pas déduire le marché ou le secteur de la langue',
    );
    expect(coverLetterFr.content).not.toContain('250 à 400');
    expect(applicationBrief.content).toContain('internal application brief');
    expect(applicationBrief.content).toContain('Preserve uncertainty');
    expect(interviewBrief.content).toContain('reported employer or interview evidence');
    expect(interviewBrief.content).toContain(
      'practice questions as preparation exercises',
    );
  });

  it('fails safely when a registered resource is missing', async () => {
    const root = await createTemporaryRoot();
    const loader = new GenerationTemplateLoader([rootUrl(root)]);

    await expect(loader.load('COVER_LETTER', 'en')).rejects.toEqual(
      expect.objectContaining<Partial<GenerationTemplateError>>({
        code: 'GENERATION_TEMPLATE_NOT_FOUND',
        templateId: 'cover-letter-en-v2',
      }),
    );
  });

  it('fails safely when a registered resource is blank', async () => {
    const root = await createTemporaryRoot();
    const templateDirectory = join(root, 'cover-letter');
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(join(templateDirectory, 'cover-letter-en-v2.md'), '   \n');
    const loader = new GenerationTemplateLoader([rootUrl(root)]);

    await expect(loader.load('COVER_LETTER', 'en')).rejects.toEqual(
      expect.objectContaining<Partial<GenerationTemplateError>>({
        code: 'GENERATION_TEMPLATE_EMPTY',
        templateId: 'cover-letter-en-v2',
      }),
    );
  });
});
