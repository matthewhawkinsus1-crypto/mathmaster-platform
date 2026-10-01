import { CASE_PROVENANCE } from '../../../platform/caseReview/caseProvenance.js';
import { EmptyNote, Prov, Tile, pct } from './CaseReviewParts.jsx';

/*
 * EXECUTIVE CASE SUMMARY — the first page, readable without raw logs.
 * Academic snapshot · performance by section (Standard and Modified apart) ·
 * factual trends · a short "needs attention" preview.
 */

const SECTION_ORDER = ['warmup', 'classwork', 'practice', 'dol', 'assessment'];

function SectionTable({ sections, caption }) {
  const rows = SECTION_ORDER.map((key) => sections.find((entry) => entry.key === key)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="cr-scroll-x">
      <table className="cr-table" aria-label={caption}>
        <thead><tr><th>{caption}</th><th>Items answered</th><th>Correct by final attempt</th><th>Mean credit</th><th>First-attempt correct</th></tr></thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.key}>
              <td>{entry.label}</td>
              <td className="cr-num">{entry.attempted} of {entry.questions}</td>
              <td className="cr-num">{pct(entry.finalCorrectRate)}</td>
              <td className="cr-num">{pct(entry.finalCreditAverage)}</td>
              <td className="cr-num">{pct(entry.firstAttemptAccuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TREND_LABEL = { score: 'Completed-work grade', completion: 'Completed on time', dol: 'DOL grade', firstAttempt: 'First-attempt accuracy' };

function TrendLine({ name, trend }) {
  if (!trend?.determinable) return <li><strong>{TREND_LABEL[name]}:</strong> <span className="cr-note">{trend?.note || 'Not enough dated values.'}</span></li>;
  return (
    <li>
      <strong>{TREND_LABEL[name]}:</strong> earlier half {trend.earlier}%, later half {trend.later}% ({trend.direction === 'similar' ? 'similar' : `${trend.direction} by ${Math.abs(trend.change)} points`}) over {trend.points} values
    </li>
  );
}

export default function CaseSummaryTab({ model, onOpenTab }) {
  const snapshot = model.summary.snapshot;
  const attention = model.attention;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-summary-snapshot">
        <h2 id="cr-summary-snapshot">Academic snapshot</h2>
        <div className="cr-tiles">
          <Tile value={snapshot.assigned} label="assigned in this selection" prov={CASE_PROVENANCE.DIRECT} />
          <Tile value={snapshot.started} label="started (an answer recorded)" prov={CASE_PROVENANCE.DERIVED} />
          <Tile value={snapshot.completed} label="completed (every question answered)" prov={CASE_PROVENANCE.DERIVED} />
          <Tile value={snapshot.incomplete} label="incomplete (partly answered)" prov={CASE_PROVENANCE.DERIVED} />
          <Tile value={snapshot.missing} label="missing (no answers, past final cutoff)" prov={CASE_PROVENANCE.DERIVED} />
          <Tile value={snapshot.completedLate} label="completed after the student's due date" prov={CASE_PROVENANCE.DERIVED} />
          <Tile value={snapshot.excused} label="excused" />
          <Tile value={`${snapshot.standardCount} / ${snapshot.modifiedCount}`} label="Standard / Modified work" />
        </div>
        <div className="cr-grid-2">
          <div className="cr-card">
            <h3>MathMaster picture (completed work)</h3>
            <p className="cr-note" style={{ margin: 0 }}>
              Standard: <strong>{pct(snapshot.performance.standard.average)}</strong> over {snapshot.performance.standard.count}
              {' · '}Modified: <strong>{pct(snapshot.performance.modified.average)}</strong> over {snapshot.performance.modified.count}
            </p>
            <p className="cr-note">{snapshot.performance.note}</p>
          </div>
          <div className="cr-card">
            <h3>Official gradebook</h3>
            {snapshot.officialSis
              ? <p className="cr-note" style={{ margin: 0 }}>Imported snapshot average: <strong>{snapshot.officialSis.average}</strong> <Prov level={CASE_PROVENANCE.SIS} /></p>
              : <EmptyNote>No gradebook snapshot imported. MathMaster grade contributions are not the official average.</EmptyNote>}
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenTab('gradebook')}>Official grade reconciliation</button>
          </div>
          <div className="cr-card">
            <h3>Active time</h3>
            <p className="cr-note" style={{ margin: 0 }}>
              Server-timed: <strong>{snapshot.activeTime.serverMinutes} min</strong> on {snapshot.activeTime.serverAssignments} assignment{snapshot.activeTime.serverAssignments === 1 ? '' : 's'} <Prov level={CASE_PROVENANCE.DIRECT} />
            </p>
            {snapshot.activeTime.browserAssignments > 0 && <p className="cr-note" style={{ margin: 0 }}>Browser-counted (earlier method): {snapshot.activeTime.browserMinutes} min on {snapshot.activeTime.browserAssignments} <Prov level={CASE_PROVENANCE.LEGACY} /></p>}
            {snapshot.activeTime.notRecorded > 0 && <p className="cr-note" style={{ margin: 0 }}>Not recorded for {snapshot.activeTime.notRecorded} assignment{snapshot.activeTime.notRecorded === 1 ? '' : 's'} with work <Prov level={CASE_PROVENANCE.NOT_RECORDED} /></p>}
          </div>
        </div>
      </section>

      <section className="cr-section" aria-labelledby="cr-summary-sections">
        <h2 id="cr-summary-sections">Performance by section</h2>
        <p className="cr-note">Each question counted once, pooled across the selection. Standard and Modified work are shown separately and never combined.</p>
        <SectionTable sections={model.summary.sections.standard} caption="Standard (grade-level) work" />
        {model.summary.sections.modified.length > 0 && <SectionTable sections={model.summary.sections.modified} caption="Modified work" />}
        {model.sectionComparison.assessments.length > 0 && (
          <p className="cr-note">Quiz / Test recorded grades: {model.sectionComparison.assessments.map((entry) => `${entry.title} ${pct(entry.score)}`).join(' · ')}</p>
        )}
      </section>

      <section className="cr-section" aria-labelledby="cr-summary-trends">
        <h2 id="cr-summary-trends">Trends in the selected period</h2>
        <ul className="cr-lines">
          {Object.keys(TREND_LABEL).map((name) => <TrendLine key={name} name={name} trend={model.summary.trends[name]} />)}
        </ul>
        <p className="cr-note">{model.summary.trends.note}</p>
      </section>

      <section className="cr-section" aria-labelledby="cr-summary-attention">
        <h2 id="cr-summary-attention">Needs attention (preview)</h2>
        <ul className="cr-lines">
          <li>{attention.incomplete.length} incomplete or missing assignment{attention.incomplete.length === 1 ? '' : 's'}</li>
          <li>{attention.skillsBreakingDown.length ? `Skills that repeatedly break down: ${attention.skillsBreakingDown.map((entry) => entry.code).join(', ')}` : 'No grade-level skill meets the breakdown rules'}</li>
          <li>{attention.exhaustedTotal} question{attention.exhaustedTotal === 1 ? '' : 's'} not correct after all available attempts</li>
          <li>{attention.recoverable.length} item{attention.recoverable.length === 1 ? '' : 's'} of work still open for this student</li>
        </ul>
        <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenTab('attention')}>Open "What needs attention?"</button>
      </section>
    </>
  );
}
