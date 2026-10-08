import React, { useEffect, useRef, useState } from 'react';
import MathDisplay from '../../MathDisplay.jsx';
import MathText from '../common/MathText.jsx';
import StandardBadge from '../common/StandardBadge.jsx';
import PathSolutionReview from '../student/PathSolutionReview.jsx';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';
import { getStudentSecureExamReview } from '../../services/secureExamService.js';
import { describeToolWork, rawToolWorkOf, toolWorkLabel } from '../../platform/assessment/secureToolWorkSummary.js';
import {
  RESULT_STATUS,
  answerIsLatex,
  describeReviewScore,
  groupReviewBySkill,
  notReachedNote,
  practiceTestScoreReport,
  reviewIsReleased,
  reviewItemResult,
  teksKeyOf,
} from '../../platform/assessment/secureExamResultsModel.js';

/*
 * RESULTS THAT TEACH.
 *
 * Every finished test ends here once its results are released — a course Test
 * or Retest when the teacher releases it, a practice test the moment it is
 * submitted. A score alone teaches nothing, so the screen shows, per question
 * in the order the student met them: the question, their answer (or "Left
 * blank"), whether it was right, the correct answer and the worked solution.
 * Above that: the score in words that agree with the number, how they did on
 * each skill (weakest first, each with a way to practise it), and for a
 * practice test what the score could mean on the real exam — as a range, with
 * how rough it is, and never as an official score.
 *
 * NOTHING HERE CAN APPEAR EARLY. The only data this screen ever renders is the
 * review `getStudentSecureExamReview` returns, and the server builds one only
 * for a finished session whose results are released (secureExam.publicReview).
 * `reviewIsReleased` checks those two facts again before anything is drawn.
 * The wording, grouping and estimate all come from secureExamResultsModel.js,
 * so they are tested without a browser.
 *
 * "Practise this skill" names where to go (`onPracticeSkill({ alignmentKey,
 * framework, domainId })`); the app decides how — My Math Path for a course
 * standard, College & Career practice for an exam domain. Without a handler the
 * buttons are not drawn, rather than drawn and dead. A course Test's skills
 * are named with the teacher's own blueprint labels when the card passes them
 * (`skillLabels`, the card's testSkills), so a standard is called the same
 * thing here as on the card and in Corrections.
 *
 * An answer typed in the math editor is stored as the editor's LaTeX, and is
 * drawn as mathematics (`answerIsLatex`), never as "\frac34".
 *
 * A screen of its own: when the results arrive, focus moves to their heading,
 * so a keyboard or screen-reader user starts at the top of what changed.
 */

const responseRows = (item) => {
  // A Rich Tool answer is a construction, read back in the student's values.
  const toolId = item?.pathToolId || item?.questionSnapshot?.pathToolId || null;
  if (toolId) {
    const rows = describeToolWork(toolId, rawToolWorkOf(item?.responsePayload));
    return rows.length
      ? rows.map((row) => ({ id: row.id, label: row.label, value: row.value }))
      : [{ id: 'tool', label: 'Your response', value: `Your work in the ${toolWorkLabel(toolId)} was recorded.` }];
  }
  const responses = item?.responsePayload?.responses && typeof item.responsePayload.responses === 'object'
    ? item.responsePayload.responses
    : {};
  const fields = Array.isArray(item?.questionSnapshot?.responseFields) ? item.questionSnapshot.responseFields : [];
  const choices = Array.isArray(item?.questionSnapshot?.choices) ? item.questionSnapshot.choices : [];
  return Object.entries(responses)
    .map(([fieldId, raw]) => {
      const field = fields.find((entry) => entry.id === fieldId);
      // A field's own choices first, as the server reads the correct answer.
      const fieldChoices = Array.isArray(field?.choices) && field.choices.length ? field.choices : choices;
      // A choice is stored as its runtime id; the student chose its words.
      const value = (Array.isArray(raw) ? raw : [raw])
        .map((entry) => fieldChoices.find((choice) => choice.id === entry)?.label || String(entry ?? '').trim())
        .filter(Boolean)
        .join(', ');
      return { id: fieldId, label: field?.label || 'Your response', value, math: answerIsLatex(value) };
    })
    .filter((row) => row.value);
};

const STATUS_TONE = {
  [RESULT_STATUS.CORRECT]: { border: 'var(--mm-success-border)', background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', mark: '✓ ' },
  [RESULT_STATUS.PARTIAL]: { border: 'var(--mm-warning-border)', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', mark: '' },
  [RESULT_STATUS.INCORRECT]: { border: 'var(--mm-error-border-soft)', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', mark: '' },
  [RESULT_STATUS.BLANK]: { border: 'var(--mm-border-strong)', background: 'var(--mm-surface-control)', color: 'var(--mm-text)', mark: '' },
};

const sectionCard = { background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 'clamp(16px, 4vw, 22px)' };
const eyebrow = { color: 'var(--mm-accent-text)', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.07em' };
const blockLabel = { display: 'block', marginBottom: 4, color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em' };
const answerBox = { marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)' };
const quietButton = { minHeight: 44, padding: '8px 14px', border: '1px solid var(--mm-border-strong)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' };

const answerValueStyle = { color: 'var(--mm-text-strong)', fontSize: 15, overflowWrap: 'anywhere' };

const AnswerRows = ({ rows }) => rows.map((row, index) => (
  <div key={row.id || index} style={{ display: 'grid', gridTemplateColumns: row.label ? 'minmax(90px, auto) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 10, alignItems: 'baseline', marginTop: index === 0 ? 0 : 6 }}>
    {row.label && <MathText style={{ color: 'var(--mm-text-muted)', fontSize: 12, fontWeight: 800 }}>{row.label}</MathText>}
    {row.math
      ? <span style={answerValueStyle}><MathDisplay value={row.value} format="latex" inline /></span>
      : <MathText style={answerValueStyle}>{row.value}</MathText>}
  </div>
));

const SkillSummary = ({ groups, onPracticeSkill }) => (
  <section aria-labelledby="results-by-skill" style={sectionCard}>
    <h2 id="results-by-skill" style={{ margin: 0, fontSize: 19, color: 'var(--mm-text-strong)' }}>How you did on each skill</h2>
    <p style={{ margin: '4px 0 12px', color: 'var(--mm-text-muted)', fontSize: 13 }}>The skills that need the most work are first.</p>
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {groups.map((group) => (
        <li key={group.key} data-skill-result={group.key} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--mm-border-soft)', borderRadius: 10, background: 'var(--mm-surface-sunken)' }}>
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <strong style={{ display: 'block', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{group.label}</strong>
            <span style={{ display: 'block', marginTop: 2, color: group.correct === group.total ? 'var(--mm-success-text)' : 'var(--mm-text)', fontSize: 13, fontWeight: 700 }}>{group.summary}</span>
            <div aria-hidden="true" style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'var(--mm-surface-control-strong)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((group.correct / group.total) * 100)}%`, height: '100%', background: 'var(--mm-success)' }} />
            </div>
          </div>
          {onPracticeSkill && group.practice && (
            <button type="button" onClick={() => onPracticeSkill(group.practice)} aria-label={`Practise ${group.label}`} style={{ ...quietButton, border: '1px solid var(--mm-primary-border)', color: 'var(--mm-primary-text)' }}>
              Practise this skill
            </button>
          )}
        </li>
      ))}
    </ul>
  </section>
);

const PracticeEstimate = ({ report }) => (
  <section aria-labelledby="results-estimate" style={{ ...sectionCard, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)' }}>
    <div style={eyebrow}>Practice estimate</div>
    <h2 id="results-estimate" style={{ margin: '4px 0 2px', fontSize: 19, color: 'var(--mm-text-strong)' }}>{report.title}</h2>
    <p style={{ margin: 0, color: 'var(--mm-primary-text)', fontSize: 26, fontWeight: 950 }}>
      About {report.rangeText} <span style={{ display: 'inline-block', whiteSpace: 'nowrap', color: 'var(--mm-text-muted)', fontSize: 14, fontWeight: 700 }}>{report.scaleText}</span>
    </p>
    <p style={{ margin: '8px 0 0', color: 'var(--mm-text)', lineHeight: 1.55 }}>{report.basis}</p>
    <p style={{ margin: '6px 0 0', color: 'var(--mm-text)', lineHeight: 1.55 }}>{report.benchmark}</p>
    {report.alternative && <p style={{ margin: '6px 0 0', color: 'var(--mm-text)', lineHeight: 1.55 }}>{report.alternative}</p>}
    <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 700 }}>{report.disclaimer}</p>
  </section>
);

export default function SecureExamReview({ examSessionId, onBack, onPracticeSkill = null, skillLabels = null, backLabel = 'Back to Tests & Exams' }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headingRef = useRef(null);
  const released = !loading && !error && reviewIsReleased(review);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getStudentSecureExamReview({ examSessionId })
      .then((result) => { if (active) { setReview(result.review || null); setError(''); } })
      .catch((loadError) => { if (active) setError(loadError.message || 'Your results could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [examSessionId]);

  useEffect(() => {
    if (released) headingRef.current?.focus();
  }, [released, examSessionId]);

  if (loading) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: 'var(--mm-text-muted)' }}>Loading your results…</div>;
  // A review the server did not mark as finished AND released is not shown at
  // all — not its score, not one question.
  if (error || !reviewIsReleased(review)) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box' }}>
        <section style={{ width: 'min(620px, 100%)', boxSizing: 'border-box', ...sectionCard }}>
          <p role={error ? 'alert' : 'status'} style={{ color: error ? 'var(--mm-error-text)' : 'var(--mm-text)', marginTop: 0 }}>{error || 'Your results aren\'t ready yet.'}</p>
          <button type="button" onClick={onBack} style={quietButton}>← {backLabel}</button>
        </section>
      </div>
    );
  }

  const framework = review.session?.examType || null;
  const frameworkLabel = FRAMEWORK_LABELS[framework] || review.session?.title || 'test';
  const items = review.items;
  const score = describeReviewScore(review);
  const skills = groupReviewBySkill(review, { skillLabels });
  const estimate = practiceTestScoreReport(review);
  const unopened = notReachedNote(review);

  return (
    // Left-aligned on purpose: the app root centres text, and answers, steps
    // and solutions are read line by line.
    <div style={{ minHeight: '100vh', background: 'var(--mm-surface-control)', padding: '24px 16px 56px', boxSizing: 'border-box', textAlign: 'left' }}>
      <main style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 14, minWidth: 0 }}>
        <header style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <div style={eyebrow}>Released feedback</div>
              <h1 ref={headingRef} tabIndex={-1} style={{ margin: '5px 0 4px', color: 'var(--mm-text-strong)', fontSize: 'clamp(21px, 5vw, 25px)', overflowWrap: 'anywhere' }}>{review.session?.title || `${frameworkLabel} results`}</h1>
              <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>Your test is finished. The answers, the worked solutions and the skill each question tested are shown now, so you can learn from them.</p>
            </div>
            <div data-results-score="" style={{ flex: '0 1 300px', minWidth: 0 }}>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Score</div>
              <div style={{ color: 'var(--mm-primary-text)', fontSize: 30, fontWeight: 950, lineHeight: 1.15 }}>{score.percentLabel}</div>
              <p style={{ margin: '4px 0 0', color: 'var(--mm-text)', fontSize: 13, lineHeight: 1.5 }}>{score.detail}</p>
            </div>
          </div>
          <button type="button" onClick={onBack} style={{ ...quietButton, marginTop: 16 }}>← {backLabel}</button>
        </header>

        {estimate && <PracticeEstimate report={estimate} />}

        {skills.length > 0 && <SkillSummary groups={skills} onPracticeSkill={onPracticeSkill} />}

        <section aria-labelledby="results-questions" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <div>
            <h2 id="results-questions" style={{ margin: '6px 0 0', fontSize: 19, color: 'var(--mm-text-strong)' }}>Question by question</h2>
            {unopened && <p style={{ margin: '4px 0 0', color: 'var(--mm-text-muted)', fontSize: 13 }}>{unopened}</p>}
          </div>
          {items.map((item, index) => {
            const result = reviewItemResult(item, index);
            const tone = STATUS_TONE[result.status];
            const answerRows = result.status === RESULT_STATUS.BLANK ? [] : responseRows(item);
            const code = teksKeyOf(item);
            return (
              <article key={item.questionInstanceId || index} data-result-status={result.status} aria-labelledby={`result-question-${index}`} style={{ ...sectionCard, border: `1px solid ${tone.border}`, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h3 id={`result-question-${index}`} style={{ margin: 0, fontSize: 16, color: 'var(--mm-text-strong)' }}>Question {result.questionNumber}</h3>
                  <span style={{ padding: '4px 9px', borderRadius: 999, background: tone.background, color: tone.color, fontSize: 12, fontWeight: 900 }}>{tone.mark}{result.statusLabel}</span>
                </div>

                {item.questionSnapshot?.prompt ? (
                  <MathText as="div" style={{ marginTop: 12, color: 'var(--mm-text-strong)', fontSize: 17, lineHeight: 1.6, fontWeight: 650, overflowWrap: 'anywhere' }}>{item.questionSnapshot.prompt}</MathText>
                ) : (
                  <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>The question itself was not saved for this older test, but its result and skill still are.</p>
                )}

                <div data-result-block="yours" style={answerBox}>
                  <span style={blockLabel}>Your answer</span>
                  {answerRows.length ? <AnswerRows rows={answerRows} /> : <span style={{ color: 'var(--mm-text-strong)', fontSize: 15, fontWeight: 700 }}>Left blank</span>}
                </div>

                {result.correctAnswers.length > 0 && (
                  <div data-result-block="correct" style={{ ...answerBox, background: 'var(--mm-success-subtle)', border: '1px solid var(--mm-success-border)' }}>
                    <span style={{ ...blockLabel, color: 'var(--mm-success-text)' }}>Correct answer</span>
                    <AnswerRows rows={result.correctAnswers.map((answer, answerIndex) => ({ id: `correct-${answerIndex}`, label: result.correctAnswers.length > 1 ? answer.label : null, value: answer.display, math: answerIsLatex(answer.display) }))} />
                  </div>
                )}

                {result.workedSolution
                  ? <PathSolutionReview review={result.workedSolution} wasCorrect={result.status === RESULT_STATUS.CORRECT} />
                  : <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)', fontSize: 14 }}>{result.solutionNote}</p>}

                {code && <StandardBadge code={code} framework={framework} domainId={item.assessmentDomainId || null} examStyle style={{ marginTop: 13 }} />}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
