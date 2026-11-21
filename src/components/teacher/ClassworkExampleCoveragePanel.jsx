/*
 * WORKED EXAMPLES: HOW MANY CLASSWORK QUESTIONS ARE COVERED (WE-B).
 *
 * A read-only Pre-Flight panel, drawn in the Check step. It renders what
 * classworkExampleCoverage (src/platform/supports/workedExample/classworkCoverage.js)
 * worked out, and nothing it computes itself: how many Classwork questions a
 * worked example covers, and for each one not covered, what would cover it.
 *
 * The owner's scope (WORKED_EXAMPLES.md section 6): coverage is a rule for new
 * and newly imported assignments, so there it reads as a warning; an existing
 * assignment is not back-filled, so there it is information only. Either way
 * it is never a readiness finding and never stops anything: Pre-Flight's
 * diagnostics do not read it.
 */
import { useId } from 'react';
import {
  EXAMPLE_COVERAGE_STATUS,
  coverageHeadline,
  fillWithText,
} from '../../platform/supports/workedExample/classworkCoverage.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const breakdownOf = (byStatus = {}) => [
  [EXAMPLE_COVERAGE_STATUS.BUILT_IN, 'covered by a built-in example'],
  [EXAMPLE_COVERAGE_STATUS.EARLIER_SAME_SKILL, 'covered by an earlier question on the same skill'],
  [EXAMPLE_COVERAGE_STATUS.OWN, 'covered by its own example', 'covered by their own example'],
  [EXAMPLE_COVERAGE_STATUS.EXEMPT, 'needs no example', 'need no example'],
]
  .map(([status, one, many = one]) => {
    const count = Number(byStatus?.[status]) || 0;
    return { status, count, words: count === 1 ? one : many };
  })
  .filter((row) => row.count > 0);

const describeQuestion = (entry) => {
  const what = [entry.kind, entry.standard].filter(Boolean).join(', ');
  return `Question ${entry.questionNumber}${what ? ` (${what})` : ''}`;
};

// headingLevel: one below the heading the panel sits under (Pre-Flight's
// step heading is an h4 where it is drawn; a phone draws none under the h3).
export default function ClassworkExampleCoveragePanel({ coverage = null, isNew = false, headingLevel = 5 }) {
  const headingId = useId();
  const Heading = `h${Math.min(6, Math.max(2, Number(headingLevel) || 5))}`;
  const summary = coverage?.summary;
  if (!summary || !summary.total) return null;
  const uncovered = (Array.isArray(coverage.questions) ? coverage.questions : [])
    .filter((entry) => entry.status === EXAMPLE_COVERAGE_STATUS.UNCOVERED);
  const warn = isNew && uncovered.length > 0;
  const tone = warn ? 'warning' : 'info';
  const breakdown = breakdownOf(summary.byStatus);

  return (
    <section
      data-classwork-example-coverage-panel="true"
      data-coverage-tone={tone}
      data-coverage-scope={isNew ? 'new' : 'existing'}
      aria-labelledby={headingId}
      style={{ marginBottom: 18, padding: 14, border: `1px solid var(--mm-${tone}-border)`, borderRadius: 10, background: `var(--mm-${tone}-bg)`, color: 'var(--mm-text)', textAlign: 'left', overflowWrap: 'anywhere' }}
    >
      <Heading id={headingId} style={{ margin: 0, fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.4, color: `var(--mm-${tone}-text)` }}>
        {warn && <span>Warning: </span>}
        {coverageHeadline(summary)}
      </Heading>
      <p style={{ margin: '5px 0 9px', color: warn ? 'var(--mm-text)' : 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
        {isNew
          ? 'A student working alone is shown how to do each new kind of question before trying it. In a new assignment every Classwork question should be covered: by its own worked example, a built-in one, or an earlier question on the same skill.'
          : 'For information only. This assignment already exists, and existing assignments are not changed to add worked examples.'}
        {' '}This never stops you {isNew ? 'creating' : 'saving'} the assignment.
      </p>
      {breakdown.length > 0 && (
        <ul data-coverage-breakdown="true" style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>
          {breakdown.map((row) => (
            <li key={row.status} data-coverage-status={row.status}>{plural(row.count, 'question', 'questions')} {row.words}</li>
          ))}
        </ul>
      )}
      {uncovered.length > 0 && (
        <details open={isNew}>
          <summary style={{ cursor: 'pointer', minHeight: 24, fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>
            {plural(uncovered.length, 'question', 'questions')} not covered
          </summary>
          <ul data-coverage-uncovered="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: warn ? 'var(--mm-warning-text)' : 'var(--mm-text)' }}>
            {uncovered.map((entry) => (
              <li key={`${entry.questionNumber}-${entry.questionId || ''}`} data-fill-with={entry.fillWith}>
                {describeQuestion(entry)}: {fillWithText(entry.fillWith)}.
                {entry.missingExample ? ` It names the example "${entry.missingExample}", which the lesson does not have.` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
