import { DOCUMENT, DatePipe, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApplicationAnalysis } from '../../analyze/application-analysis/application-analysis';
import { ApplicationDocuments } from '../../document/application-documents/application-documents';
import { ResearchSection } from '../../research/research-section/research-section';
import { ApplicationTimeline } from '../application-timeline/application-timeline';
import {
  Application,
  ApplicationCreateRequest,
  ApplicationPriority,
  ApplicationSource,
  ApplicationStatus,
  Interview,
  InterviewStatus,
  InterviewType,
  InterviewWriteRequest,
  JobDescription,
  JobDescriptionUpdateRequest,
  applicationPriorities,
  applicationSources,
  applicationStatuses,
  interviewStatuses,
  interviewTypes,
} from '../application.models';
import { ApplicationService } from '../application.service';

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

const workspaceSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'job-description', label: 'Job Description' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'research', label: 'Research' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'documents', label: 'Documents' },
  { id: 'timeline', label: 'Timeline' },
] as const;

type WorkspaceSectionId = (typeof workspaceSections)[number]['id'];

function isWorkspaceSectionId(value: string): value is WorkspaceSectionId {
  return workspaceSections.some((section) => section.id === value);
}

function nonWhitespace(control: AbstractControl<unknown>): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { whitespace: true }
    : null;
}

function optionalHttpUrl(control: AbstractControl<unknown>): ValidationErrors | null {
  if (control.value === '') {
    return null;
  }
  if (
    typeof control.value !== 'string' ||
    !/^https?:\/\//iu.test(control.value)
  ) {
    return { httpUrl: true };
  }

  try {
    const url = new URL(control.value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}

function optionalDate(control: AbstractControl<unknown>): ValidationErrors | null {
  if (control.value === '') {
    return null;
  }
  if (typeof control.value !== 'string' || !datePattern.test(control.value)) {
    return { date: true };
  }

  const parsed = new Date(`${control.value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== control.value
    ? { date: true }
    : null;
}

function dateOrder(control: AbstractControl<unknown>): ValidationErrors | null {
  const value = control.value as {
    readonly dateFound?: unknown;
    readonly dateApplied?: unknown;
  };

  return typeof value.dateFound === 'string' &&
    value.dateFound !== '' &&
    typeof value.dateApplied === 'string' &&
    value.dateApplied !== '' &&
    value.dateApplied < value.dateFound
    ? { dateOrder: true }
    : null;
}

function optionalDateTime(
  control: AbstractControl<unknown>,
): ValidationErrors | null {
  if (control.value === '') {
    return null;
  }

  return typeof control.value === 'string' &&
    !Number.isNaN(new Date(control.value).getTime())
    ? null
    : { dateTime: true };
}

function interviewDateOrder(
  control: AbstractControl<unknown>,
): ValidationErrors | null {
  const value = control.value as {
    readonly scheduledAt?: unknown;
    readonly completedAt?: unknown;
  };

  return typeof value.scheduledAt === 'string' &&
    value.scheduledAt !== '' &&
    typeof value.completedAt === 'string' &&
    value.completedAt !== '' &&
    new Date(value.completedAt) < new Date(value.scheduledAt)
    ? { interviewDateOrder: true }
    : null;
}

function nonNegativeInteger(
  control: AbstractControl<unknown>,
): ValidationErrors | null {
  return typeof control.value === 'number' &&
    Number.isInteger(control.value) &&
    control.value >= 0
    ? null
    : { nonNegativeInteger: true };
}

const requiredText = [Validators.required, nonWhitespace];

@Component({
  selector: 'app-application-detail',
  imports: [
    ApplicationAnalysis,
    ApplicationDocuments,
    ApplicationTimeline,
    DatePipe,
    ReactiveFormsModule,
    ResearchSection,
    RouterLink,
  ],
  templateUrl: './application-detail.html',
  styleUrl: './application-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationDetail implements OnInit {
  private readonly applicationService = inject(ApplicationService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly application = signal<Application | null>(null);
  readonly applicationId = signal<string | null>(null);
  readonly createMode = computed(() => this.applicationId() === null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly jobDescription = signal<JobDescription | null>(null);
  readonly jobDescriptionLoading = signal(false);
  readonly jobDescriptionEditing = signal(false);
  readonly jobDescriptionSaving = signal(false);
  readonly jobDescriptionLoadError = signal<string | null>(null);
  readonly jobDescriptionSaveError = signal<string | null>(null);
  readonly jobDescriptionSuccess = signal<string | null>(null);
  readonly interviews = signal<Interview[]>([]);
  readonly interviewsLoading = signal(false);
  readonly interviewEditing = signal(false);
  readonly editingInterviewId = signal<string | null>(null);
  readonly interviewSaving = signal(false);
  readonly interviewsLoadError = signal<string | null>(null);
  readonly interviewSaveError = signal<string | null>(null);
  readonly interviewSuccess = signal<string | null>(null);
  readonly timelineRefreshToken = signal(0);
  readonly selectedWorkspaceSection = signal<WorkspaceSectionId>('overview');
  readonly workspaceSections = workspaceSections;
  readonly statuses = applicationStatuses;
  readonly priorities = applicationPriorities;
  readonly sources = applicationSources;
  readonly interviewTypes = interviewTypes;
  readonly interviewStatuses = interviewStatuses;

  readonly applicationForm = this.formBuilder.group(
    {
      companyName: this.formBuilder.nonNullable.control('', requiredText),
      roleTitle: this.formBuilder.nonNullable.control('', requiredText),
      location: this.formBuilder.nonNullable.control(''),
      jobUrl: this.formBuilder.nonNullable.control('', optionalHttpUrl),
      source: this.formBuilder.nonNullable.control<ApplicationSource>('OTHER'),
      status: this.formBuilder.nonNullable.control<ApplicationStatus>('FOUND'),
      priority: this.formBuilder.nonNullable.control<ApplicationPriority>('MEDIUM'),
      dateFound: this.formBuilder.nonNullable.control('', optionalDate),
      dateApplied: this.formBuilder.nonNullable.control('', optionalDate),
      notesMarkdown: this.formBuilder.nonNullable.control(''),
    },
    { validators: dateOrder },
  );

  readonly jobDescriptionForm = this.formBuilder.group({
    title: this.formBuilder.nonNullable.control(''),
    companyName: this.formBuilder.nonNullable.control(''),
    descriptionMarkdown: this.formBuilder.nonNullable.control('', requiredText),
    requirementsMarkdown: this.formBuilder.nonNullable.control(''),
    responsibilitiesMarkdown: this.formBuilder.nonNullable.control(''),
    sourceUrl: this.formBuilder.nonNullable.control('', optionalHttpUrl),
  });

  readonly interviewForm = this.formBuilder.group(
    {
      type: this.formBuilder.nonNullable.control<InterviewType>('OTHER'),
      status:
        this.formBuilder.nonNullable.control<InterviewStatus>('SCHEDULED'),
      scheduledAt: this.formBuilder.nonNullable.control('', optionalDateTime),
      completedAt: this.formBuilder.nonNullable.control('', optionalDateTime),
      notesMarkdown: this.formBuilder.nonNullable.control(''),
      feedbackMarkdown: this.formBuilder.nonNullable.control(''),
      sortOrder: this.formBuilder.nonNullable.control(0, [
        Validators.required,
        nonNegativeInteger,
      ]),
    },
    { validators: interviewDateOrder },
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      return;
    }

    this.applicationId.set(id);
    this.loadApplication();
    this.loadJobDescription();
    this.loadInterviews();
  }

  scrollToWorkspaceSection(sectionId: WorkspaceSectionId): void {
    const section = this.document.getElementById(sectionId);
    if (section === null) return;

    this.selectedWorkspaceSection.set(sectionId);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  selectWorkspaceSection(value: string): void {
    if (isWorkspaceSectionId(value)) {
      this.scrollToWorkspaceSection(value);
    }
  }

  loadApplication(): void {
    const id = this.applicationId();
    if (id === null) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    this.applicationService
      .getApplication(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.populateForm(application);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('We could not load this application. Please try again.');
        },
      });
  }

  saveApplication(): void {
    this.saveError.set(null);
    this.successMessage.set(null);

    if (this.applicationForm.invalid) {
      this.applicationForm.markAllAsTouched();
      this.saveError.set('Check the highlighted fields before saving.');
      return;
    }

    this.saving.set(true);
    const command = this.toCommand();
    const id = this.applicationId();
    const request =
      id === null
        ? this.applicationService.createApplication(command)
        : this.applicationService.updateApplication(id, command);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (application) => {
        const created = id === null;
        this.application.set(application);
        this.applicationId.set(application.id);
        this.populateForm(application);
        this.saving.set(false);
        this.successMessage.set(
          created ? 'Application created.' : 'Application saved.',
        );
        this.refreshTimeline();

        if (created) {
          this.location.replaceState(`/applications/${application.id}`);
        }
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set(
          'We could not save this application. Review your changes and try again.',
        );
      },
    });
  }

  loadJobDescription(): void {
    const id = this.applicationId();
    if (id === null) {
      return;
    }

    this.jobDescriptionLoading.set(true);
    this.jobDescriptionLoadError.set(null);
    this.applicationService
      .getJobDescription(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (jobDescription) => {
          this.jobDescription.set(jobDescription);
          this.jobDescriptionLoading.set(false);
        },
        error: () => {
          this.jobDescriptionLoading.set(false);
          this.jobDescriptionLoadError.set('Could not load job description.');
        },
      });
  }

  editJobDescription(): void {
    const jobDescription = this.jobDescription();
    const application = this.application();
    this.jobDescriptionForm.setValue({
      title:
        jobDescription === null ? application?.roleTitle ?? '' : jobDescription.title ?? '',
      companyName:
        jobDescription === null
          ? application?.companyName ?? ''
          : jobDescription.companyName ?? '',
      descriptionMarkdown: jobDescription?.descriptionMarkdown ?? '',
      requirementsMarkdown: jobDescription?.requirementsMarkdown ?? '',
      responsibilitiesMarkdown: jobDescription?.responsibilitiesMarkdown ?? '',
      sourceUrl:
        jobDescription === null ? application?.jobUrl ?? '' : jobDescription.sourceUrl ?? '',
    });
    this.jobDescriptionForm.markAsPristine();
    this.jobDescriptionSaveError.set(null);
    this.jobDescriptionSuccess.set(null);
    this.jobDescriptionEditing.set(true);
  }

  cancelJobDescriptionEdit(): void {
    this.jobDescriptionEditing.set(false);
    this.jobDescriptionSaveError.set(null);
  }

  saveJobDescription(): void {
    const id = this.applicationId();
    if (id === null) {
      return;
    }

    this.jobDescriptionSaveError.set(null);
    this.jobDescriptionSuccess.set(null);
    if (this.jobDescriptionForm.invalid) {
      this.jobDescriptionForm.markAllAsTouched();
      this.jobDescriptionSaveError.set(
        'Check the highlighted fields before saving.',
      );
      return;
    }

    this.jobDescriptionSaving.set(true);
    this.applicationService
      .updateJobDescription(id, this.toJobDescriptionCommand())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (jobDescription) => {
          this.jobDescription.set(jobDescription);
          this.jobDescriptionSaving.set(false);
          this.jobDescriptionEditing.set(false);
          this.jobDescriptionSuccess.set('Job description saved.');
          this.refreshTimeline();
        },
        error: () => {
          this.jobDescriptionSaving.set(false);
          this.jobDescriptionSaveError.set('Could not save job description.');
        },
    });
  }

  loadInterviews(): void {
    const id = this.applicationId();
    if (id === null) {
      return;
    }

    this.interviewsLoading.set(true);
    this.interviewsLoadError.set(null);
    this.applicationService
      .getInterviews(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (interviews) => {
          this.interviews.set(interviews);
          this.interviewsLoading.set(false);
        },
        error: () => {
          this.interviewsLoading.set(false);
          this.interviewsLoadError.set('Could not load interviews.');
        },
      });
  }

  editInterview(interview: Interview | null = null): void {
    this.editingInterviewId.set(interview?.id ?? null);
    this.interviewForm.setValue({
      type: interview?.type ?? 'OTHER',
      status: interview?.status ?? 'SCHEDULED',
      scheduledAt: this.toLocalDateTime(interview?.scheduledAt ?? null),
      completedAt: this.toLocalDateTime(interview?.completedAt ?? null),
      notesMarkdown: interview?.notesMarkdown ?? '',
      feedbackMarkdown: interview?.feedbackMarkdown ?? '',
      sortOrder: interview?.sortOrder ?? this.interviews().length,
    });
    this.interviewForm.markAsPristine();
    this.interviewSaveError.set(null);
    this.interviewSuccess.set(null);
    this.interviewEditing.set(true);
  }

  cancelInterviewEdit(): void {
    this.interviewEditing.set(false);
    this.editingInterviewId.set(null);
    this.interviewSaveError.set(null);
  }

  saveInterview(): void {
    const applicationId = this.applicationId();
    if (applicationId === null) {
      return;
    }

    this.interviewSaveError.set(null);
    this.interviewSuccess.set(null);
    if (this.interviewForm.invalid) {
      this.interviewForm.markAllAsTouched();
      this.interviewSaveError.set('Check the highlighted fields before saving.');
      return;
    }

    this.interviewSaving.set(true);
    const interviewId = this.editingInterviewId();
    const request =
      interviewId === null
        ? this.applicationService.createInterview(
            applicationId,
            this.toInterviewCommand(),
          )
        : this.applicationService.updateInterview(
            applicationId,
            interviewId,
            this.toInterviewCommand(),
          );

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (interview) => {
        const remaining = this.interviews().filter(
          ({ id }) => id !== interview.id,
        );
        this.interviews.set(this.orderInterviews([...remaining, interview]));
        this.interviewSaving.set(false);
        this.interviewEditing.set(false);
        this.editingInterviewId.set(null);
        this.interviewSuccess.set(
          interviewId === null ? 'Interview created.' : 'Interview saved.',
        );
        this.refreshTimeline();
      },
      error: () => {
        this.interviewSaving.set(false);
        this.interviewSaveError.set('Could not save interview.');
      },
    });
  }

  private populateForm(application: Application): void {
    this.applicationForm.setValue({
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      location: application.location ?? '',
      jobUrl: application.jobUrl ?? '',
      source: application.source,
      status: application.status,
      priority: application.priority,
      dateFound: application.dateFound ?? '',
      dateApplied: application.dateApplied ?? '',
      notesMarkdown: application.notesMarkdown ?? '',
    });
    this.applicationForm.markAsPristine();
  }

  private toCommand(): ApplicationCreateRequest {
    const value = this.applicationForm.getRawValue();

    return {
      companyName: value.companyName.trim(),
      roleTitle: value.roleTitle.trim(),
      location: this.nullableText(value.location),
      jobUrl: this.nullableText(value.jobUrl),
      source: value.source,
      status: value.status,
      priority: value.priority,
      dateFound: this.nullableText(value.dateFound),
      dateApplied: this.nullableText(value.dateApplied),
      notesMarkdown: this.nullableText(value.notesMarkdown),
    };
  }

  private toJobDescriptionCommand(): JobDescriptionUpdateRequest {
    const value = this.jobDescriptionForm.getRawValue();

    return {
      title: this.nullableText(value.title),
      companyName: this.nullableText(value.companyName),
      descriptionMarkdown: value.descriptionMarkdown.trim(),
      requirementsMarkdown: this.nullableText(value.requirementsMarkdown),
      responsibilitiesMarkdown: this.nullableText(
        value.responsibilitiesMarkdown,
      ),
      sourceUrl: this.nullableText(value.sourceUrl),
    };
  }

  private toInterviewCommand(): InterviewWriteRequest {
    const value = this.interviewForm.getRawValue();
    return {
      type: value.type,
      status: value.status,
      scheduledAt: this.toIsoTimestamp(value.scheduledAt),
      completedAt: this.toIsoTimestamp(value.completedAt),
      notesMarkdown: this.nullableText(value.notesMarkdown),
      feedbackMarkdown: this.nullableText(value.feedbackMarkdown),
      sortOrder: value.sortOrder,
    };
  }

  private toIsoTimestamp(value: string): string | null {
    return value === '' ? null : new Date(value).toISOString();
  }

  private toLocalDateTime(value: string | null): string {
    if (value === null) {
      return '';
    }

    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private orderInterviews(values: Interview[]): Interview[] {
    return [...values].sort((left, right) => {
      const orderDifference = left.sortOrder - right.sortOrder;
      if (orderDifference !== 0) return orderDifference;
      if (left.scheduledAt === null) return right.scheduledAt === null ? 0 : 1;
      if (right.scheduledAt === null) return -1;
      return left.scheduledAt.localeCompare(right.scheduledAt);
    });
  }

  private nullableText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private refreshTimeline(): void {
    this.timelineRefreshToken.update((value) => value + 1);
  }
}
