export interface JobDescription {
  readonly id: string;
  readonly applicationId: string;
  readonly title: string | null;
  readonly companyName: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown: string | null;
  readonly responsibilitiesMarkdown: string | null;
  readonly structuredData: Readonly<Record<string, unknown>> | null;
  readonly sourceUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface JobDescriptionWriteInput {
  readonly title?: string | null;
  readonly companyName?: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown?: string | null;
  readonly responsibilitiesMarkdown?: string | null;
  readonly structuredData?: Readonly<Record<string, unknown>> | null;
  readonly sourceUrl?: string | null;
}

export interface JobDescriptionWriteCommand {
  readonly title: string | null;
  readonly companyName: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown: string | null;
  readonly responsibilitiesMarkdown: string | null;
  readonly structuredData: Readonly<Record<string, unknown>> | null;
  readonly sourceUrl: string | null;
}

export interface JobDescriptionReplacementResult {
  readonly created: boolean;
  readonly jobDescription: JobDescription;
}
