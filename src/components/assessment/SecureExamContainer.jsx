import React, { useCallback, useEffect, useRef, useState } from 'react';
import ExamPrepHeader from './ExamPrepHeader.jsx';
import SecureExamQuestionPlayer from './SecureExamQuestionPlayer.jsx';
import ExamIntegrityLogger from '../../platform/assessment/examIntegrityLogger.js';
import { EXAM_RUNTIME_STATES } from '../../platform/assessment/examRuntimeController.js';
import { clearSecureExamActive, setSecureExamActive } from '../../platform/assessment/secureExamPresence.js';
import { COURSE_TEST_EXAM_TYPE } from '../../platform/policies/examPolicyResolver.js';
import { finalizeSecureExam, issueSecureExamQuestion, recordSecureExamIntegrityEvent, saveSecureExamDraft, startSecureExamSession, submitSecureExamResponse } from '../../services/secureExamService.js';

const terminal = new Set([EXAM_RUNTIME_STATES.SUBMITTED, EXAM_RUNTIME_STATES.TIME_EXPIRED, EXAM_RUNTIME_STATES.FORCE_SUBMITTED]);
const locked = new Set([EXAM_RUNTIME_STATES.LOCKED_INTEGRITY, EXAM_RUNTIME_STATES.LOCKED_PROCTOR]);

/*
 * THE STUDENT'S OWN TYPED ANSWER, KEPT ON THIS DEVICE UNTIL IT IS SUBMITTED.
 *
 * Autosave goes to the server (`saveSecureExamDraft`), which is what lets a
 * student resume on another device. It used to fail silently: offline, the
 * debounce fired, the call rejected, `.catch(() => {})` swallowed it, and a
 * refresh then restored an older server draft. The local copy covers exactly
 * that gap — one question, the student's own response text, nothing about the
 * item or its key — and is removed the moment the answer is submitted.
 */
const LOCAL_DRAFT_PREFIX = 'mm-secure-draft:';
const LOCAL_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
const localDraftKey = (examSessionId, questionInstanceId) => `${LOCAL_DRAFT_PREFIX}${examSessionId}:${questionInstanceId}`;

const readLocalDraft = (examSessionId, questionInstanceId) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localDraftKey(examSessionId, questionInstanceId)) || 'null');
    if (!parsed || typeof parsed !== 'object' || Date.now() - Number(parsed.at || 0) > LOCAL_DRAFT_TTL_MS) return null;
    return parsed.responsePayload && typeof parsed.responsePayload === 'object' ? parsed.responsePayload : null;
  } catch { return null; }
};
const writeLocalDraft = (examSessionId, questionInstanceId, responsePayload) => {
  try { window.localStorage.setItem(localDraftKey(examSessionId, questionInstanceId), JSON.stringify({ at: Date.now(), responsePayload })); } catch { /* storage full or blocked: the server copy still applies */ }
};
const clearLocalDrafts = (examSessionId) => {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${LOCAL_DRAFT_PREFIX}${examSessionId}:`))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch { /* nothing to clear */ }
};

const SAVE_LABEL = {
  saving: 'Saving…',
  saved: 'Answer saved',
  offline: 'Offline — your answer is kept on this device and will save when you reconnect.',
  error: 'Not saved yet — check your connection. Your answer is kept on this device.',
};

const primaryButton = (enabled = true) => ({
  minHeight: 48, padding: '10px 22px', border: 0, borderRadius: 8, fontWeight: 900,
  background: enabled ? 'var(--mm-primary)' : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
const secondaryButton = {
  minHeight: 44, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer',
};

const calculatorSentence = (mode) => {
  const value = String(mode || 'questionSpecific');
  if (value === 'none') return 'No calculator is provided on this test.';
  if (value === 'questionSpecific') return 'A calculator appears only on questions where your teacher allows one.';
  return `A ${value} calculator is available on this test.`;
};

export const SecureExamContainer = ({
  examSessionId,
  examType = 'digitalSAT',
  studentSupportProfile = null,
  onFinished = null,
  onExitAfterFinished = null,
  title = null,
  startLabel = null,
  delivery = null,
  exitLabel = null,
}) => {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const loggerRef = useRef(null);
  const draftTimerRef = useRef(null);
  const pendingDraftRef = useRef(null);
  const courseTest = examType === COURSE_TEST_EXAM_TYPE || session?.examType === COURSE_TEST_EXAM_TYPE;
  const inProgress = session?.status === EXAM_RUNTIME_STATES.IN_PROGRESS || locked.has(session?.status);

  // Tell the shell a secure exam owns the screen, for exactly as long as it does.
  useEffect(() => {
    if (session?.examSessionId && inProgress) setSecureExamActive(session.examSessionId);
    else if (session?.examSessionId) clearSecureExamActive(session.examSessionId);
    return undefined;
  }, [session?.examSessionId, inProgress]);
  useEffect(() => () => clearSecureExamActive(), []);

  // Leaving the page mid-exam is recoverable (answers are saved), but it is
  // rarely meant. The browser's own confirmation is the least intrusive guard.
  useEffect(() => {
    if (!inProgress) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inProgress]);

  const refreshQuestion = useCallback(async (activeSessionId) => {
    const issued = await issueSecureExamQuestion({ examSessionId: activeSessionId });
    const instance = issued.questionInstance || null;
    if (instance) {
      // The device copy is what the student typed last on THIS device; the
      // server copy may be older if a save failed. Prefer the device copy, and
      // send it straight back to the server so both agree again.
      const local = readLocalDraft(activeSessionId, instance.questionInstanceId);
      const serverDraft = issued.draftResponse?.responsePayload || null;
      setQuestion({ ...instance, _draftResponse: local || serverDraft });
      if (local) {
        saveSecureExamDraft({ examSessionId: activeSessionId, questionInstanceId: instance.questionInstanceId, responsePayload: local, supportUsage: {} })
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState(navigator.onLine === false ? 'offline' : 'error'));
      } else {
        setSaveState(serverDraft ? 'saved' : 'idle');
      }
    } else {
      setQuestion(null);
    }
    if (issued.session) setSession(issued.session);
  }, []);

  const start = async () => {
    setBusy(true); setError('');
    try {
      if (document.documentElement?.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => {});
      const result = await startSecureExamSession({ examSessionId, examType });
      setSession(result.session);
      if (result.session?.status === EXAM_RUNTIME_STATES.IN_PROGRESS) await refreshQuestion(result.session.examSessionId);
    } catch (startError) { setError(startError.message || 'The exam could not be started.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!session?.examSessionId || session.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) return undefined;
    const logger = new ExamIntegrityLogger({
      examSessionId: session.examSessionId,
      onEvent: async (event) => {
        const result = await recordSecureExamIntegrityEvent(event);
        if (result.status && result.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) setSession((current) => ({ ...current, status: result.status, violationCount: result.violationCount }));
      },
    });
    logger.startListening();
    loggerRef.current = logger;
    return () => { logger.stopListening(); loggerRef.current = null; };
  }, [session?.examSessionId, session?.status]);

  // A locked client has no direct Firestore access. Poll the authenticated
  // callable only while locked so a teacher unlock appears without reloading.
  useEffect(() => {
    if (!session?.examSessionId || !locked.has(session.status)) return undefined;
    const id = window.setInterval(async () => {
      try {
        const result = await startSecureExamSession({ examSessionId: session.examSessionId, examType: session.examType });
        setSession(result.session);
        if (result.session?.status === EXAM_RUNTIME_STATES.IN_PROGRESS && !question) await refreshQuestion(session.examSessionId);
      } catch { /* next poll retries */ }
    }, 5000);
    return () => window.clearInterval(id);
  }, [session?.examSessionId, session?.status, session?.examType, question, refreshQuestion]);

  const saveDraftNow = useCallback(async () => {
    const pending = pendingDraftRef.current;
    if (!pending) return true;
    if (draftTimerRef.current) { window.clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    setSaveState('saving');
    try {
      await saveSecureExamDraft(pending);
      if (pendingDraftRef.current === pending) pendingDraftRef.current = null;
      setSaveState('saved');
      return true;
    } catch {
      setSaveState(navigator.onLine === false ? 'offline' : 'error');
      return false;
    }
  }, []);

  // Back online: the answer that could not be saved is saved now, unprompted.
  useEffect(() => {
    const retry = () => { if (pendingDraftRef.current) saveDraftNow(); };
    const markOffline = () => { if (pendingDraftRef.current) setSaveState('offline'); };
    window.addEventListener('online', retry);
    window.addEventListener('offline', markOffline);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('offline', markOffline); };
  }, [saveDraftNow]);

  const submitResponse = async (responsePayload, supportUsage) => {
    setBusy(true); setError('');
    try {
      if (draftTimerRef.current) { window.clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
      pendingDraftRef.current = null;
      const result = await submitSecureExamResponse({ examSessionId: session.examSessionId, questionInstanceId: question.questionInstanceId, responsePayload, supportUsage });
      try { window.localStorage.removeItem(localDraftKey(session.examSessionId, question.questionInstanceId)); } catch { /* nothing to remove */ }
      setQuestion(null);
      setSaveState('idle');
      setSession(result.session);
      if (result.needsNextQuestion) await refreshQuestion(session.examSessionId);
      else if (terminal.has(result.session?.status)) { clearLocalDrafts(session.examSessionId); onFinished?.(result.session); }
    } catch (submitError) {
      setError(navigator.onLine === false
        ? 'You are offline, so this answer was not recorded yet. It is kept on this device — reconnect and press the button again.'
        : (submitError.message || 'Your response was not recorded.'));
    }
    finally { setBusy(false); }
  };

  const autosaveDraft = useCallback((responsePayload, supportUsage) => {
    if (!session?.examSessionId || !question?.questionInstanceId) return;
    writeLocalDraft(session.examSessionId, question.questionInstanceId, responsePayload);
    pendingDraftRef.current = { examSessionId: session.examSessionId, questionInstanceId: question.questionInstanceId, responsePayload, supportUsage };
    setSaveState('saving');
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => { draftTimerRef.current = null; saveDraftNow(); }, 500);
  }, [session?.examSessionId, question?.questionInstanceId, saveDraftNow]);

  useEffect(() => () => { if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current); }, []);

  const finish = useCallback(async (reason = 'studentSubmit') => {
    if (!session?.examSessionId || terminal.has(session.status)) return;
    setBusy(true); setError(''); setConfirmingSubmit(false);
    try {
      // The answer being typed when Submit was pressed is part of the exam: the
      // server finalizes from the last SAVED draft, so save it first.
      await saveDraftNow();
      const result = await finalizeSecureExam({ examSessionId: session.examSessionId, reason });
      clearLocalDrafts(session.examSessionId);
      setSession(result.session); setQuestion(null); onFinished?.(result.session);
    } catch (finishError) { setError(finishError.message || 'The exam could not be finalized yet.'); }
    finally { setBusy(false); }
  }, [session, onFinished, saveDraftNow]);

  const examTitle = title || (courseTest ? 'Secure Test' : 'Secure exam simulation');

  if (!session) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <section style={{ width: 'min(600px,100%)', textAlign: 'left', padding: 'clamp(20px, 5vw, 30px)', border: '1px solid var(--mm-border)', borderRadius: 14, background: 'var(--mm-surface)', boxSizing: 'border-box' }}>
          <h1 style={{ marginTop: 0, fontSize: 'clamp(20px, 5vw, 26px)', color: 'var(--mm-text-strong)' }}>{examTitle}</h1>
          {courseTest ? (
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: 'var(--mm-text)', lineHeight: 1.6 }}>
              <li>{delivery?.timed ? `This test is timed: ${delivery.timeLimitMinutes} minutes from when you start. The timer stays on screen.` : 'This test is not timed. Take the time you need.'}</li>
              <li>One attempt per question. After you record an answer you move to the next question and cannot go back.</li>
              <li>Your answer saves as you type. If you lose your connection or the page reloads, reopen the test from your assignment and you will continue where you left off.</li>
              <li>{calculatorSentence(delivery?.calculatorMode)}</li>
              <li>Full screen is requested. Leaving the test window is recorded for your teacher.</li>
            </ul>
          ) : (
            <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>Starting enters full-screen when your browser permits it. Focus changes and restricted actions are recorded for your proctor. This is monitored web delivery, not an operating-system lockdown browser.</p>
          )}
          {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}
          <button type="button" disabled={busy} onClick={start} style={primaryButton(!busy)}>{busy ? 'Opening…' : (startLabel || 'Start exam')}</button>
        </section>
      </div>
    );
  }

  if (terminal.has(session.status)) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <section role="status" style={{ width: 'min(560px,100%)', textAlign: 'center', padding: 30, borderRadius: 14, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', boxSizing: 'border-box' }}>
          <h1 style={{ marginTop: 0 }}>{courseTest ? 'Test submitted' : 'Exam recorded'}</h1>
          <p>{session.feedbackReleased
            ? 'Your teacher has released feedback. Open your review to see your questions and standards.'
            : courseTest
              ? `Your answers are saved and submitted (${Number(session.answeredQuestions || 0)} of ${Number(session.requiredQuestions || 0)} answered). Your score appears after your teacher releases results.`
              : 'Your responses were submitted. Correctness and scores remain hidden until your teacher releases feedback.'}</p>
          {onExitAfterFinished && <button type="button" onClick={onExitAfterFinished} style={{ ...primaryButton(true), marginTop: 10 }}>{exitLabel || 'Back to secure exams'}</button>}
        </section>
      </div>
    );
  }

  const answered = Number(session.answeredQuestions ?? session.summary?.completedQuestions ?? 0);
  const required = Number(session.requiredQuestions || 0);
  const unanswered = Math.max(0, required - answered);

  return <div style={{ minHeight: '100dvh', background: 'var(--mm-surface-sunken)', position: 'relative' }}>
    <ExamPrepHeader
      examType={session.examType || examType}
      title={courseTest ? (session.title || examTitle) : null}
      questionOrdinal={Number(session.summary?.completedQuestions || 0) + 1}
      totalQuestions={session.requiredQuestions}
      expiresAt={session.expiresAt}
      onTimeExpired={() => finish('timeExpired')}
    />
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'grid', placeItems: 'center', opacity: .025, fontSize: 'clamp(36px,10vw,100px)', fontWeight: 900, transform: 'rotate(-20deg)' }}>MATHMASTER SECURE</div>
    {error && <div role="alert" style={{ maxWidth: 820, margin: '14px auto 0', padding: '10px 14px', color: 'var(--mm-error-text)', background: 'var(--mm-error-bg)', borderRadius: 8 }}>{error}</div>}
    <SecureExamQuestionPlayer key={question?.questionInstanceId || 'waiting'} examType={session.examType || examType} sessionCalculatorMode={session.calculatorMode || null} question={question} initialResponsePayload={question?._draftResponse} studentSupportProfile={courseTest || session.accommodationsConfirmed ? studentSupportProfile : null} accommodationConfirmed={courseTest || session.accommodationsConfirmed === true} busy={busy} onSubmit={submitResponse} onDraftChange={autosaveDraft} />
    {question && saveState !== 'idle' && (
      <p role="status" aria-live="polite" data-secure-save-state={saveState} style={{ maxWidth: 820, margin: '-48px auto 40px', padding: '0 18px', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, color: saveState === 'saved' ? 'var(--mm-success-text)' : saveState === 'saving' ? 'var(--mm-text-muted)' : 'var(--mm-warning-text)' }}>
        {SAVE_LABEL[saveState]}
      </p>
    )}
    {!locked.has(session.status) && <div style={{ textAlign: 'center', padding: '0 16px 28px' }}><button type="button" disabled={busy} onClick={() => setConfirmingSubmit(true)} style={secondaryButton}>{courseTest ? 'Submit test' : 'Submit exam early'}</button></div>}
    {confirmingSubmit && (
      <div role="alertdialog" aria-modal="true" aria-labelledby="secure-submit-title" style={{ position: 'fixed', inset: 0, zIndex: 12500, background: 'var(--mm-scrim)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <section style={{ width: 'min(480px, 100%)', boxSizing: 'border-box', background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 22, boxShadow: 'var(--mm-shadow-lg)' }}>
          <h2 id="secure-submit-title" style={{ marginTop: 0, color: 'var(--mm-text-strong)' }}>Submit your {courseTest ? 'test' : 'exam'} now?</h2>
          <p style={{ lineHeight: 1.55 }}>
            You have recorded {answered} of {required} answers.
            {unanswered > 0 ? ` ${unanswered} question${unanswered === 1 ? '' : 's'} will be left unanswered and count as zero.` : ''}
            {' '}After you submit you cannot change any answer.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" autoFocus onClick={() => setConfirmingSubmit(false)} style={secondaryButton}>Keep working</button>
            <button type="button" disabled={busy} onClick={() => finish('studentSubmit')} style={{ ...primaryButton(!busy), background: busy ? 'var(--mm-surface-control-strong)' : 'var(--mm-danger)', color: busy ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)' }}>Submit {courseTest ? 'test' : 'exam'}</button>
          </div>
        </section>
      </div>
    )}
    {locked.has(session.status) && <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(32,33,36,.94)', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}><div style={{ maxWidth: 520, textAlign: 'center' }}><h1>Exam paused for proctor review</h1><p style={{ lineHeight: 1.55, color: '#e8eaed' }}>Your answers remain saved. Please raise your hand. Only an authenticated teacher can unlock this session from the proctor monitor.</p><p style={{ color: '#fdd663' }}>Recorded integrity events: {session.violationCount || 0}</p></div></div>}
  </div>;
};

export default SecureExamContainer;
