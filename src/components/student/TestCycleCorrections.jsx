import React, { useCallback, useEffect, useState } from 'react';
import MathText from '../common/MathText.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import PathQuestionStimulus from './PathQuestionStimulus.jsx';
import {
  issueTestCycleCorrectionQuestion,
  submitTestCycleCorrectionResponse,
} from '../../services/testCycleService.js';

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
  background: '#fff',
  border: '1px solid #dadce0',
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
        <p style={{ color: '#3c4043', lineHeight: 1.55 }}>
          You have shown you can do every skill you missed. Your secure retest is being opened.
          Your recorded grade has not changed yet — the retest is what can raise it.
        </p>
        <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '9px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
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
      onProgress?.(result);
      if (result.correctionsComplete) onComplete?.(result);
    } catch (submitError) {
      setError(submitError.message || 'That correction response was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  const doneCount = targets.filter((target) => target.complete === true).length;

  return (
    <div style={{ display: 'grid', gap: 16, width: 'min(820px, 100%)', margin: '0 auto' }}>
      <section style={{ ...card, background: '#e8f0fe', border: '1px solid #aecbfa' }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: '#1a4fa0' }}>
          Corrections · {doneCount} of {targets.length} complete
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: 'clamp(19px, 4vw, 25px)' }}>{activeTarget.label}</h1>
        {/* Why this student is here, in the words of the evidence. When no
            error pattern was recorded the text says the standard was missed,
            because inventing a misconception would send them to remediate
            something nobody observed. */}
        <p style={{ margin: 0, color: '#3c4043', lineHeight: 1.55 }}>{activeTarget.diagnosisDetail}</p>
        <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 13 }}>
          Show this skill correctly {activeTarget.requiredCorrectResponses} time
          {activeTarget.requiredCorrectResponses === 1 ? '' : 's'} to finish this correction
          ({activeTarget.correctResponses} so far). Corrections do not change your recorded grade.
        </p>
      </section>

      {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}

      <section style={card}>
        {!question ? <p style={{ color: '#5f6368' }}>Preparing a practice question…</p> : (
          <>
            <MathText as="h2" style={{ fontSize: 'clamp(17px, 3.6vw, 22px)', lineHeight: 1.45, marginTop: 0 }}>{question.prompt}</MathText>
            {question.formulaLatex && (
              <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, margin: '10px 0 16px', overflowX: 'auto' }}>
                <MathDisplay value={question.formulaLatex} />
              </div>
            )}
            <PathQuestionStimulus stimulus={question.stimulus} />
            <form onSubmit={submit}>
              <div style={{ display: 'grid', gap: 14 }}>
                {fields.map((field, fieldIndex) => (
                  <fieldset key={field.id} style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 13, fontWeight: 900, color: '#3c4043', marginBottom: 7 }}>
                      <MathText>{field.label || `Response ${fieldIndex + 1}`}</MathText>
                    </legend>
                    {choices.length && fields.length === 1 ? choices.map((choice) => (
                      <label key={choice.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 13px', marginBottom: 8, border: responses[field.id] === choice.id ? '2px solid #1a73e8' : '1px solid #c7ccd1', borderRadius: 9, cursor: 'pointer' }}>
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
                        style={{ width: '100%', minHeight: 48, padding: '10px 12px', border: '2px solid #c7ccd1', borderRadius: 8, boxSizing: 'border-box', fontSize: 17 }}
                      />
                    )}
                  </fieldset>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <button type="submit" disabled={!complete || busy} style={{ flex: '1 1 220px', minHeight: 48, border: 0, borderRadius: 9, background: !complete || busy ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900, cursor: !complete || busy ? 'not-allowed' : 'pointer' }}>
                  {busy ? 'Checking…' : 'Check my answer'}
                </button>
                {/* Hints belong here. This is the stage where help is the
                    instruction, not a loophole. */}
                {question.hint && (
                  <button type="button" onClick={() => setShowHint((value) => !value)} style={{ flex: '0 1 160px', minHeight: 48, borderRadius: 9, border: '1px solid #5f6368', background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>
                    {showHint ? 'Hide hint' : 'Show a hint'}
                  </button>
                )}
              </div>
            </form>
            {showHint && question.hint && (
              <div style={{ marginTop: 14, padding: 13, background: '#fef7e0', borderRadius: 9, border: '1px solid #fdd663' }}>
                <MathText style={{ lineHeight: 1.55 }}>{question.hint}</MathText>
              </div>
            )}
            {feedback && (
              <div role="status" style={{ marginTop: 14, padding: 13, borderRadius: 9, background: feedback.isCorrect ? '#e6f4ea' : '#fce8e6', color: feedback.isCorrect ? '#0d652d' : '#b3261e', lineHeight: 1.55 }}>
                {feedback.isCorrect
                  ? 'Correct. That counts toward finishing this correction.'
                  : 'Not yet. Try the next one — corrections are practice, and a wrong answer here costs you nothing.'}
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => loadQuestion(activeTarget.correctionId)} style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
                    Next practice question
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <button type="button" onClick={onExit} style={{ justifySelf: 'start', minHeight: 44, padding: '9px 15px', borderRadius: 8, border: '1px solid #5f6368', background: '#fff', color: '#3c4043', cursor: 'pointer' }}>
        Back to my assignment
      </button>
    </div>
  );
};

export default TestCycleCorrections;
