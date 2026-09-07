import type { ApplicationSource } from '../application/application.types.js';

export interface ResearchApplicationContext {
  readonly companyName: string;
  readonly roleTitle: string;
  readonly location: string | null;
  readonly jobUrl: string | null;
  readonly source: ApplicationSource;
}

export interface ResearchJobDescriptionContext {
  readonly title: string | null;
  readonly companyName: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown: string | null;
  readonly responsibilitiesMarkdown: string | null;
  readonly sourceUrl: string | null;
}

export interface ResearchContext {
  readonly application: ResearchApplicationContext;
  readonly jobDescription: ResearchJobDescriptionContext;
}
