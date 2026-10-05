import React, { useCallback, useEffect, useState } from 'react';
import MathText from '../common/MathText.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import PathQuestionStimulus from './PathQuestionStimulus.jsx';
import {
  issueTestCycleCorrectionQuestion,
  submitTestCycleCorrectionResponse,
} from '../../services/testCycleService.js';
import { describeCorrectionTargetForStudent } from '../../platform/student/testCycleDiscovery.js';

/*
 * CORRECTIONS ARE TEACHING. THIS SCREEN IS NOT A SECURE EXAM.
 *
 * Nothing here imports SecureExamContainer, ExamIntegrityLogger or any of the
 * secure callables, and that absence is the point rather than an oversight: a
 * student doing corrections is meant to get help. They get the standard they
 * are working on, the reason they were sent here, immediate right/wrong,
 * whatever hint the item carries, and three attempts.
 *
 * WHAT IT STILL WILL NOT DO. It never shows the secure Test item the student
 * missed, and it never asks the browser to decide whether an answer is right.
 * The server issues a PARALLEL question from a different family, with the exact
 * instance the student already saw forbidden, and grades it there.
 *
 * Finishing corrections cannot change a recorded grade. It unlocks a secure
 * retest the student then has to actually sit.
 */

const card = {
  background: 'var(--mm-surface)',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  padding: 'clamp(16px, 4vw, 26px)',
};

export const TestCycleCorrections = ({ assignmentId, corrections, onProgress, onComplete, onExit }) => {
  const targets = corrections?.targets || [];
  const activeTarget = targets.find((target) => target.complete !== true) || null;
  const [question, setQuestion] = useState(null);
  const [responses, setResponses] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
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
      setResponses({});
      setFeedback(null);
      setShowHint(false);
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
      <section style={{ ...card, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Corrections complete</h2>
        <p style={{ color: 'var(--mm-text)', lineHeight: 1.55 }}>
          You have shown you can do every skill you missed. Your secure retest is being opened.
          Your recorded grade has not changed yet — the retest is what can raise it.
        </p>
        <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '9px 16px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>
          Back to my assignment
        </button>
      </section>
    );
  }

  const fields = question?.responseFields?.length ? question.responseFields : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  const complete = fields.every((field) => String(responses[field.id] ?? '').trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!complete || busy || !question) return;
    setBusy(true);
    setError('');
    try {
      const result = await submitTestCycleCorrectionResponse({
        assignmentId,
        correctionId: activeTarget.correctionId,
        questionInstanceId: question.questionInstanceId,
        responsePayload: { responses },
      });
      setFeedback(result);
      const before = targets.filter((target) => target.complete === true).length;
      if (Number(result.progress?.complete || 0) > before) setAnnouncement(`${activeTarget.label} — corrected.`);
      onProgress?.(result);
      if (result.correctionsComplete) onComplete?.(result);
    } catch (submitError) {
      setError(submitError.message || 'That correction response was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  const doneCount = targets.filter((target) => target.complete === true).length;
  // A wrong answer keeps the SAME question open until its tries are used; only
  // a correct answer or the last try moves on to a fresh parallel question.
  const questionClosed = feedback?.questionClosed === true;
  const canCheck = complete && !busy && !questionClosed;

  return (
    <div style={{ display: 'grid', gap: 16, width: 'min(820px, 100%)', margin: '0 auto' }}>
      <section style={{ ...card, background: 'var(--mm-primary-soft)', border: '1px solid var(--mm-primary-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>
          Corrections · {doneCount} of {targets.length} complete
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: 'clamp(19px, 4vw, 25px)' }}>{activeTarget.label}</h1>
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
      </section>

      {announcement && <p role="status" style={{ margin: 0, color: 'var(--mm-success-text)', fontWeight: 800 }}>{announcement}</p>}
      {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}

      <section style={card}>
        {!question ? <p style={{ color: 'var(--mm-text-muted)' }}>Preparing a practice question…</p> : (
          <>
            <MathText as="h2" style={{ fontSize: 'clamp(17px, 3.6vw, 22px)', lineHeight: 1.45, marginTop: 0 }}>{question.prompt}</MathText>
            {question.formulaLatex && (
              <div style={{ background: 'var(--mm-surface-sunken)', padding: 12, borderRadius: 8, margin: '10px 0 16px', overflowX: 'auto' }}>
                <MathDisplay value={question.formulaLatex} />
              </div>
            )}
            <PathQuestionStimulus stimulus={question.stimulus} />
            <form onSubmit={submit}>
              <div style={{ display: 'grid', gap: 14 }}>
                {fields.map((field, fieldIndex) => (
                  <fieldset key={field.id} style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)', marginBottom: 7 }}>
                      <MathText>{field.label || `Response ${fieldIndex + 1}`}</MathText>
                    </legend>
                    {choices.length && fields.length === 1 ? choices.map((choice) => (
                      <label key={choice.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 13px', marginBottom: 8, border: responses[field.id] === choice.id ? '2px solid var(--mm-primary)' : '1px solid var(--mm-border)', borderRadius: 9, cursor: 'pointer' }}>
                        <input type="radio" name={field.id} value={choice.id} checked={responses[field.id] === choice.id} onChange={(event) => setResponses((current) => ({ ...current, [field.id]: event.target.value }))} />
                        <MathText style={{ lineHeight: 1.5 }}>{choice.label}</MathText>
                      </label>
                    )) : (
                      <input
                        type="text"
                        autoComplete="off"
                        value={responses[field.id] ?? ''}
                        onChange={(event) => setResponses((current) => ({ ...current, [field.id]: event.target.value }))}
                        aria-label={field.label || `Response ${fieldIndex + 1}`}
                        style={{ width: '100%', minHeight: 48, padding: '10px 12px', border: '2px solid var(--mm-border)', borderRadius: 8, boxSizing: 'border-box', fontSize: 17 }}
                      />
                    )}
                  </fieldset>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <button type="submit" disabled={!canCheck} style={{ flex: '1 1 220px', minHeight: 48, border: 0, borderRadius: 9, background: canCheck ? 'var(--mm-primary)' : 'var(--mm-surface-control-strong)', color: canCheck ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)', fontWeight: 900, cursor: canCheck ? 'pointer' : 'not-allowed' }}>
                  {busy ? 'Checking…' : feedback && !feedback.isCorrect && !questionClosed ? 'Check my answer again' : 'Check my answer'}
                </button>
                {/* Hints belong here. This is the stage where help is the
                    instruction, not a loophole. */}
                {question.hint && (
                  <button type="button" onClick={() => setShowHint((value) => !value)} style={{ flex: '0 1 160px', minHeight: 48, borderRadius: 9, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}>
                    {showHint ? 'Hide hint' : 'Show a hint'}
                  </button>
                )}
              </div>
            </form>
            {showHint && question.hint && (
              <div style={{ marginTop: 14, padding: 13, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', borderRadius: 9, border: '1px solid var(--mm-warning-border)' }}>
                <MathText style={{ lineHeight: 1.55 }}>{question.hint}</MathText>
              </div>
            )}
            {feedback && (
              <div role="status" style={{ marginTop: 14, padding: 13, borderRadius: 9, background: feedback.isCorrect ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)', color: feedback.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)', lineHeight: 1.55 }}>
                {feedback.isCorrect
                  ? 'Correct. That counts toward finishing this correction.'
                  : questionClosed
                    ? 'Not quite, and that was the last try on this one. A wrong answer here costs you nothing — try a fresh question.'
                    : `Not yet. Look at your work and try again — ${feedback.attemptsRemaining} ${feedback.attemptsRemaining === 1 ? 'try' : 'tries'} left on this question.${question.hint ? ' The hint may help.' : ''}`}
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

      <button type="button" onClick={onExit} style={{ justifySelf: 'start', minHeight: 44, padding: '9px 15px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', cursor: 'pointer' }}>
        Back to my assignment
      </button>
    </div>
  );
};

export default TestCycleCorrections;
