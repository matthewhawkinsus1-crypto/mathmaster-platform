import { useEffect, useId, useRef, useState } from 'react';
import {
  ASK_MODE,
  HELP_ACK_TEXT,
  QUESTION_STATUS,
  QUESTION_TEXT_MAX,
  cleanQuestionText,
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
 *             Review My Work.
 *
 * The student's words are only ever handed to `onSendQuestion`; nothing here
 * logs or reports them.
 */
const lineStyle = { margin: 0, fontWeight: 700 };

export function useAskTeacherControl(askTeacher, buttonStyle = {}) {
  const [composing, setComposing] = useState(false);
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
  const canSend = typeof askTeacher.onSendQuestion === 'function';
  const words = cleanQuestionText(draft);

  const open = () => {
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

  const button = canSend && !answered && !composing ? (
    <button type="button" style={{ ...buttonStyle, background: 'var(--mm-surface)', borderColor: 'var(--mm-tint-border)' }} onClick={open}>
      {question ? 'Edit my question' : '✉ Leave a question for my teacher'}
    </button>
  ) : null;

  let status = null;
  if (composing) {
    const remaining = QUESTION_TEXT_MAX - draft.length;
    status = (
      <form onSubmit={send} data-ask-teacher-form="" style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)' }}>
        <label htmlFor={fieldId} style={{ fontWeight: 800 }}>Your question for your teacher</label>
        <p id={`${fieldId}-help`} style={{ margin: 0, color: 'var(--mm-text-muted)' }}>
          Your teacher is not in class with you right now. Say what you tried or where you got stuck — they will see this question with it, and their answer will show here and in Review My Work.
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
          <button type="submit" style={buttonStyle} disabled={!words || sending}>{sending ? 'Sending…' : question ? 'Save my question' : 'Send to my teacher'}</button>
          <button type="button" style={{ ...buttonStyle, background: 'var(--mm-surface)' }} onClick={() => { setComposing(false); setNotice(''); }}>Cancel</button>
        </div>
        {notice ? <p role="alert" style={{ ...lineStyle, color: 'var(--mm-danger)' }}>{notice}</p> : null}
      </form>
    );
  } else if (answered) {
    status = (
      <div role="status" data-ask-teacher-status="answered" style={{ display: 'grid', gap: 4, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-success-border, var(--mm-tint-border))', background: 'var(--mm-success-bg, var(--mm-surface-tint))' }}>
        <p style={{ ...lineStyle, color: 'var(--mm-text-strong)' }}>Your teacher answered your question</p>
        <p style={{ margin: 0, color: 'var(--mm-text-muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>You asked: {question.text}</p>
        <p style={{ margin: 0, color: 'var(--mm-text-strong)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{question.answer}</p>
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
