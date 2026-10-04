import { PRINT_SECTIONS, TEACHER_AUTHORED_LABEL, gradeItemLabel } from '../../../platform/caseReview/caseReviewExport.js';
import { CASE_PROVENANCE_LABEL } from '../../../platform/caseReview/caseProvenance.js';
import { day, pct, when } from './CaseReviewParts.jsx';

/*
 * PRINT CASE REVIEW — the twelve sections of PRINT_SECTIONS, every one
 * expanded, black on white, tables instead of disclosures. Used for the
 * on-screen preview and, unchanged, for paper / PDF. The teacher's own next
 * steps print last, labelled as teacher-authored, apart from the generated
 * evidence.
 */

const SECTION_ORDER = ['warmup', 'classwork', 'practice', 'dol', 'assessment'];
const title = (key) => PRINT_SECTIONS.find((section) => section.key === key)?.title || key;
const label = (level) => CASE_PROVENANCE_LABEL[level] || level || '';

function SectionRows({ sections, caption }) {
  const rows = SECTION_ORDER.map((key) => sections.find((entry) => entry.key === key)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <table>
      <thead><tr><th>{caption}</th><th>Answered</th><th>Correct by final attempt</th><th>Mean credit</th><th>First-attempt correct</th></tr></thead>
      <tbody>
        {rows.map((entry) => (
          <tr key={entry.key}>
            <td>{entry.label}</td>
            <td>{entry.attempted} of {entry.questions}</td>
            <td>{pct(entry.finalCorrectRate)}</td>
            <td>{pct(entry.finalCreditAverage)}</td>
            <td>{pct(entry.firstAttemptAccuracy)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CasePrintView({ model, nextSteps = '' }) {
  const { meta, summary } = model;
  const snapshot = summary.snapshot;
  const supportSummary = model.supportEvidence.summary;
  const profile = model.supportEvidence.profile.current;
  const notLoaded = Object.values(model.dataSources).filter((source) => !source.loaded);
  return (
    <article className="cr-print-doc" data-case-print={meta.studentId}>
      <section>
        <h1>Student Case Review — Academic Evidence</h1>
        <h2>{title('overview')}</h2>
        <p>
          <strong>{meta.studentName}</strong> (ID {meta.studentId}) · {meta.className || 'No class'} · {meta.gradingPeriodLabel} · {meta.fromDateKey} to {meta.toDateKey}
          {meta.assignmentFilter ? ` · ${meta.assignmentFilter.length} selected assignment${meta.assignmentFilter.length === 1 ? '' : 's'}` : ''}
        </p>
        <p>Generated {when(model.generatedAtMs)}{meta.generatedByEmail ? ` by ${meta.generatedByEmail}` : ''}. A factual summary of MathMaster records — not a compliance determination, not a diagnosis, and not the official gradebook.</p>
      </section>

      <section>
        <h2>{title('academic')}</h2>
        <p>
          Assigned {snapshot.assigned} · started {snapshot.started} · completed {snapshot.completed} · incomplete {snapshot.incomplete} · missing {snapshot.missing}
          {' '}· completed after the student&apos;s due date {snapshot.completedLate} · excused {snapshot.excused} · Standard {snapshot.standardCount} / Modified {snapshot.modifiedCount}.
        </p>
        <p>
          MathMaster grade contributions on completed work: Standard {pct(snapshot.performance.standard.average)} over {snapshot.performance.standard.count};
          {' '}Modified {pct(snapshot.performance.modified.average)} over {snapshot.performance.modified.count}. {snapshot.performance.note}
        </p>
        <p>
          {snapshot.officialSis
            ? `Imported gradebook snapshot average: ${snapshot.officialSis.average} (${label('imported-sis')}${snapshot.officialSis.fileName ? `, ${snapshot.officialSis.fileName}` : ''}).`
            : 'No official gradebook snapshot is imported.'}
        </p>
        <ul>
          {['score', 'completion', 'dol', 'firstAttempt'].map((name) => {
            const trend = summary.trends[name];
            const names = { score: 'Completed-work grade', completion: 'Completed on time', dol: 'DOL grade', firstAttempt: 'First-attempt accuracy' };
            return (
              <li key={name}>
                {names[name]}: {trend.determinable
                  ? `earlier half ${trend.earlier}%, later half ${trend.later}% (${trend.direction === 'similar' ? 'similar' : `${trend.direction} by ${Math.abs(trend.change)} points`})`
                  : trend.note}
              </li>
            );
          })}
        </ul>
        <p>{summary.trends.note}</p>
      </section>

      <section>
        <h2>{title('grades')}</h2>
        <table>
          <thead>
            <tr><th>Assignment</th><th>Condition</th><th>Class due</th><th>Individualized due</th><th>Status</th><th>Completed on</th><th>MathMaster grade contribution</th><th>Export</th></tr>
          </thead>
          <tbody>
            {model.assignments.map((entry) => (
              <tr key={entry.assignmentId}>
                <td>{entry.title}<br />{entry.type}</td>
                <td>{entry.condition.value === 'modified' ? 'Modified' : 'Standard'}</td>
                <td>{day(entry.classDueAtMs)}</td>
                <td>{entry.individualizedDueAtMs ? day(entry.individualizedDueAtMs) : '—'}</td>
                <td>{entry.statusLabel}{entry.completedLate ? ' (after due)' : ''}</td>
                <td>{entry.completedAtMs ? `${when(entry.completedAtMs)} (${label(entry.completedAtProvenance)})` : '—'}</td>
                <td>
                  {entry.gradeItems.map((item) => `${item.label}: ${gradeItemLabel(item) || '—'}`).join(' · ')}
                  {entry.credits.practicePass ? ' · Practice Pass' : ''}
                  {entry.credits.assignmentOverride || entry.credits.questionOverrides ? ' · teacher override' : ''}
                </td>
                <td>{entry.exportSummary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{model.assignments[0]?.weightPolicy || ''}</p>
      </section>

      <section>
        <h2>{title('sections')}</h2>
        <SectionRows sections={summary.sections.standard} caption="Standard (grade-level)" />
        {summary.sections.modified.length > 0 && <SectionRows sections={summary.sections.modified} caption="Modified" />}
      </section>

      <section>
        <h2>{title('dol')}</h2>
        <ul>{model.sectionComparisonLines.map((line) => <li key={line}>{line}</li>)}</ul>
        {model.sectionComparison.assignmentsWithDolGap.length > 0 && (
          <table>
            <thead><tr><th>Assignment</th><th>Classwork + Practice</th><th>DOL</th><th>Difference</th></tr></thead>
            <tbody>
              {model.sectionComparison.assignmentsWithDolGap.map((row) => (
                <tr key={row.assignmentId}><td>{row.title}</td><td>{row.instructional}% over {row.instructionalAttempted}</td><td>{row.dol}% over {row.dolAttempted}</td><td>{row.difference} points</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p>{model.sectionComparison.note}</p>
      </section>

      <section>
        <h2>{title('skills')}</h2>
        {[
          ['Comparatively strongest', model.skills.findings.strongest],
          ['Needs additional instruction', model.skills.findings.needsInstruction],
          ['Persistent errors', model.skills.findings.persistentError],
          ['Improvement after retries', model.skills.findings.improvedAfterRetry],
        ].map(([heading, entries]) => (
          <p key={heading}><strong>{heading}:</strong> {entries.length ? entries.map((entry) => `${entry.code} (${entry.reason})`).join('; ') : 'none meets the rule'}</p>
        ))}
        {model.skills.skills.length > 0 && (
          <table>
            <thead><tr><th>Standard</th><th>Answered (grade-level)</th><th>Final accuracy</th><th>First attempt</th><th>DOL</th><th>Modified work</th></tr></thead>
            <tbody>
              {model.skills.skills.map((skill) => (
                <tr key={skill.code}>
                  <td>{skill.code}</td>
                  <td>{skill.byCondition.standard.attempted}</td>
                  <td>{pct(skill.byCondition.standard.finalCreditAverage)}</td>
                  <td>{pct(skill.byCondition.standard.firstAttemptAccuracy)}</td>
                  <td>{skill.dol.attempted ? pct(skill.dol.finalCreditAverage) : '—'}</td>
                  <td>{skill.byCondition.modified.attempted ? `${pct(skill.byCondition.modified.finalCreditAverage)} over ${skill.byCondition.modified.attempted}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>{model.skills.rules.note}</p>
      </section>

      <section>
        <h2>{title('attempts')}</h2>
        <p>Grade-level work: {model.attemptSummaryText.standard}</p>
        {model.attemptSummaryText.modified && <p>Modified work: {model.attemptSummaryText.modified}</p>}
        <p>{model.errorPatterns.statement}</p>
        {model.errorPatterns.codes.length > 0 && <ul>{model.errorPatterns.codes.map((entry) => <li key={entry.code}>{entry.description}</li>)}</ul>}
        {model.attention.exhaustedQuestions.length > 0 && (
          <table>
            <thead><tr><th>Not correct after all available attempts</th><th>Question</th><th>Standards</th><th>Attempts</th></tr></thead>
            <tbody>
              {model.attention.exhaustedQuestions.map((entry) => (
                <tr key={`${entry.assignmentId}-${entry.storageIndex}`}><td>{entry.title}</td><td>{entry.section} {entry.number}</td><td>{entry.standards.join(', ') || '—'}</td><td>{entry.attempts}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {model.attention.exhaustedTotal > model.attention.exhaustedQuestions.length && <p>{model.attention.exhaustedTotal} in all; the questions CSV lists every question.</p>}
      </section>

      <section>
        <h2>{title('completion')}</h2>
        <table>
          <thead><tr><th>Assignment</th><th>Opened</th><th>Completed on</th><th>Resumed</th><th>Reopened</th><th>Active time</th><th>Practice Mode</th></tr></thead>
          <tbody>
            {model.completion.assignments.map((row) => (
              <tr key={row.assignmentId}>
                <td>{row.title}</td>
                <td>{row.opened.recorded ? (row.opened.firstAtMs ? day(row.opened.firstAtMs) : 'Yes') : 'No open record'}</td>
                <td>{row.completedAt ? when(row.completedAt.atMs) : '—'}</td>
                <td>{row.resumed === null ? 'Not determinable' : row.resumed ? 'Yes' : 'No'}</td>
                <td>{[row.reopened.attendanceExtension ? 'Attendance extension' : '', ...row.reopened.recoveries.map((recovery) => `${recovery.section === 'dol' ? 'DOL' : 'Warm-Up'} Recovery`)].filter(Boolean).join(', ') || '—'}</td>
                <td>{row.time.activeMinutes !== null ? `${row.time.activeMinutes} min (${label(row.time.activeProvenance)})` : 'Not recorded'}</td>
                <td>{row.practiceMode.loaded === false ? 'Not loaded' : row.practiceMode.recorded ? `${row.practiceMode.questionsPracticed} questions` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>&quot;No open record&quot; is not &quot;never opened&quot;: MathMaster does not record every open. Practice Mode time is not recorded.</p>
      </section>

      <section>
        <h2>{title('supports')}</h2>
        <p>
          {profile
            ? `Support profile in effect: ${model.supportEvidence.profile.status === 'unversioned' ? 'recorded before versioning' : `revision ${profile.revision}, effective ${profile.effectiveStart}`}. Accommodations: ${profile.accommodations.map((entry) => entry.label).join('; ') || 'none'}. Modifications: ${profile.modifications.map((entry) => entry.label).join('; ') || 'none'}.`
            : 'No support profile is recorded in MathMaster for this period.'}
        </p>
        {supportSummary.supports.length > 0 && (
          <table>
            <thead><tr><th>Support</th><th>Configured</th><th>Assignments available</th><th>Assignments provided</th><th>Uses</th><th>Staff documented</th></tr></thead>
            <tbody>
              {supportSummary.supports.map((support) => (
                <tr key={support.supportId}>
                  <td>{support.label}</td>
                  <td>{support.configured ? 'Yes' : 'No'}</td>
                  <td>{support.measurable.includes('available') ? support.assignmentsAvailable : 'n/a'}</td>
                  <td>{support.measurable.includes('provided') ? support.assignmentsProvided : 'n/a'}</td>
                  <td>{support.measurable.includes('used') ? support.uses : 'n/a'}</td>
                  <td>{support.staffRecords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>Service time recorded by staff in MathMaster: {model.supportEvidence.service.totalMinutes} minutes. Configured, available, provided, used and staff-documented are separate records; academic results are never used to infer whether a support was provided.</p>
      </section>

      <section>
        <h2>{title('gaps')}</h2>
        <ul>{model.evidenceGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        {notLoaded.length > 0 && <p>Not loaded for this case review: {notLoaded.map((source) => source.label).join('; ')}.</p>}
        <p><strong>Provenance:</strong> {model.legend.provenance.map((entry) => `${entry.term} — ${entry.meaning}`).join(' ')}</p>
        <ul>{model.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>

      <section>
        <h2>{title('facts')}</h2>
        <ul>
          {model.narrativeFacts.map((fact) => (
            <li key={fact.key}>{fact.text} <em>[{label(fact.provenance)}{fact.sources?.length ? ` — ${fact.sources.map((source) => source.label).join('; ')}` : ''}]</em></li>
          ))}
        </ul>
      </section>

      <section data-teacher-authored>
        <h2>{title('nextSteps')}</h2>
        <p><em>{TEACHER_AUTHORED_LABEL}</em></p>
        {nextSteps.trim()
          ? <div style={{ whiteSpace: 'pre-wrap' }}>{nextSteps.trim()}</div>
          : <p>None entered.</p>}
      </section>
    </article>
  );
}
