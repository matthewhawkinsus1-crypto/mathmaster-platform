import { useEffect, useId, useRef, useState } from 'react';
import {
  ASK_MODE,
  HELP_ACK_TEXT,
  QUESTION_STATUS,
  QUESTION_TEXT_MAX,
  canAskFollowUp,
  cleanQuestionText,
  hasFollowUp,
} from './askTeacher.js';

/*
 * "ASK MY TEACHER" IN THE HINT PANEL (student pass 3, HELP-5, decision D6).
 *
 * HintPanel renders `button` in its row of help buttons and `status` under
 * that row. What they show depends on `askTeacher.mode`:
 *
 *   hand      In class. "✋ Ask my teacher" raises a hand on the teacher's live
 *             screen; the line under it says so, and then what the teacher
 *             answered from that screen: "Seen" or "On my way".
 *   question  Out of class. "Leave a question for my teacher" opens a short
 *             box (QUESTION_TEXT_MAX characters). Sent with this question's
 *             place in the assignment; the teacher's answer shows here and in
 *             Review My Work. `composeHelp` replaces the box's opening line
 *             where "not in class" is not the reason (a Recovery, RC10).
 *             Once answered, the student may send ONE follow-up on the same
 *             question (TT01, askTeacher.js): the first exchange stays beside
 *             it, and past that the student asks in class.
 *
 * The student's words are only ever handed to `onSendQuestion`; nothing here
 * logs or reports them.
 */
const lineStyle = { margin: 0, fontWeight: 700 };
const wrapStyle = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

export function useAskTeacherControl(askTeacher, buttonStyle = {}) {
  const [composing, setComposing] = useState(false);
  // True while the box is open for the follow-up after an answer, not for the question.
  const [followingUp, setFollowingUp] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const fieldId = useId();
  const fieldRef = useRef(null);
  // The box opens where the student is looking: focus moves into it.
  useEffect(() => { if (composing) fieldRef.current?.focus?.(); }, [composing]);
  if (!askTeacher) return { button: null, status: null };

  if (askTeacher.mode !== ASK_MODE.QUESTION) {
    const requested = Boolean(askTeacher.requested);
    const acknowledgement = requested ? HELP_ACK_TEXT[askTeacher.acknowledgement] || '' : '';
    return {
      button: (
        <button
          type="button"
          style={{ ...buttonStyle, background: requested ? 'var(--mm-warning-bg)' : 'var(--mm-surface)', borderColor: requested ? 'var(--mm-warning-border, #f9ab00)' : 'var(--mm-tint-border)' }}
          aria-pressed={requested}
          onClick={askTeacher.onToggle}
        >
          {requested ? 'Cancel my help request' : '✋ Ask my teacher'}
        </button>
      ),
      status: requested ? (
        <p role="status" data-ask-teacher-status="hand" style={{ ...lineStyle, color: 'var(--mm-warning-text)' }}>
          Your hand is raised on your teacher’s live class screen for this question. Keep working while you wait.
          {acknowledgement ? <> <span data-help-acknowledgement={askTeacher.acknowledgement}>{acknowledgement}</span></> : null}
        </p>
      ) : null,
    };
  }

  const question = askTeacher.question || null;
  const answered = question?.status === QUESTION_STATUS.ANSWERED;
  const followedUp = hasFollowUp(question);
  const canSend = typeof askTeacher.onSendQuestion === 'function';
  const words = cleanQuestionText(draft);

  const open = (asFollowUp = false) => {
    // Rewording a follow-up that is waiting is still the follow-up's box.
    setFollowingUp(asFollowUp || followedUp);
    setDraft(question && !answered ? String(question.text || '') : '');
    setNotice('');
    setComposing(true);
  };
  const send = async (event) => {
    event.preventDefault();
    if (!words || sending) return;
    setSending(true);
    setNotice('');
    try {
      await askTeacher.onSendQuestion({ existing: question, text: words });
      setComposing(false);
      setDraft('');
    } catch {
      setNotice('Your question could not be sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const buttonLook = { ...buttonStyle, background: 'var(--mm-surface)', borderColor: 'var(--mm-tint-border)' };
  let button = null;
  if (canSend && !composing) {
    if (!answered) {
      button = (
        <button type="button" style={buttonLook} onClick={() => open(false)}>
          {followedUp ? 'Edit my follow-up' : question ? 'Edit my question' : '✉ Leave a question for my teacher'}
        </button>
      );
    } else if (canAskFollowUp(question)) {
      button = <button type="button" style={buttonLook} onClick={() => open(true)}>Ask a follow-up</button>;
    }
  }

  let status = null;
  if (composing) {
    const remaining = QUESTION_TEXT_MAX - draft.length;
    status = (
      <form onSubmit={send} data-ask-teacher-form="" style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)' }}>
        <label htmlFor={fieldId} style={{ fontWeight: 800 }}>{followingUp ? 'Your follow-up for your teacher' : 'Your question for your teacher'}</label>
        <p id={`${fieldId}-help`} style={{ margin: 0, color: 'var(--mm-text-muted)' }}>
          {followingUp
            ? 'Your teacher answered. Say what is still unclear — they will see your first question and their answer with it, and the new answer will show here and in Review My Work.'
            : askTeacher.composeHelp || 'Your teacher is not in class with you right now. Say what you tried or where you got stuck — they will see this question with it, and their answer will show here and in Review My Work.'}
        </p>
        <textarea
          id={fieldId}
          ref={fieldRef}
          aria-describedby={`${fieldId}-help ${fieldId}-count`}
          value={draft}
          maxLength={QUESTION_TEXT_MAX}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--mm-border)', font: 'inherit', background: 'var(--mm-surface)', color: 'var(--mm-text)' }}
        />
        <span id={`${fieldId}-count`} style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{remaining} characters left</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" style={buttonStyle} disabled={!words || sending}>{sending ? 'Sending…' : followedUp ? 'Save my follow-up' : followingUp ? 'Send follow-up' : question ? 'Save my question' : 'Send to my teacher'}</button>
          <button type="button" style={{ ...buttonStyle, background: 'var(--mm-surface)' }} onClick={() => { setComposing(false); setNotice(''); }}>Cancel</button>
        </div>
        {notice ? <p role="alert" style={{ ...lineStyle, color: 'var(--mm-danger)' }}>{notice}</p> : null}
      </form>
    );
  } else if (answered) {
    status = (
      <div role="status" data-ask-teacher-status="answered" {...(followedUp ? { 'data-ask-teacher-follow-up': '' } : {})} style={{ display: 'grid', gap: 4, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-success-border, var(--mm-tint-border))', background: 'var(--mm-success-bg, var(--mm-surface-tint))' }}>
        <p style={{ ...lineStyle, color: 'var(--mm-text-strong)' }}>{followedUp ? 'Your teacher answered your follow-up' : 'Your teacher answered your question'}</p>
        {followedUp ? (
          <>
            <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>You asked: {question.earlierText}</p>
            <p style={{ ...wrapStyle, color: 'var(--mm-text-strong)' }}>{question.earlierAnswer}</p>
            <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>Then you asked: {question.text}</p>
          </>
        ) : (
          <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>You asked: {question.text}</p>
        )}
        <p style={{ ...wrapStyle, color: 'var(--mm-text-strong)' }}>{question.answer}</p>
        {followedUp ? <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>If you still have a question, ask your teacher in class.</p> : null}
      </div>
    );
  } else if (followedUp) {
    status = (
      <div role="status" data-ask-teacher-status="waiting" data-ask-teacher-follow-up="" style={{ display: 'grid', gap: 4 }}>
        <p style={{ ...lineStyle, color: 'var(--mm-primary-text)' }}>Your follow-up is with your teacher. Their answer will show here and in Review My Work.</p>
        <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>You asked: {question.earlierText}</p>
        <p style={{ ...wrapStyle, color: 'var(--mm-text-strong)' }}>{question.earlierAnswer}</p>
        <p style={{ ...wrapStyle, color: 'var(--mm-text-muted)' }}>Your follow-up: {question.text}</p>
      </div>
    );
  } else if (question) {
    status = (
      <p role="status" data-ask-teacher-status="waiting" style={{ ...lineStyle, color: 'var(--mm-primary-text)' }}>
        Your question is with your teacher. Their answer will show here and in Review My Work.
      </p>
    );
  } else if (!canSend) {
    status = (
      <p data-ask-teacher-status="unavailable" style={{ ...lineStyle, color: 'var(--mm-text-muted)' }}>
        Your teacher is not in class with you right now. Ask them next class.
      </p>
    );
  }
  return { button, status };
}

export default useAskTeacherControl;
