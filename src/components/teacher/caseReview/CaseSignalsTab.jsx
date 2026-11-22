import { TEACHER_NOTE_HEADING } from '../../../platform/teacher/attemptSignalsView.js';
import { EmptyNote, pct, when } from './CaseReviewParts.jsx';

/*
 * WORK-PATTERN SIGNALS — recorded facts about attempts, over the case's
 * window: how often each occurs, how the questions with one were marked beside
 * those without, and where they occur. Counts side by side, never why, and
 * labelled not conclusive (platform/caseReview/workPatternSignals.js).
 */

const KIND_COLUMNS = [
  { kind: 'leftThenRight', label: 'Left the page, then right parts' },
  { kind: 'pasted', label: 'Pasted into a math box' },
  { kind: 'hardFirstTry', label: 'Right first time, hard, no tool work' },
];

export default function CaseSignalsTab({ model, onOpenQuestion = null }) {
  const section = model.workPatterns;
  if (!section?.loaded) {
    return (
      <section className="cr-section" aria-labelledby="cr-signals">
        <h2 id="cr-signals">Work-pattern signals</h2>
        <EmptyNote>The student&apos;s signal records could not be loaded for this case review. That is a missing read, not an absence of signals.</EmptyNote>
      </section>
    );
  }
  const { comparison } = section;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-signals" data-case-work-patterns>
        <h2 id="cr-signals">Work-pattern signals ({section.total}) <span className="cr-note" data-not-conclusive="">· {section.notConclusive}</span></h2>
        <p className="cr-note">{section.note}</p>
        {section.total ? (
          <ul className="cr-lines" data-case-signal-lines>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        ) : (
          <EmptyNote>No signal is recorded in this window. {section.denominator.words}</EmptyNote>
        )}
        {section.capped && <p className="cr-note" role="status" data-case-signals-capped>{section.cappedNote}</p>}
      </section>

      {section.total > 0 && (
        <>
          <section className="cr-section" aria-labelledby="cr-signals-frequency">
            <h2 id="cr-signals-frequency">How often</h2>
            <div className="cr-scroll-x" role="region" aria-label="How often each signal occurs" tabIndex={0}>
              <table className="cr-table" aria-label="How often each signal occurs">
                <thead><tr><th>Signal</th><th>Answered questions with it</th><th>Of answered</th><th>Share</th><th>Reviewed</th></tr></thead>
                <tbody>
                  {section.frequency.map((row) => (
                    <tr key={row.kind}>
                      <td>{row.title}</td>
                      <td className="cr-num">{row.questions}</td>
                      <td className="cr-num">{row.answered}</td>
                      <td className="cr-num">{pct(row.share)}</td>
                      <td className="cr-num">{row.reviewed} of {row.signals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {section.byMonth.length > 0 && (
            <section className="cr-section" aria-labelledby="cr-signals-months">
              <h2 id="cr-signals-months">Month by month</h2>
              <div className="cr-scroll-x" role="region" aria-label="Signals by month" tabIndex={0}>
                <table className="cr-table" aria-label="Signals by month" data-case-signal-months>
                  <thead><tr><th>Month</th><th>Answers counted</th><th>Answers with a signal</th>{KIND_COLUMNS.map((column) => <th key={column.kind}>{column.label}</th>)}</tr></thead>
                  <tbody>
                    {section.byMonth.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td className="cr-num">{row.answered}</td>
                        <td className="cr-num">{row.questionsWithSignal} of {row.answered}{row.share === null ? '' : ` (${row.share}%)`}</td>
                        {KIND_COLUMNS.map((column) => <td key={column.kind} className="cr-num">{row.byKind[column.kind] || 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cr-note" data-case-signal-denominator>{section.denominator.words}</p>
            </section>
          )}

          <section className="cr-section" aria-labelledby="cr-signals-marking">
            <h2 id="cr-signals-marking">How the questions were marked</h2>
            <div className="cr-scroll-x" role="region" aria-label="Questions with a signal beside those without" tabIndex={0}>
              <table className="cr-table" aria-label="Questions with a signal beside those without">
                <thead><tr><th>Answered questions</th><th>Count</th><th>First-attempt correct</th><th>Final accuracy</th></tr></thead>
                <tbody>
                  <tr><td>With a signal</td><td className="cr-num">{comparison.withSignal.answered}</td><td className="cr-num">{pct(comparison.withSignal.firstAttemptAccuracy)}</td><td className="cr-num">{pct(comparison.withSignal.finalCreditAverage)}</td></tr>
                  <tr><td>Without a signal</td><td className="cr-num">{comparison.withoutSignal.answered}</td><td className="cr-num">{pct(comparison.withoutSignal.firstAttemptAccuracy)}</td><td className="cr-num">{pct(comparison.withoutSignal.finalCreditAverage)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="cr-note">Two counts side by side. &ldquo;Right first time on a hard question&rdquo; is by its own rule a question marked right, so the first row is not a like-for-like sample of the second.</p>
          </section>

          <section className="cr-section" aria-labelledby="cr-signals-where">
            <h2 id="cr-signals-where">Where they occur</h2>
            <div className="cr-scroll-x" role="region" aria-label="Signals by section" tabIndex={0}>
              <table className="cr-table" aria-label="Signals by section">
                <thead><tr><th>Section</th><th>Answered</th><th>Questions with a signal</th>{KIND_COLUMNS.map((column) => <th key={column.kind}>{column.label}</th>)}</tr></thead>
                <tbody>
                  {section.bySection.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td className="cr-num">{row.answered}</td>
                      <td className="cr-num">{row.questionsWithSignal}{row.share === null ? '' : ` (${row.share}%)`}</td>
                      {KIND_COLUMNS.map((column) => <td key={column.kind} className="cr-num">{row.byKind[column.kind] || 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cr-note">
              Class time, as each record says: {section.classTime.during} during the class&apos;s scheduled time, {section.classTime.outside} outside it, {section.classTime.notKnown} not known
              (the bell schedule could not say). The DOL and instructional sections are compared on the &ldquo;DOL vs instruction&rdquo; tab.
            </p>
          </section>

          <section className="cr-section" aria-labelledby="cr-signals-list">
            <h2 id="cr-signals-list">Each signal</h2>
            <div className="cr-scroll-x" role="region" aria-label="Each recorded signal" tabIndex={0}>
              <table className="cr-table" aria-label="Each recorded signal" data-case-signal-rows>
                <thead><tr><th>When</th><th>Assignment and question</th><th>What was recorded</th><th>Class time and supports</th><th>Marked</th><th>Review</th></tr></thead>
                <tbody>
                  {section.entries.map((entry) => (
                    <tr key={entry.id} data-attempt-signal={entry.kind}>
                      <td>{when(entry.recordedAtMs)}</td>
                      <td>
                        {entry.assignmentTitle || entry.assignmentId}<br />
                        {onOpenQuestion
                          ? <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => onOpenQuestion(entry.assignmentId, entry.questionIndex)}>{entry.questionLabel}</button>
                          : entry.questionLabel}
                        {entry.partIndex === null ? '' : ` · part ${entry.partIndex + 1}`}
                      </td>
                      <td><strong>{entry.title}</strong> <span className="cr-note">({section.notConclusive.toLowerCase()})</span><br />{entry.facts}</td>
                      <td>{[entry.classTime, entry.supports || 'Supports not recorded'].join(' · ')}</td>
                      <td>{entry.outcomeLabel || '—'}</td>
                      <td>
                        {entry.reviewed
                          ? <>Reviewed{entry.reviewedBy ? ` by ${entry.reviewedBy}` : ''}{entry.reviewedAtMs ? ` · ${when(entry.reviewedAtMs)}` : ''}{entry.reviewNote ? <><br /><span data-teacher-note="" title={entry.reviewNoteLabel}><em>{TEACHER_NOTE_HEADING}:</em> {entry.reviewNote}</span></> : null}</>
                          : 'Not yet reviewed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="cr-section" aria-labelledby="cr-signals-limits">
        <h2 id="cr-signals-limits">What these records cannot show</h2>
        <ul className="cr-lines">{section.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
    </>
  );
}
