import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
  CandidateProfile,
  CandidateProject,
  CandidateReplacement,
  CandidateSkill,
  CandidateSkillCategory,
  CandidateSkillLevel,
  candidateSkillCategories,
  candidateSkillLevels,
} from '../candidate.models';
import { CandidateService } from '../candidate.service';

function nonWhitespace(control: AbstractControl<unknown>): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { whitespace: true }
    : null;
}

function optionalHttpUrl(control: AbstractControl<unknown>): ValidationErrors | null {
  if (control.value === null || control.value === '') {
    return null;
  }

  if (typeof control.value !== 'string') {
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

const requiredText = [Validators.required, nonWhitespace];
const sortOrderValidators = [Validators.required, Validators.min(0)];

@Component({
  selector: 'app-candidate-page',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './candidate-page.html',
  styleUrl: './candidate-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidatePage implements OnInit {
  private readonly candidateService = inject(CandidateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly candidate = signal<CandidateProfile | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly skillCategories = candidateSkillCategories;
  readonly skillLevels = candidateSkillLevels;

  readonly candidateForm = this.formBuilder.group({
    fullName: this.formBuilder.nonNullable.control('', requiredText),
    headline: this.formBuilder.nonNullable.control(''),
    location: this.formBuilder.nonNullable.control(''),
    linkedinUrl: this.formBuilder.nonNullable.control('', optionalHttpUrl),
    githubUrl: this.formBuilder.nonNullable.control('', optionalHttpUrl),
    portfolioUrl: this.formBuilder.nonNullable.control('', optionalHttpUrl),
    targetRolesText: this.formBuilder.nonNullable.control(''),
    targetLocationsText: this.formBuilder.nonNullable.control(''),
    summaryMarkdown: this.formBuilder.nonNullable.control(''),
    careerGoalsMarkdown: this.formBuilder.nonNullable.control(''),
    cvMarkdown: this.formBuilder.nonNullable.control(''),
    additionalContext: this.formBuilder.nonNullable.control(''),
    experiences: this.formBuilder.array([this.createExperienceGroup()]),
    education: this.formBuilder.array([this.createEducationGroup()]),
    projects: this.formBuilder.array([this.createProjectGroup()]),
    skills: this.formBuilder.array([this.createSkillGroup()]),
    languages: this.formBuilder.array([this.createLanguageGroup()]),
  });

  get experiences(): FormArray<ReturnType<CandidatePage['createExperienceGroup']>> {
    return this.candidateForm.controls.experiences;
  }

  get education(): FormArray<ReturnType<CandidatePage['createEducationGroup']>> {
    return this.candidateForm.controls.education;
  }

  get projects(): FormArray<ReturnType<CandidatePage['createProjectGroup']>> {
    return this.candidateForm.controls.projects;
  }

  get skills(): FormArray<ReturnType<CandidatePage['createSkillGroup']>> {
    return this.candidateForm.controls.skills;
  }

  get languages(): FormArray<ReturnType<CandidatePage['createLanguageGroup']>> {
    return this.candidateForm.controls.languages;
  }

  ngOnInit(): void {
    this.loadCandidate();
  }

  loadCandidate(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.successMessage.set(null);

    this.candidateService
      .getCandidate()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidate) => {
          this.candidate.set(candidate);
          this.loading.set(false);
          this.editing.set(false);

          if (candidate !== null) {
            this.populateForm(candidate);
          }
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(
            'We could not load your candidate profile. Please try again.',
          );
        },
      });
  }

  startCreating(): void {
    this.resetForm();
    this.editing.set(true);
    this.saveError.set(null);
    this.successMessage.set(null);
  }

  startEditing(): void {
    const candidate = this.candidate();
    if (candidate === null) {
      return;
    }

    this.populateForm(candidate);
    this.editing.set(true);
    this.saveError.set(null);
    this.successMessage.set(null);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.saveError.set(null);

    const candidate = this.candidate();
    if (candidate !== null) {
      this.populateForm(candidate);
    }
  }

  saveCandidate(): void {
    this.saveError.set(null);
    this.successMessage.set(null);

    if (this.candidateForm.invalid) {
      this.candidateForm.markAllAsTouched();
      this.saveError.set('Check the highlighted fields before saving.');
      return;
    }

    this.saving.set(true);
    this.candidateService
      .replaceCandidate(this.toReplacement())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidate) => {
          this.candidate.set(candidate);
          this.populateForm(candidate);
          this.saving.set(false);
          this.editing.set(false);
          this.successMessage.set('Candidate profile saved.');
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(
            'We could not save your candidate profile. Review your changes and try again.',
          );
        },
      });
  }

  addExperience(): void {
    this.experiences.push(this.createExperienceGroup());
  }

  removeExperience(index: number): void {
    this.experiences.removeAt(index);
  }

  addEducation(): void {
    this.education.push(this.createEducationGroup());
  }

  removeEducation(index: number): void {
    this.education.removeAt(index);
  }

  addProject(): void {
    this.projects.push(this.createProjectGroup());
  }

  removeProject(index: number): void {
    this.projects.removeAt(index);
  }

  addSkill(): void {
    this.skills.push(this.createSkillGroup());
  }

  removeSkill(index: number): void {
    this.skills.removeAt(index);
  }

  addLanguage(): void {
    this.languages.push(this.createLanguageGroup());
  }

  removeLanguage(index: number): void {
    this.languages.removeAt(index);
  }

  private createExperienceGroup(experience?: CandidateExperience) {
    return this.formBuilder.group({
      id: this.formBuilder.control<string | null>(experience?.id ?? null),
      organization: this.formBuilder.nonNullable.control(
        experience?.organization ?? '',
        requiredText,
      ),
      role: this.formBuilder.nonNullable.control(experience?.role ?? '', requiredText),
      location: this.formBuilder.nonNullable.control(experience?.location ?? ''),
      startDate: this.formBuilder.nonNullable.control(
        experience?.startDate ?? '',
        Validators.required,
      ),
      endDate: this.formBuilder.nonNullable.control(experience?.endDate ?? ''),
      descriptionMarkdown: this.formBuilder.nonNullable.control(
        experience?.descriptionMarkdown ?? '',
      ),
      sortOrder: this.formBuilder.nonNullable.control(
        experience?.sortOrder ?? 0,
        sortOrderValidators,
      ),
    });
  }

  private createEducationGroup(education?: CandidateEducation) {
    return this.formBuilder.group({
      id: this.formBuilder.control<string | null>(education?.id ?? null),
      institution: this.formBuilder.nonNullable.control(
        education?.institution ?? '',
        requiredText,
      ),
      degree: this.formBuilder.nonNullable.control(
        education?.degree ?? '',
        requiredText,
      ),
      fieldOfStudy: this.formBuilder.nonNullable.control(
        education?.fieldOfStudy ?? '',
      ),
      location: this.formBuilder.nonNullable.control(education?.location ?? ''),
      startDate: this.formBuilder.nonNullable.control(
        education?.startDate ?? '',
        Validators.required,
      ),
      endDate: this.formBuilder.nonNullable.control(education?.endDate ?? ''),
      descriptionMarkdown: this.formBuilder.nonNullable.control(
        education?.descriptionMarkdown ?? '',
      ),
      sortOrder: this.formBuilder.nonNullable.control(
        education?.sortOrder ?? 0,
        sortOrderValidators,
      ),
    });
  }

  private createProjectGroup(project?: CandidateProject) {
    return this.formBuilder.group({
      id: this.formBuilder.control<string | null>(project?.id ?? null),
      name: this.formBuilder.nonNullable.control(project?.name ?? '', requiredText),
      role: this.formBuilder.nonNullable.control(project?.role ?? ''),
      descriptionMarkdown: this.formBuilder.nonNullable.control(
        project?.descriptionMarkdown ?? '',
      ),
      projectUrl: this.formBuilder.nonNullable.control(
        project?.projectUrl ?? '',
        optionalHttpUrl,
      ),
      repositoryUrl: this.formBuilder.nonNullable.control(
        project?.repositoryUrl ?? '',
        optionalHttpUrl,
      ),
      startDate: this.formBuilder.nonNullable.control(project?.startDate ?? ''),
      endDate: this.formBuilder.nonNullable.control(project?.endDate ?? ''),
      technologiesText: this.formBuilder.nonNullable.control(
        project?.technologies.join(', ') ?? '',
      ),
      sortOrder: this.formBuilder.nonNullable.control(
        project?.sortOrder ?? 0,
        sortOrderValidators,
      ),
    });
  }

  private createSkillGroup(skill?: CandidateSkill) {
    return this.formBuilder.group({
      id: this.formBuilder.control<string | null>(skill?.id ?? null),
      name: this.formBuilder.nonNullable.control(skill?.name ?? '', requiredText),
      category: this.formBuilder.nonNullable.control<CandidateSkillCategory>(
        skill?.category ?? 'OTHER',
        Validators.required,
      ),
      level: this.formBuilder.control<CandidateSkillLevel | null>(skill?.level ?? null),
      notes: this.formBuilder.nonNullable.control(skill?.notes ?? ''),
      sortOrder: this.formBuilder.nonNullable.control(
        skill?.sortOrder ?? 0,
        sortOrderValidators,
      ),
    });
  }

  private createLanguageGroup(language?: CandidateLanguage) {
    return this.formBuilder.group({
      id: this.formBuilder.control<string | null>(language?.id ?? null),
      language: this.formBuilder.nonNullable.control(
        language?.language ?? '',
        requiredText,
      ),
      level: this.formBuilder.nonNullable.control(language?.level ?? '', requiredText),
      certification: this.formBuilder.nonNullable.control(
        language?.certification ?? '',
      ),
      notes: this.formBuilder.nonNullable.control(language?.notes ?? ''),
      sortOrder: this.formBuilder.nonNullable.control(
        language?.sortOrder ?? 0,
        sortOrderValidators,
      ),
    });
  }

  private populateForm(candidate: CandidateProfile): void {
    this.candidateForm.patchValue({
      fullName: candidate.fullName,
      headline: candidate.headline ?? '',
      location: candidate.location ?? '',
      linkedinUrl: candidate.linkedinUrl ?? '',
      githubUrl: candidate.githubUrl ?? '',
      portfolioUrl: candidate.portfolioUrl ?? '',
      targetRolesText: candidate.targetRoles.join(', '),
      targetLocationsText: candidate.targetLocations.join(', '),
      summaryMarkdown: candidate.summaryMarkdown ?? '',
      careerGoalsMarkdown: candidate.careerGoalsMarkdown ?? '',
      cvMarkdown: candidate.cvMarkdown ?? '',
      additionalContext: candidate.additionalContext ?? '',
    });

    this.experiences.clear();
    candidate.experiences.forEach((experience) =>
      this.experiences.push(this.createExperienceGroup(experience)),
    );
    this.education.clear();
    candidate.education.forEach((education) =>
      this.education.push(this.createEducationGroup(education)),
    );
    this.projects.clear();
    candidate.projects.forEach((project) =>
      this.projects.push(this.createProjectGroup(project)),
    );
    this.skills.clear();
    candidate.skills.forEach((skill) =>
      this.skills.push(this.createSkillGroup(skill)),
    );
    this.languages.clear();
    candidate.languages.forEach((language) =>
      this.languages.push(this.createLanguageGroup(language)),
    );

    this.candidateForm.markAsPristine();
  }

  private resetForm(): void {
    this.candidateForm.reset({
      fullName: '',
      headline: '',
      location: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      targetRolesText: '',
      targetLocationsText: '',
      summaryMarkdown: '',
      careerGoalsMarkdown: '',
      cvMarkdown: '',
      additionalContext: '',
    });
    this.experiences.clear();
    this.education.clear();
    this.projects.clear();
    this.skills.clear();
    this.languages.clear();
  }

  private toReplacement(): CandidateReplacement {
    const value = this.candidateForm.getRawValue();

    return {
      fullName: value.fullName.trim(),
      headline: this.nullableText(value.headline),
      location: this.nullableText(value.location),
      linkedinUrl: this.nullableText(value.linkedinUrl),
      githubUrl: this.nullableText(value.githubUrl),
      portfolioUrl: this.nullableText(value.portfolioUrl),
      targetRoles: this.commaSeparatedValues(value.targetRolesText),
      targetLocations: this.commaSeparatedValues(value.targetLocationsText),
      summaryMarkdown: this.nullableText(value.summaryMarkdown),
      careerGoalsMarkdown: this.nullableText(value.careerGoalsMarkdown),
      cvMarkdown: this.nullableText(value.cvMarkdown),
      additionalContext: this.nullableText(value.additionalContext),
      experiences: value.experiences.map((experience) => ({
        ...(experience.id === null ? {} : { id: experience.id }),
        organization: experience.organization.trim(),
        role: experience.role.trim(),
        location: this.nullableText(experience.location),
        startDate: experience.startDate,
        endDate: this.nullableText(experience.endDate),
        descriptionMarkdown: this.nullableText(experience.descriptionMarkdown),
        sortOrder: experience.sortOrder,
      })),
      education: value.education.map((education) => ({
        ...(education.id === null ? {} : { id: education.id }),
        institution: education.institution.trim(),
        degree: education.degree.trim(),
        fieldOfStudy: this.nullableText(education.fieldOfStudy),
        location: this.nullableText(education.location),
        startDate: education.startDate,
        endDate: this.nullableText(education.endDate),
        descriptionMarkdown: this.nullableText(education.descriptionMarkdown),
        sortOrder: education.sortOrder,
      })),
      projects: value.projects.map((project) => ({
        ...(project.id === null ? {} : { id: project.id }),
        name: project.name.trim(),
        role: this.nullableText(project.role),
        descriptionMarkdown: this.nullableText(project.descriptionMarkdown),
        projectUrl: this.nullableText(project.projectUrl),
        repositoryUrl: this.nullableText(project.repositoryUrl),
        startDate: this.nullableText(project.startDate),
        endDate: this.nullableText(project.endDate),
        technologies: this.commaSeparatedValues(project.technologiesText),
        sortOrder: project.sortOrder,
      })),
      skills: value.skills.map((skill) => ({
        ...(skill.id === null ? {} : { id: skill.id }),
        name: skill.name.trim(),
        category: skill.category,
        level: skill.level,
        notes: this.nullableText(skill.notes),
        sortOrder: skill.sortOrder,
      })),
      languages: value.languages.map((language) => ({
        ...(language.id === null ? {} : { id: language.id }),
        language: language.language.trim(),
        level: language.level.trim(),
        certification: this.nullableText(language.certification),
        notes: this.nullableText(language.notes),
        sortOrder: language.sortOrder,
      })),
    };
  }

  private nullableText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private commaSeparatedValues(value: string): string[] {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
}
