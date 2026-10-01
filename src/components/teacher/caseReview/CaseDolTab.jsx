import { EmptyNote, pct } from './CaseReviewParts.jsx';

/*
 * DOL VS INSTRUCTIONAL WORK — numbers side by side, Standard and Modified
 * apart, substantial differences flagged by one fixed rule, and never an
 * explanation of why.
 */

const SECTION_ORDER = ['warmup', 'classwork', 'practice', 'dol', 'assessment'];

function Comparison({ sections, title }) {
  const rows = SECTION_ORDER.map((key) => sections.find((entry) => entry.key === key)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="cr-scroll-x">
      <table className="cr-table" aria-label={title}>
        <thead><tr><th>{title}</th><th>Answered</th><th>First-attempt correct</th><th>Final accuracy</th><th>Calculator recorded on</th></tr></thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.key}>
              <td>{entry.label}</td>
              <td className="cr-num">{entry.attempted}</td>
              <td className="cr-num">{pct(entry.firstAttemptAccuracy)}</td>
              <td className="cr-num">{pct(entry.finalCreditAverage)}</td>
              <td className="cr-num">{entry.calculatorRecordedQuestions} question{entry.calculatorRecordedQuestions === 1 ? '' : 's'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CaseDolTab({ model }) {
  const comparison = model.sectionComparison;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-dol-lines">
        <h2 id="cr-dol-lines">DOL compared with instructional work</h2>
        <ul className="cr-lines" data-case-dol-lines>{model.sectionComparisonLines.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="cr-note">
          A difference is flagged when it is at least {comparison.rule.substantialDifferencePoints} points with at least {comparison.rule.minAttempted} answered items on each side. {comparison.note}
        </p>
      </section>
      <section className="cr-section" aria-labelledby="cr-dol-tables">
        <h2 id="cr-dol-tables">By section</h2>
        <Comparison sections={comparison.byCondition.standard} title="Standard (grade-level)" />
        {comparison.byCondition.modified.length > 0 ? <Comparison sections={comparison.byCondition.modified} title="Modified" /> : null}
        <p className="cr-note">Calculator counts are questions whose attempt record shows the calculator was opened. Supports recorded by the Student Support Evidence system are on the Support evidence tab.</p>
      </section>
      <section className="cr-section" aria-labelledby="cr-dol-assignments">
        <h2 id="cr-dol-assignments">Where DOL sits well below the same lesson&apos;s instruction</h2>
        {comparison.assignmentsWithDolGap.length ? (
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Assignment</th><th>Classwork + Practice</th><th>DOL</th><th>Difference</th></tr></thead>
              <tbody>
                {comparison.assignmentsWithDolGap.map((row) => (
                  <tr key={row.assignmentId}><td>{row.title}{row.condition === 'modified' ? ' (Modified)' : ''}</td><td className="cr-num">{row.instructional}% over {row.instructionalAttempted}</td><td className="cr-num">{row.dol}% over {row.dolAttempted}</td><td className="cr-num">{row.difference} points</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>No assignment in this selection meets the rule.</EmptyNote>}
        {comparison.standardsWithDolGap.length > 0 && (
          <>
            <h3>By standard (grade-level work)</h3>
            <ul className="cr-lines">{comparison.standardsWithDolGap.map((row) => <li key={row.code}><strong>{row.code}</strong>: Classwork + Practice {row.instructional}% over {row.instructionalAttempted}; DOL {row.dol}% over {row.dolAttempted}</li>)}</ul>
          </>
        )}
        {comparison.assessments.length > 0 && (
          <>
            <h3>Quiz / Test recorded grades</h3>
            <ul className="cr-lines">{comparison.assessments.map((row) => <li key={row.assignmentId}>{row.title}: {pct(row.score)}</li>)}</ul>
          </>
        )}
      </section>
    </>
  );
}
