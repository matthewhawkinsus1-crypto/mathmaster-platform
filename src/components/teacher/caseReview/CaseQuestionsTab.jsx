import { useState } from 'react';
import { CASE_PROVENANCE, CASE_PROVENANCE_LABEL } from '../../../platform/caseReview/caseProvenance.js';
import { QUESTION_OUTCOME } from '../../../platform/caseReview/attemptAnalysis.js';
import { errorPatternForQuestion, isNamedPart } from '../../../platform/caseReview/errorPatterns.js';
import { supportLabel } from '../../../../functions/shared/supportCatalog.mjs';
import { AttemptChips, ConditionTag, EmptyNote, Prov, pct, when } from './CaseReviewParts.jsx';

/*
 * QUESTION / ATTEMPT EVIDENCE — summary first, then one assignment, then one
 * question. The case review never shows a response or an answer key; the
 * question view opens the existing Response Inspector for the latest
 * attempt's exact response, under that tool's own authorization.
 */

const PAGE_SIZE = 25;

const OUTCOME_KIND = {
  [QUESTION_OUTCOME.CORRECT_FIRST]: 'good',
  [QUESTION_OUTCOME.CORRECTED_AFTER_RETRY]: 'good',
  [QUESTION_OUTCOME.EXHAUSTED]: 'bad',
  [QUESTION_OUTCOME.LEFT_WITH_ATTEMPTS]: 'warn',
  [QUESTION_OUTCOME.OPEN_INCORRECT]: 'warn',
};

const ATTEMPTS_SOURCE_LABEL = {
  'evidence-events': 'Each attempt from a server record',
  mixed: 'Some attempts from server records, the rest derived',
  'derived-from-record': 'Derived from the question record (no per-attempt record)',
  none: 'No attempts',
};

function Overview({ model, onDrill }) {
  const errorPatterns = model.errorPatterns;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-attempts-summary">
        <h2 id="cr-attempts-summary">Attempts and retries</h2>
        <p className="cr-lead"><strong>Grade-level work:</strong> {model.attemptSummaryText.standard}</p>
        {model.attemptSummaryText.modified && <p className="cr-lead"><strong>Modified work:</strong> {model.attemptSummaryText.modified}</p>}
        <ul className="cr-lines">
          <li>Average attempts per finished question: {model.attemptSummaryByCondition.standard.averageAttemptsPerFinishedQuestion ?? '—'} (grade-level)</li>
          <li>First-attempt correct {pct(model.attemptSummaryByCondition.standard.firstAttemptAccuracy)} → correct by the final attempt {pct(model.attemptSummaryByCondition.standard.finalCorrectRate)} (grade-level)</li>
          <li>Questions answered again on a later visit (30+ minutes apart): {model.attemptSummary.returnedQuestions} of {model.attemptSummary.returnDeterminable} with dated attempts</li>
        </ul>
        <p className="cr-note">Counts only. They describe the records, not motivation, perseverance, ability or disability.</p>
      </section>
      <section className="cr-section" aria-labelledby="cr-attempts-by-assignment">
        <h2 id="cr-attempts-by-assignment">By assignment</h2>
        <div className="cr-scroll-x">
          <table className="cr-table">
            <thead><tr><th>Assignment</th><th>Condition</th><th>Answered</th><th>First attempt</th><th>Corrected later</th><th>Not correct after all attempts</th><th>Left with attempts</th><th>Skipped / not attempted</th><th>Attempt record</th></tr></thead>
            <tbody>
              {model.assignments.filter((row) => !row.isTestCycle).map((row) => {
                const summary = row.attemptSummary;
                return (
                  <tr key={row.assignmentId} data-clickable="true" onClick={() => onDrill({ assignmentId: row.assignmentId })}>
                    <td><button type="button" className="cr-linkish" onClick={(event) => { event.stopPropagation(); onDrill({ assignmentId: row.assignmentId }); }}>{row.title}</button></td>
                    <td><ConditionTag value={row.condition.value} /></td>
                    <td className="cr-num">{summary.scored} of {summary.questions}</td>
                    <td className="cr-num">{summary.firstAttemptCorrect}</td>
                    <td className="cr-num">{summary.correctedAfterRetry}</td>
                    <td className="cr-num">{summary.exhausted}</td>
                    <td className="cr-num">{summary.leftWithAttempts + summary.openIncorrect}</td>
                    <td className="cr-num">{summary.skipped + summary.notAttempted}</td>
                    <td>{summary.attemptsFromEvents ? `${summary.attemptsFromEvents} from server records` : ''}{summary.attemptsDerived ? `${summary.attemptsFromEvents ? ' · ' : ''}${summary.attemptsDerived} derived` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cr-section" aria-labelledby="cr-error-patterns">
        <h2 id="cr-error-patterns">Error patterns</h2>
        <p className="cr-lead"><strong>{errorPatterns.statement}</strong> {errorPatterns.determinable ? <Prov level={CASE_PROVENANCE.DIRECT} /> : <Prov level={CASE_PROVENANCE.NOT_RECORDED} />}</p>
        {errorPatterns.codes.length > 0 && <ul className="cr-lines">{errorPatterns.codes.map((entry) => <li key={entry.code}>{entry.label}: {entry.questions} question{entry.questions === 1 ? '' : 's'}</li>)}</ul>}
        {errorPatterns.notCorrectParts.length > 0 && (
          <>
            <p className="cr-note">{errorPatterns.partNote}</p>
            <ul className="cr-lines">{errorPatterns.notCorrectParts.slice(0, 8).map((entry) => <li key={entry.label}>“{entry.label}” marked not correct on {entry.questions} question{entry.questions === 1 ? '' : 's'}</li>)}</ul>
          </>
        )}
      </section>
    </>
  );
}

function AssignmentQuestions({ entry, onDrill }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entry.questions.length / PAGE_SIZE));
  const visible = entry.questions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  return (
    <section className="cr-section" aria-labelledby="cr-assignment-questions" data-case-assignment-detail={entry.assignmentId}>
      <h2 id="cr-assignment-questions">{entry.title} — question evidence</h2>
      <p className="cr-note">{entry.questions.length} current question{entry.questions.length === 1 ? '' : 's'} · <ConditionTag value={entry.condition.value} /> · Open a question for its attempts. Responses and answer keys are not shown here.</p>
      {entry.isTestCycle && <EmptyNote>Secure test items are graded by the secure Test Cycle; MathMaster keeps the recorded grade, not question-level attempts, for them.</EmptyNote>}
      <div className="cr-scroll-x">
        <table className="cr-table">
          <thead><tr><th>Question</th><th>Standards</th><th>Type</th><th>Attempts</th><th>Outcome</th><th>Final credit</th><th>Last answer</th></tr></thead>
          <tbody>
            {visible.map((question) => (
              <tr key={question.storageIndex} data-clickable="true" data-case-question={question.storageIndex} onClick={() => onDrill({ assignmentId: entry.assignmentId, storageIndex: question.storageIndex })}>
                <td><button type="button" className="cr-linkish" onClick={(event) => { event.stopPropagation(); onDrill({ assignmentId: entry.assignmentId, storageIndex: question.storageIndex }); }}>{question.sectionLabel} Q{question.sectionNumber}</button></td>
                <td>{question.standards.primary.join(', ') || <span className="cr-note">none in metadata</span>}</td>
                <td>{question.questionType}</td>
                <td><AttemptChips attempts={question.attempts} /> <span className="cr-note">of {question.maxAttempts}</span></td>
                <td><span className="cr-tag" data-kind={OUTCOME_KIND[question.outcome] || ''}>{question.outcomeLabel}</span></td>
                <td className="cr-num">{question.finalCredit === null ? '—' : `${question.finalCredit}%`}{question.teacherOverride ? ` → ${question.gradedCredit}% (override)` : ''}</td>
                <td>{question.lastAttemptAtMs ? <>{when(question.lastAttemptAtMs)} <Prov level={question.lastAttemptTimeProvenance} /></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="cr-pager">
          <button type="button" className="tw-btn tw-btn--sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="tw-btn tw-btn--sm" disabled={page >= pages - 1} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

function QuestionDetail({ entry, question, studentId, onInspectResponse }) {
  const pattern = errorPatternForQuestion(question);
  const namedParts = question.latestParts.filter((part) => isNamedPart(part.label));
  return (
    <section className="cr-section" aria-labelledby="cr-question-detail" data-case-question-detail={question.storageIndex}>
      <h2 id="cr-question-detail">{entry.title} — {question.sectionLabel} Q{question.sectionNumber}</h2>
      <dl className="cr-dl">
        <div><dt>Section</dt><dd>{question.sectionLabel}</dd></div>
        <div><dt>Question / family</dt><dd>{question.questionId || '—'}{question.familyId ? ` · family ${question.familyId}` : ''}</dd></div>
        <div><dt>Standard / skill</dt><dd>{question.standards.primary.join(', ') || 'None in metadata'}{question.standardsSource === 'platform-inferred' ? ' (platform-inferred)' : question.standardsSource === 'attempt-evidence' ? ' (from attempt records)' : ''}</dd></div>
        <div><dt>Type</dt><dd>{question.questionType}{question.dok ? ` · DOK ${question.dok}` : ''}</dd></div>
        <div><dt>Attempts allowed</dt><dd>{question.maxAttempts}{question.replacements ? ` · ${question.replacements} replacement question${question.replacements === 1 ? '' : 's'}` : ''}</dd></div>
        <div><dt>Outcome</dt><dd>{question.outcomeLabel}</dd></div>
        <div><dt>Final credit (student&apos;s attempts)</dt><dd>{question.finalCredit === null ? '—' : `${question.finalCredit}%`}</dd></div>
        <div><dt>Graded credit</dt><dd>{question.gradedCredit === null ? '—' : `${question.gradedCredit}%`}{question.teacherOverride ? ' (teacher override)' : ''}</dd></div>
        <div><dt>Improved on a later attempt</dt><dd>{question.improved ? 'Yes' : 'No'}</dd></div>
        <div><dt>Answered again on a later visit</dt><dd>{question.repeatedReturn === null ? 'Not determinable (no dated attempts)' : (question.repeatedReturn ? 'Yes' : 'No')}</dd></div>
      </dl>
      <h3>Attempts <span className="cr-note">· {ATTEMPTS_SOURCE_LABEL[question.attemptsSource]}</span></h3>
      {question.attempts.length ? (
        <div className="cr-scroll-x">
          <table className="cr-table">
            <thead><tr><th>Attempt</th><th>Result</th><th>Partial credit</th><th>Time</th><th>Tools on this attempt</th><th>How known</th></tr></thead>
            <tbody>
              {question.attempts.map((attempt) => (
                <tr key={attempt.number}>
                  <td>{attempt.number}</td>
                  <td>{attempt.result === 'not-correct' ? 'Not correct' : attempt.result[0].toUpperCase() + attempt.result.slice(1)}</td>
                  <td>{Number.isFinite(attempt.partialCredit) ? `${attempt.partialCredit}%` : 'Not recorded'}</td>
                  <td>{Number.isFinite(attempt.atMs) ? when(attempt.atMs) : 'Not recorded'}</td>
                  <td>{attempt.provenance === CASE_PROVENANCE.DIRECT ? (attempt.supports.join(', ') || 'None recorded') : 'Not recorded'}</td>
                  <td><Prov level={attempt.provenance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyNote>No attempt is recorded for this question.</EmptyNote>}
      <p className="cr-note">
        {question.lastAttemptSupports.length ? `Last attempt flags: ${question.lastAttemptSupports.join(', ')} (set when the tool was used while the question was open). ` : ''}
        {question.supportUses.length ? `Support use recorded on this question: ${question.supportUses.map(supportLabel).join(', ')}. ` : ''}
        Last answer time: {question.lastAttemptAtMs ? `${when(question.lastAttemptAtMs)} (${CASE_PROVENANCE_LABEL[question.lastAttemptTimeProvenance]})` : 'not recorded'}.
      </p>
      <h3>Error pattern</h3>
      <p className="cr-lead">{pattern.determinable ? pattern.codes.map((code) => code.label).join(', ') : pattern.statement}</p>
      {namedParts.length > 0 && (
        <p className="cr-note">Latest attempt, as the grader recorded it: {namedParts.map((part) => `${part.label} ${part.isCorrect ? 'correct' : 'not correct'}`).join(' · ')}. A recorded result, not a diagnosis.</p>
      )}
      {question.attempts.length > 0 && onInspectResponse && (
        <div>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => onInspectResponse({ studentId, assignmentId: entry.assignmentId, questionIndex: question.storageIndex })}>
            Open Response Inspector (latest attempt)
          </button>
          <span className="cr-note"> Shows the exact latest response and the answer check, in the existing inspector.</span>
        </div>
      )}
    </section>
  );
}

export default function CaseQuestionsTab({ model, drill = {}, onDrill, onInspectResponse = null }) {
  const entry = drill.assignmentId ? model.assignments.find((row) => row.assignmentId === drill.assignmentId) : null;
  if (!entry) return <Overview model={model} onDrill={onDrill} />;
  const question = Number.isInteger(drill.storageIndex) ? entry.questions.find((row) => row.storageIndex === drill.storageIndex) : null;
  if (question) return <QuestionDetail entry={entry} question={question} studentId={model.meta.studentId} onInspectResponse={onInspectResponse} />;
  return <AssignmentQuestions key={entry.assignmentId} entry={entry} onDrill={onDrill} />;
}
