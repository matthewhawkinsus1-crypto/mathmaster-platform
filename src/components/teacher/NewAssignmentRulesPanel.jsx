/*
 * SP-5: TWO AUTHORING WARNINGS FOR A NEW ASSIGNMENT.
 *
 * A read-only Pre-Flight panel, drawn in the Check step beside the worked-
 * example coverage panel. It renders what auditNewAssignmentRules
 * (src/platform/preflight/newAssignmentRulesPreflight.js) found, and computes
 * nothing itself:
 *   - Use the tool: an answer box asks for what a tool produces (an equation to
 *     solve, something to graph, a polynomial to divide);
 *   - Show a step: three or more answer boxes and no checkpoint or
 *     followThrough on any of them.
 *
 * New assignments only (SHOWING_THE_PROCESS.md section 6). For an existing
 * assignment the audit returns nothing, and the panel draws nothing: not a
 * warning, not information. It is never a readiness finding and never stops
 * the teacher creating the assignment.
 */
import { useId } from 'react';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const GROUPS = [
  { id: 'toolFirst', title: 'Use the tool', one: 'question', many: 'questions' },
  { id: 'showTheStep', title: 'Show a step', one: 'question', many: 'questions' },
];

// headingLevel: one below the heading the panel sits under, as the coverage panel.
export default function NewAssignmentRulesPanel({ rules = null, headingLevel = 5 }) {
  const headingId = useId();
  if (!rules?.isNew) return null;
  const groups = GROUPS
    .map((group) => ({ ...group, warnings: Array.isArray(rules[group.id]?.warnings) ? rules[group.id].warnings : [] }))
    .filter((group) => group.warnings.length > 0);
  if (groups.length === 0) return null;
  const Heading = `h${Math.min(6, Math.max(2, Number(headingLevel) || 5))}`;
  const total = groups.reduce((sum, group) => sum + group.warnings.length, 0);

  return (
    <section
      data-new-assignment-rules-panel="true"
      aria-labelledby={headingId}
      style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-warning-border)', borderRadius: 10, background: 'var(--mm-warning-bg)', color: 'var(--mm-text)', textAlign: 'left', overflowWrap: 'anywhere' }}
    >
      <Heading id={headingId} style={{ margin: 0, fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.4, color: 'var(--mm-warning-text)' }}>
        <span>Warning: </span>
        {plural(total, 'note', 'notes')} on answer boxes in a new assignment
      </Heading>
      <p style={{ margin: '5px 0 9px', color: 'var(--mm-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
        In a new assignment, a tool does the work a tool can do, and a long answer box checks at least one step, so you see how a student got there and not only the answer.
        {' '}This never stops you creating the assignment.
      </p>
      {groups.map((group) => (
        <details key={group.id} open data-new-assignment-rule={group.id} style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', minHeight: 24, fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>
            {group.title}: {plural(group.warnings.length, group.one, group.many)}
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
            {group.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </details>
      ))}
    </section>
  );
}
