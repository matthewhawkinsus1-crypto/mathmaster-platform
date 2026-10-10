import React, { useCallback, useEffect, useState } from 'react';
import RichQuestionRuntime from '../question/RichQuestionRuntime.jsx';
import { secureItemDraftKey } from '../../platform/assessment/questionRuntimePolicy.js';
import {
  issueTestCycleCorrectionQuestion,
  submitTestCycleCorrectionResponse,
} from '../../services/testCycleService.js';
import { correctionTargetTitle, describeCorrectionTargetForStudent } from '../../platform/student/testCycleDiscovery.js';

/*
 * CORRECTIONS ARE TEACHING. THIS SCREEN IS NOT A SECURE EXAM.
 *
 * Nothing here imports SecureExamContainer, ExamIntegrityLogger or any of the
 * secure callables, and that absence is the point rather than an oversight: a
 * student doing corrections is meant to get help. They get the standard they
 * are working on, the reason they were sent here, immediate right/wrong, the
 * item's own feedback, a hint from the second miss, the worked review once an
 * item closes, and three attempts.
 *
 * THE SAME QUESTION AS THE TEST. The item renders through the shared Rich
 * Question Runtime in `corrections` mode: a student who missed a graphing
 * item corrects it on the Graphing tool, an algebra-workspace item on the
 * workspace — not on a text box. The mode is what differs (hints, feedback
 * and three tries on), not the renderer.
 *
 * WHAT IT STILL WILL NOT DO. It never shows the secure Test item the student
 * missed, and it never asks the browser to decide whether an answer is right.
 * The server issues a PARALLEL question from a different family, with the exact
 * instance the student already saw forbidden, and grades it there.
 *
 * Finishing corrections cannot change a recorded grade. It unlocks a secure
 * retest the student then has to actually sit.
 *
 * THE TEST ITSELF IS ONE TAP AWAY. Corrections only exist once the Test's
 * results are released, and its review — the student's answers, the correct
 * answers, the worked solutions — is the best study material they have. When
 * the card hands over the released session (`reviewExamSessionId`), a "Review
 * my Test" button asks the card to open it (`onReviewTest`) and come back here.
 * This screen never loads the review itself: it stays free of every secure
 * module, exactly as above. The card keeps this screen mounted (hidden) while
 * the review is open, so an answer typed and not yet checked is still in the
 * box on the way back, and focus returns to the heading marked
 * `data-corrections-heading`.
 *
 * The heading names the skill in a student's words (`correctionTargetTitle`):
 * the plan copies the blueprint label, which is the standard's code whenever
 * the teacher did not write one.
 */

const reviewTestButton = {
  minHeight: 44,
  padding: '9px 15px',
  borderRadius: 8,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

const card = {
  background: 'var(--mm-surface)',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  padding: 'clamp(16px, 4vw, 26px)',
};

export const TestCycleCorrections = ({ assignmentId, corrections, onProgress, onComplete, onExit, reviewExamSessionId = null, onReviewTest = null, testAnswersHeld = false }) => {
  const targets = corrections?.targets || [];
  const reviewTest = reviewExamSessionId && onReviewTest ? (
    <button type="button" onClick={() => onReviewTest(reviewExamSessionId)} style={reviewTestButton}>
      Review my Test
    </button>
  ) : null;
  const activeTarget = targets.find((target) => target.complete !== true) || null;
  const activeTitle = activeTarget ? correctionTargetTitle(activeTarget) : '';
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Said once, when a whole skill is finished and the next one loads, so the
  // student sees it happen instead of the screen silently changing topic.
  const [announcement, setAnnouncement] = useState('');

  const loadQuestion = useCallback(async (correctionId) => {
    setBusy(true);
    setError('');
    try {
      const result = await issueTestCycleCorrectionQuestion({ assignmentId, correctionId });
      setQuestion(result.questionInstance || null);
      setAttemptsUsed(Number(result.attemptsUsed || 0));
      setFeedback(null);
    } catch (loadError) {
      setError(loadError.message || 'That correction could not be opened.');
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (activeTarget?.correctionId) loadQuestion(activeTarget.correctionId);
    else setQuestion(null);
  }, [activeTarget?.correctionId, loadQuestion]);

  if (!activeTarget) {
    return (
      <section data-test-cycle-corrections="complete" style={{ ...card, textAlign: 'center' }}>
        <h2 tabIndex={-1} data-corrections-heading="" style={{ marginTop: 0 }}>Corrections complete</h2>
        <p style={{ color: 'var(--mm-text)', lineHeight: 1.55 }}>
          You have shown you can do every skill you missed. Your secure retest is being opened.
          Your recorded grade has not changed yet — the retest is what can raise it.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '9px 16px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>
            Back to my assignment
          </button>
          {reviewTest}
        </div>
      </section>
    );
  }

  /*
   * One correction attempt. Returns, for a Rich Tool item, the feedback
   * QuestionEngine renders (Corrections shows verdicts at once); a field item's
   * feedback is rendered by the runtime from `feedback`. Unfinished tool work
   * is refused by the server without spending a try, and said so.
   */
  const submit = async (responsePayload) => {
    if (busy || !question) return null;
    setBusy(true);
    setError('');
    try {
      const result = await submitTestCycleCorrectionResponse({
        assignmentId,
        correctionId: activeTarget.correctionId,
        questionInstanceId: question.questionInstanceId,
        responsePayload,
      });
      setFeedback({
        ...result,
        message: result.feedbackMessage || (result.isCorrect ? 'Correct.' : 'Not yet.'),
      });
      setAttemptsUsed(Number(result.attemptsUsed || 0));
      const before = targets.filter((target) => target.complete === true).length;
      if (Number(result.progress?.complete || 0) > before) setAnnouncement(`${activeTitle} — corrected.`);
      onProgress?.(result);
      if (result.correctionsComplete) onComplete?.(result);
      return {
        isCorrect: result.isCorrect === true,
        status: result.isCorrect ? 'correct' : 'attempted',
        attemptCount: Number(result.attemptsUsed || 0),
        message: result.feedbackMessage || null,
        partGrades: Array.isArray(result.parts) ? result.parts : [],
      };
    } catch (submitError) {
      const text = submitError.message || 'That correction response was not recorded.';
      setError(text);
      return { blocked: true, message: text };
    } finally {
      setBusy(false);
    }
  };

  const doneCount = targets.filter((target) => target.complete === true).length;
  // A wrong answer keeps the SAME question open until its tries are used; only
  // a correct answer or the last try moves on to a fresh parallel question.
  const questionClosed = feedback?.questionClosed === true;

  return (
    // A Rich Tool needs the room a coordinate plane needs; a field item keeps
    // the reading measure.
    <div data-test-cycle-corrections="working" style={{ display: 'grid', gap: 16, width: question?.pathToolId ? 'min(1180px, 100%)' : 'min(820px, 100%)', margin: '0 auto', minWidth: 0 }}>
      <section style={{ ...card, background: 'var(--mm-primary-soft)', border: '1px solid var(--mm-primary-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>
          Corrections · {doneCount} of {targets.length} complete
        </div>
        <h1 tabIndex={-1} data-corrections-heading="" style={{ margin: '8px 0 6px', fontSize: 'clamp(19px, 4vw, 25px)', overflowWrap: 'anywhere' }}>{activeTitle}</h1>
        {/* Why this student is here, from the evidence, in a student's words
            (the plan's diagnosisDetail is the teacher's version, with standard
            codes). A mistake pattern is mentioned only when one was recorded:
            inventing one would send them to remediate something nobody observed. */}
        <p style={{ margin: 0, color: 'var(--mm-text)', lineHeight: 1.55 }}>{describeCorrectionTargetForStudent(activeTarget)}</p>
        <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 13 }}>
          Show this skill correctly {activeTarget.requiredCorrectResponses} time
          {activeTarget.requiredCorrectResponses === 1 ? '' : 's'} to finish this correction
          ({activeTarget.correctResponses} so far). Corrections do not change your recorded grade.
        </p>
        {reviewTest && (
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {reviewTest}
            {/* What the review opens: the worked solutions wait while classmates can still sit the Test (getStudentTestCycle's testAnswersHeld). */}
            <span data-corrections-review-note="" style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>
              {testAnswersHeld
                ? 'See your Test answers. The correct answers and worked solutions open once everyone has finished the Test.'
                : 'See your Test answers and the worked solutions.'}
            </span>
          </div>
        )}
      </section>

      {announcement && <p role="status" style={{ margin: 0, color: 'var(--mm-success-text)', fontWeight: 800 }}>{announcement}</p>}
      {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}

      {/* The runtime draws its own card (a field item) or the tool's own
          workspace (a Rich Tool item); a second card around it would nest. */}
      <section aria-label="Practice question" style={{ minWidth: 0 }}>
        {!question ? <p style={{ ...card, color: 'var(--mm-text-muted)' }}>Preparing a practice question…</p> : (
          <>
            <RichQuestionRuntime
              key={question.questionInstanceId}
              question={question}
              mode="corrections"
              draftKey={secureItemDraftKey({ surface: 'corrections', sessionId: assignmentId, questionInstanceId: question.questionInstanceId })}
              busy={busy}
              closed={questionClosed}
              closedMessage="This practice question is closed. Try a fresh one below."
              feedback={feedback}
              attempt={{ used: attemptsUsed, allowed: Number(question.attemptsAllowed) || 3 }}
              onSubmit={submit}
            />
            {feedback && (
              <div role="status" style={{ ...card, marginTop: -40, padding: 13, color: 'var(--mm-text)', lineHeight: 1.55 }}>
                {feedback.isCorrect
                  ? 'That counts toward finishing this correction.'
                  : questionClosed
                    ? 'That was the last try on this one. A wrong answer here costs you nothing — try a fresh question.'
                    : `${feedback.attemptsRemaining} ${feedback.attemptsRemaining === 1 ? 'try' : 'tries'} left on this question.`}
                {questionClosed && (
                  <div style={{ marginTop: 10 }}>
                    <button type="button" autoFocus onClick={() => loadQuestion(activeTarget.correctionId)} style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>
                      Next practice question
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '9px 15px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', cursor: 'pointer' }}>
          Back to my assignment
        </button>
        {reviewTest}
      </div>
    </div>
  );
};

export default TestCycleCorrections;
