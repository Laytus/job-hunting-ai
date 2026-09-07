import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownContent } from './markdown-content';

async function render(markdown: string): Promise<ComponentFixture<MarkdownContent>> {
  await TestBed.configureTestingModule({
    imports: [MarkdownContent],
  }).compileComponents();
  const fixture = TestBed.createComponent(MarkdownContent);
  fixture.componentRef.setInput('markdown', markdown);
  fixture.detectChanges();
  return fixture;
}

describe('MarkdownContent', () => {
  it('renders headings, lists, and strong text as semantic HTML', async () => {
    const fixture = await render(
      '## Research findings\n\n- **COMPANY DESCRIPTION:** Example company.',
    );

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe(
      'Research findings',
    );
    expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('strong')?.textContent).toBe(
      'COMPANY DESCRIPTION:',
    );
  });

  it('renders plain text without requiring a version-specific path', async () => {
    const fixture = await render('Historical Research summary.');

    expect(fixture.nativeElement.querySelector('p')?.textContent).toBe(
      'Historical Research summary.',
    );
  });

  it.each(['APPLICATION_BRIEF', 'INTERVIEW_BRIEF'] as const)(
    'adds the readable brief presentation for %s',
    async (documentType) => {
      const fixture = await render(
        '# Brief\n\n## Preparation priorities\n\n- Review evidence',
      );
      fixture.componentRef.setInput('documentType', documentType);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.markdown-content--brief'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe(
        'Preparation priorities',
      );
    },
  );

  it('does not apply brief presentation to a Cover Letter', async () => {
    const fixture = await render('# Cover Letter');
    fixture.componentRef.setInput('documentType', 'COVER_LETTER');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.markdown-content--brief'),
    ).toBeNull();
  });

  it('keeps embedded HTML inert without trusting it as rendered HTML', async () => {
    const fixture = await render(
      "Safe summary.\n\n<script>alert('unsafe')</script>",
    );

    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      "<script>alert('unsafe')</script>",
    );
  });
});
