import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TestCycleCard from '../student/TestCycleCard.jsx';
import ExamPrepHeader from '../assessment/ExamPrepHeader.jsx';
import SecureExamQuestionPlayer from '../assessment/SecureExamQuestionPlayer.jsx';
import { buildTestCyclePreviewCard, previewScenariosFor } from '../../platform/teacher/testCyclePreviewModel.js';
import { gradeTestCyclePreviewItem, previewTestCycleSecureItems } from '../../services/testCycleService.js';

/*
 * PREVIEW A TEST CYCLE EXACTLY AS A STUDENT SEES IT — AND CHANGE NOTHING.
 *
 * Three things a teacher could not do before:
 *
 *   1. See the student's card at every stage: Review with the Test locked, the
 *      Test unlocked, submitted and waiting, Corrections, an unlocked Retest,
 *      the capped result, "not open yet" and "paused". Each card is built by
 *      the same shared stage machine the server uses, from this assignment's
 *      real policy (testCyclePreviewModel), and rendered by the student's own
 *      card component — in preview mode, which makes no call at all.
 *
 *   2. Sit the secure Test: real items, freshly issued from the real blueprint
 *      and approved families for a synthetic preview student, sanitized by the
 *      same function a student's Test uses, in the student's own question
 *      player, with the calculator the blueprint (or a previewed accommodation)
 *      gives — and graded by the real secure grader when the teacher checks an
 *      answer. "Another version" draws again, to see randomization at work.
 *
 *   3. At phone, tablet and Chromebook widths.
 *
 * NOTHING IS WRITTEN. The preview callables create no session, attempt, record
 * or grade (the server says `writes: "none"` and the adversarial suite proves
 * it), the card makes no request, and Review opens the existing in-memory
 * teacher preview.
 */

// Device descriptions, not layout widths: the Chromebook frame is capped at
// 100% of the teacher's own screen, so nothing here forces sideways scroll.
const DEVICES = Object.freeze([
  { id: 'phone', label: 'Phone', px: 390 },
  { id: 'tablet', label: 'Tablet', px: 820 },
  { id: 'chromebook', label: 'Chromebook', px: 1366 },
]);

const chip = (active) => ({
  minHeight: 36, padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
  border: active ? '2px solid var(--mm-primary)' : '1px solid var(--mm-border-strong)',
  background: active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: active ? 'var(--mm-primary-text)' : 'var(--mm-text)',
});
const quietButton = {
  minHeight: 40, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer',
};

const SecureItemsPreview = ({ assignment, stage, accommodation, onBack }) => {
  const [draw, setDraw] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState({});
  const [showSlot, setShowSlot] = useState(false);

  const load = useCallback(async (nextDraw) => {
    setError('');
    setData(null);
    try {
      const response = await previewTestCycleSecureItems({ assignmentId: assignment.id, draw: nextDraw });
      setData(response);
      setIndex(0);
      setResults({});
    } catch (loadError) {
      setError(loadError.message || 'The secure Test could not be previewed.');
    }
  }, [assignment.id]);

  useEffect(() => { load(draw); }, [load, draw]);

  const items = data?.items || [];
  const item = items[index] || null;
  const result = item ? results[item.ordinal] : null;
  const profile = accommodation ? { accommodations: ['calculator-scientific'] } : null;

  const check = async (responsePayload) => {
    if (!item?.previewItemId) return;
    setChecking(true);
    try {
      const graded = await gradeTestCyclePreviewItem({ previewItemId: item.previewItemId, responsePayload });
      setResults((current) => ({ ...current, [item.ordinal]: graded.isCorrect ? 'correct' : 'incorrect' }));
    } catch (checkError) {
      setResults((current) => ({ ...current, [item.ordinal]: `error:${checkError.message}` }));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={onBack} style={quietButton}>← Back to the card</button>
        <button type="button" onClick={() => setDraw((value) => value + 1)} style={quietButton}>Show another version</button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--mm-text)' }}>
          <input type="checkbox" checked={showSlot} onChange={(event) => setShowSlot(event.target.checked)} />
          Show blueprint details (teacher only)
        </label>
      </div>
      {error && <p role="alert" style={{ color: 'var(--mm-error-text)', margin: 0 }}>{error}</p>}
      {!data && !error && <p role="status" style={{ color: 'var(--mm-text-muted)', margin: 0 }}>Issuing preview items from the blueprint…</p>}
      {data && (
        <div style={{ border: '1px solid var(--mm-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--mm-surface-sunken)' }}>
          <ExamPrepHeader
            examType="courseTest"
            title={`${data.title}${stage === 'retest' ? ' — Retest' : ''} (preview)`}
            questionOrdinal={index + 1}
            totalQuestions={data.totalQuestions}
            expiresAt={null}
            onTimeExpired={() => {}}
          />
          <p style={{ margin: '10px 16px 0', fontSize: 13, color: 'var(--mm-text-muted)' }}>
            {data.delivery?.timed ? `Students see a ${data.delivery.timeLimitMinutes}-minute timer, enforced by the server. It is not running in preview.` : 'This Test is not timed; students see no clock.'}
            {stage === 'retest' ? ' A real retest targets each student\'s weak skills from their own Test; these are Test items from the same blueprint.' : ''}
          </p>
          {showSlot && item?.slot && (
            <p style={{ margin: '8px 16px 0', fontSize: 12.5, color: 'var(--mm-text)', background: 'var(--mm-surface)', padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--mm-border-strong)' }}>
              Teacher only — {item.slot.alignmentKey || 'standard'} · DOK {item.slot.dok} · difficulty {item.slot.difficultyBand} · {item.slot.representation}{item.slot.anchor ? ' · anchor' : ''} · family {item.slot.familyId}
            </p>
          )}
          {item?.error && <p role="alert" style={{ margin: 16, color: 'var(--mm-error-text)' }}>Slot {item.ordinal}: {item.error}</p>}
          {item?.questionInstance && (
            <SecureExamQuestionPlayer
              key={`${draw}-${item.ordinal}-${accommodation ? 'acc' : 'base'}`}
              examType="courseTest"
              sessionCalculatorMode={data.delivery?.calculatorMode || null}
              question={item.questionInstance}
              studentSupportProfile={profile}
              accommodationConfirmed
              busy={checking}
              onSubmit={(responsePayload) => check(responsePayload)}
              onDraftChange={() => {}}
            />
          )}
          {result && (
            <p role="status" style={{ margin: '-40px auto 24px', maxWidth: 820, padding: '0 18px', boxSizing: 'border-box', fontWeight: 800, color: result === 'correct' ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>
              {result === 'correct' ? 'The secure grader accepts this answer.' : result === 'incorrect' ? 'The secure grader marks this answer incorrect.' : `Could not check: ${result.slice(6)}`}
              {' '}Students are not told this until you release results.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '0 16px 20px', flexWrap: 'wrap' }}>
            <button type="button" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} style={quietButton}>Previous item</button>
            <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--mm-text-muted)' }}>Item {index + 1} of {items.length}</span>
            <button type="button" disabled={index >= items.length - 1} onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))} style={quietButton}>Next item</button>
          </div>
          <p style={{ margin: '0 16px 16px', fontSize: 12, color: 'var(--mm-text-muted)' }}>
            Preview navigation only: students answer one item at a time and cannot go back.
          </p>
        </div>
      )}
    </div>
  );
};

export const TestCyclePreview = ({ assignment, onClose, onPreviewReview = null }) => {
  const [scenario, setScenario] = useState('review');
  const [device, setDevice] = useState('chromebook');
  const [view, setView] = useState('card');
  const [accommodation, setAccommodation] = useState(false);
  const previewCard = useMemo(() => buildTestCyclePreviewCard({ assignment, scenario }), [assignment, scenario]);
  const width = DEVICES.find((entry) => entry.id === device)?.px || 1366;

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPreviewEnter = (stage) => {
    if (stage === 'review') {
      if (onPreviewReview) onPreviewReview(assignment);
      return;
    }
    if (stage === 'test' || stage === 'retest') setView(stage);
    if (stage === 'corrections') setView('corrections');
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Student preview of ${assignment.title}`} style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'var(--mm-page-bg)', color: 'var(--mm-text)', overflow: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', borderBottom: '1px solid var(--mm-warning-border)', padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>Student preview · {assignment.title} — nothing here is saved. No attempt, grade or student record is created.</strong>
        <button type="button" onClick={onClose} style={quietButton}>Close preview</button>
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 1400, margin: '0 auto' }}>
        <div role="group" aria-label="Stage to preview" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {previewScenariosFor(assignment).map((entry) => (
            <button key={entry.id} type="button" aria-pressed={scenario === entry.id} onClick={() => { setScenario(entry.id); setView('card'); }} style={chip(scenario === entry.id)}>{entry.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Width:</span>
          {DEVICES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={device === entry.id} onClick={() => setDevice(entry.id)} style={chip(device === entry.id)}>{entry.label} · {entry.px}px</button>
          ))}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, marginLeft: 8 }}>
            <input type="checkbox" checked={accommodation} onChange={(event) => setAccommodation(event.target.checked)} />
            Preview with a calculator accommodation
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div data-preview-device={device} style={{ width, maxWidth: device === 'chromebook' ? '100%' : width, margin: '0 auto', border: '2px solid var(--mm-border-strong)', borderRadius: 18, padding: 12, boxSizing: 'border-box', background: 'var(--mm-surface-control)' }}>
            {view === 'card' && (
              <TestCycleCard
                assignmentId={assignment.id}
                previewCard={previewCard}
                onPreviewEnter={onPreviewEnter}
                onExit={onClose}
              />
            )}
            {(view === 'test' || view === 'retest') && (
              <SecureItemsPreview assignment={assignment} stage={view} accommodation={accommodation} onBack={() => setView('card')} />
            )}
            {view === 'corrections' && (
              <section style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 18, display: 'grid', gap: 10 }}>
                <h2 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>Corrections</h2>
                <p style={{ margin: 0, lineHeight: 1.55 }}>
                  Each student's corrections are built from the Test questions THEY missed: one entry per weak skill, practised on
                  parallel questions (never the Test item), with hints and three tries per question. A skill is finished after
                  the required number of correct answers. Corrections never change the recorded grade; finishing them opens the retest.
                </p>
                {(previewCard.corrections?.targets || []).map((target) => (
                  <div key={target.correctionId} style={{ padding: 10, borderRadius: 9, background: 'var(--mm-surface-sunken)' }}>
                    <strong>{target.label}</strong> — {target.correctResponses} of {target.requiredCorrectResponses} correct
                    <div style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>{target.diagnosisDetail}</div>
                  </div>
                ))}
                <button type="button" onClick={() => setView('card')} style={{ ...quietButton, justifySelf: 'start' }}>← Back to the card</button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestCyclePreview;
