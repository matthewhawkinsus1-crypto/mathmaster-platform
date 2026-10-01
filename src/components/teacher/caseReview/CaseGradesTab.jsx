import { ConditionTag, Prov, day, pct } from './CaseReviewParts.jsx';
import { CASE_PROVENANCE } from '../../../platform/caseReview/caseProvenance.js';
import { gradeItemLabel } from '../../../platform/caseReview/caseReviewExport.js';

/*
 * GRADE & ASSIGNMENT EVIDENCE — every real assigned instance and exactly what
 * it contributes: dates, condition, each section's MathMaster grade, points,
 * attempts, status, export state. The row opens the assignment's question
 * evidence.
 */

const statusTag = (row) => {
  if (row.status === 'missing') return <span className="cr-tag" data-kind="bad">Missing</span>;
  if (row.status === 'closed-incomplete') return <span className="cr-tag" data-kind="bad">Closed incomplete</span>;
  if (row.status === 'in-progress') return <span className="cr-tag" data-kind="warn">In progress</span>;
  if (row.status === 'completed') return <span className="cr-tag" data-kind="good">{row.completedLate ? 'Completed late' : 'Completed'}</span>;
  return <span className="cr-tag">{row.statusLabel}</span>;
};

// "Not started" / "No answers" instead of a bare 0: an unanswered section is not a score.
const section = (row, key) => {
  const item = row.gradeItems.find((entry) => entry.key === key);
  if (!item) return '—';
  const label = gradeItemLabel(item) || '—';
  return item.state === 'not-started' || item.state === 'no-answers-closed'
    ? <span className="cr-note">{label}</span>
    : `${label}${item.exportStatus?.state === 'changed-since-export' ? '*' : ''}`;
};

export default function CaseGradesTab({ model, onOpenAssignment }) {
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-grades">
        <h2 id="cr-grades">Grade &amp; assignment evidence ({model.assignments.length})</h2>
        <p className="cr-note">
          One row per assignment given to this student (library copies are excluded). Grades are MathMaster grade contributions — what Grade
          Export sends — not the official average. * changed since it was exported. Open a row for its questions and attempts.
        </p>
        <div className="cr-scroll-x">
          <table className="cr-table" data-case-grades>
            <thead>
              <tr>
                <th>Assignment</th><th>Status</th><th>Condition</th><th>Class due</th><th>Individual due</th><th>Completed (last answer)</th>
                <th>Overall</th><th>Warm-Up</th><th>Classwork</th><th>Practice</th><th>DOL</th><th>Attempts</th><th>Export</th>
              </tr>
            </thead>
            <tbody>
              {model.assignments.map((row) => (
                <tr key={row.assignmentId} data-clickable="true" data-case-assignment={row.assignmentId} onClick={() => onOpenAssignment(row.assignmentId)}>
                  <td><button type="button" className="cr-linkish" onClick={(event) => { event.stopPropagation(); onOpenAssignment(row.assignmentId); }}>{row.title}</button><div className="cr-note">{row.type}</div></td>
                  <td>{statusTag(row)}</td>
                  <td><ConditionTag value={row.condition.value} /></td>
                  <td>{day(row.classDueAtMs)}</td>
                  <td>{row.individualizedDueAtMs ? day(row.individualizedDueAtMs) : '—'}</td>
                  <td>{row.completedAtMs ? day(row.completedAtMs) : '—'}</td>
                  <td className="cr-num">{row.score === null ? '—' : `${row.score}%`}{row.status !== 'completed' && row.score !== null ? ' so far' : ''}</td>
                  <td className="cr-num">{section(row, 'warmup')}</td>
                  <td className="cr-num">{section(row, 'classwork')}</td>
                  <td className="cr-num">{section(row, 'practice')}</td>
                  <td className="cr-num">{section(row, 'dol')}</td>
                  <td className="cr-num">{row.attempts}</td>
                  <td>{row.exportSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {model.assignments.map((row) => (
        <details key={row.assignmentId} className="tw-disclosure" data-case-grade-detail={row.assignmentId}>
          <summary>{row.title} — contribution detail</summary>
          <div className="tw-disclosure__body cr-section">
            <dl className="cr-dl">
              <div><dt>Assignment instance ID</dt><dd><code>{row.instanceId}</code></dd></div>
              <div><dt>Type</dt><dd>{row.type}</dd></div>
              <div><dt>Category / weight</dt><dd>{row.category}</dd></div>
              <div><dt>Assigned</dt><dd>{day(row.releaseAtMs)}</dd></div>
              <div><dt>Class due</dt><dd>{day(row.classDueAtMs)}</dd></div>
              <div><dt>Individualized due</dt><dd>{row.individualizedDueAtMs ? <>{day(row.individualizedDueAtMs)} <Prov level={CASE_PROVENANCE.DERIVED} /></> : 'None'}</dd></div>
              <div><dt>Final cutoff for this student</dt><dd>{day(row.finalAtMs)}{row.attendanceExtension ? ' (attendance extension)' : ''}</dd></div>
              <div><dt>Completed on</dt><dd>{row.completedAtMs ? <>{day(row.completedAtMs)} <Prov level={row.completedAtProvenance} /></> : 'Not complete'}</dd></div>
              <div><dt>Condition</dt><dd><ConditionTag value={row.condition.value} /> <Prov level={row.condition.caseProvenance} /></dd></div>
              <div><dt>Overall MathMaster grade</dt><dd>{pct(row.score)}</dd></div>
              <div><dt>Points (question weight)</dt><dd>{row.points ? `${row.points.earned} of ${row.points.possible}` : '—'}</dd></div>
              <div><dt>Attempts recorded</dt><dd>{row.attempts}</dd></div>
            </dl>
            {row.condition.note && <p className="cr-note">{row.condition.note}</p>}
            <div className="cr-scroll-x">
              <table className="cr-table">
                <thead><tr><th>Gradebook item</th><th>MathMaster grade contribution</th><th>Export status</th></tr></thead>
                <tbody>
                  {row.gradeItems.map((item) => (
                    <tr key={item.key}><td>{item.label}</td><td>{gradeItemLabel(item) || '—'}<span className="cr-note"> · {item.answered} of {item.questions} answered</span></td><td>{item.exportStatus?.label || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="cr-lines">
              {row.credits.practicePass && <li>Practice Pass redeemed: the Practice section is excused, never scored.</li>}
              {row.credits.liveChallengeWarmup && <li>A Live Challenge result is recorded as this assignment&apos;s Warm-Up grade.</li>}
              {row.credits.recoveries.length > 0 && <li>Completed Recovery: {row.credits.recoveries.join(', ')} (the recorded section score includes it).</li>}
              {row.credits.assignmentOverride && <li>A teacher assignment-level grade override is active.</li>}
              {row.credits.questionOverrides > 0 && <li>{row.credits.questionOverrides} teacher question override{row.credits.questionOverrides === 1 ? '' : 's'} active.</li>}
            </ul>
            <p className="cr-note">{row.weightPolicy}</p>
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenAssignment(row.assignmentId)}>Question evidence for this assignment</button>
          </div>
        </details>
      ))}
    </>
  );
}
