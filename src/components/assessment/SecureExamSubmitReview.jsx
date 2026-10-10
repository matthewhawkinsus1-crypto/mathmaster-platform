import React, { useEffect, useMemo, useRef } from 'react';
import { reviewSummary } from '../../platform/assessment/secureExamNavigationModel.js';

/*
 * CHECK YOUR WORK, BEFORE IT IS FINAL.
 *
 * Two moments in a secure test where the student is about to lose the chance
 * to change answers, shown the same way:
 *
 *   submit     the whole test, before Submit
 *   moduleEnd  a Digital SAT practice test's module 1, before module 2 opens
 *              (after that, module 1 cannot be reopened)
 *
 * It lists what a student would want to go back to — questions with no
 * answer yet, questions they marked for review — each one a button straight
 * to that question, and it says plainly that a blank question counts as zero.
 * It says nothing about whether any answer is right: nothing on this screen
 * can, because nothing it is given knows.
 */

const card = {
  background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border)',
  borderRadius: 14, padding: 'clamp(18px, 4vw, 28px)', boxShadow: 'var(--mm-shadow-sm)',
};
const secondaryButton = {
  minHeight: 48, padding: '10px 18px', borderRadius: 8, border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer',
};
const primaryButton = (enabled, tone = 'var(--mm-primary)') => ({
  minHeight: 48, padding: '10px 22px', border: 0, borderRadius: 8, fontWeight: 900,
  background: enabled ? tone : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
const rowButton = {
  width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '10px 14px', borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
  color: 'var(--mm-text)', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
};

const QuestionList = ({ title, rows, empty, busy, onJump }) => (
  <section aria-labelledby={`secure-review-${title.replace(/\W+/g, '-').toLowerCase()}`} style={{ marginTop: 18 }}>
    <h2 id={`secure-review-${title.replace(/\W+/g, '-').toLowerCase()}`} style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--mm-text-strong)' }}>{title}</h2>
    {rows.length ? (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.map((row) => (
          <li key={`${row.position}-${row.detail}`}>
            <button type="button" disabled={busy} onClick={() => onJump?.(row.position)} aria-label={`Go to question ${row.position + 1}: ${row.detail}`} style={rowButton}>
              <span><strong>Question {row.position + 1}</strong> <span style={{ color: 'var(--mm-text-muted)' }}>· {row.detail}</span></span>
              <span aria-hidden="true" style={{ fontWeight: 900, color: 'var(--mm-primary-text)' }}>Go →</span>
            </button>
          </li>
        ))}
      </ul>
    ) : <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>{empty}</p>}
  </section>
);

export default function SecureExamSubmitReview({
  mode = 'submit',
  navigation,
  finishing = null,
  next = null,
  courseTest = false,
  busy = false,
  onJump,
  onBack,
  onSubmit,
  onContinue,
}) {
  const moduleEnd = mode === 'moduleEnd' && Boolean(finishing && next);
  const summary = useMemo(
    () => reviewSummary(navigation, { moduleNumber: moduleEnd ? finishing.number : null }),
    [navigation, moduleEnd, finishing],
  );
  const headingRef = useRef(null);
  // Arriving here is a change of screen: the heading takes focus so a screen
  // reader starts from the top of the review, not from a button that is gone.
  useEffect(() => { headingRef.current?.focus(); }, [mode]);

  const blankRows = [
    ...summary.unanswered.map((position) => ({ position, detail: 'no answer yet' })),
    ...(summary.firstNotOpened !== null
      ? [{
        position: summary.firstNotOpened,
        detail: summary.notOpened.length > 1
          ? `not opened yet (questions ${summary.notOpened[0] + 1}–${summary.notOpened[summary.notOpened.length - 1] + 1})`
          : 'not opened yet',
      }]
      : []),
  ];
  const flaggedRows = summary.flagged.map((position) => ({ position, detail: 'marked for review' }));
  const scope = moduleEnd ? ` in module ${finishing.number}` : '';

  return (
    <main data-secure-review={moduleEnd ? 'moduleEnd' : 'submit'} style={{ width: 'min(760px, 100%)', margin: '0 auto', padding: '24px 16px 48px', boxSizing: 'border-box' }}>
      <section aria-labelledby="secure-review-title" style={card}>
        <h1 id="secure-review-title" ref={headingRef} tabIndex={-1} style={{ margin: '0 0 8px', fontSize: 'clamp(21px, 5vw, 27px)', color: 'var(--mm-text-strong)', outline: 'none' }}>
          {moduleEnd ? `End of module ${finishing.number}` : 'Review your answers'}
        </h1>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
          You answered {summary.answered} of {summary.total} question{summary.total === 1 ? '' : 's'}{scope}.
        </p>
        {summary.blank > 0 && (
          <p data-secure-review-blank="" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', lineHeight: 1.5 }}>
            {summary.blank} question{summary.blank === 1 ? ' has' : 's have'} no answer{scope}. Questions left blank count as zero.
          </p>
        )}
        {!moduleEnd && summary.finishedModules.length > 0 && (
          <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>
            {summary.finishedModules.length === 1
              ? `Module ${summary.finishedModules[0]} is finished, so its answers can't be changed.`
              : `Modules ${summary.finishedModules.join(' and ')} are finished, so their answers can't be changed.`}
          </p>
        )}
        <QuestionList title="No answer yet" rows={blankRows} empty="Every question has an answer." busy={busy} onJump={onJump} />
        <QuestionList title="Marked for review" rows={flaggedRows} empty="No questions are marked for review." busy={busy} onJump={onJump} />
        <p style={{ margin: '22px 0 0', fontWeight: 800, lineHeight: 1.5 }}>
          {moduleEnd
            ? `You won't be able to return to module ${finishing.number} after you start module ${next.number}.`
            : 'After you submit, you can\'t change your answers.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onBack} disabled={busy} style={secondaryButton}>Back to questions</button>
          {moduleEnd ? (
            <button type="button" onClick={onContinue} disabled={busy} style={primaryButton(!busy)}>
              {busy ? 'Opening…' : `Start module ${next.number}`}
            </button>
          ) : (
            <button type="button" onClick={onSubmit} disabled={busy} style={primaryButton(!busy, 'var(--mm-danger)')}>
              {busy ? 'Submitting…' : courseTest ? 'Submit test' : 'Submit practice test'}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
