import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';
import MarkdownIt from 'markdown-it';
import type { DocumentType } from '../../features/document/document.models';

const markdownRenderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
  typographer: false,
});

@Component({
  selector: 'app-markdown-content',
  templateUrl: './markdown-content.html',
  styleUrl: './markdown-content.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class MarkdownContent {
  readonly markdown = input.required<string>();
  readonly documentType = input<DocumentType | null>(null);
  readonly briefPresentation = computed(() => {
    const documentType = this.documentType();
    return (
      documentType === 'APPLICATION_BRIEF' ||
      documentType === 'INTERVIEW_BRIEF'
    );
  });

  readonly renderedHtml = computed(() =>
    markdownRenderer.render(this.markdown()),
  );
}
