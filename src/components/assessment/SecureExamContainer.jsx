import React, { useCallback, useEffect, useRef, useState } from 'react';
import ExamPrepHeader from './ExamPrepHeader.jsx';
import SecureExamQuestionPlayer from './SecureExamQuestionPlayer.jsx';
import ExamIntegrityLogger from '../../platform/assessment/examIntegrityLogger.js';
import { EXAM_RUNTIME_STATES } from '../../platform/assessment/examRuntimeController.js';
import { finalizeSecureExam, issueSecureExamQuestion, recordSecureExamIntegrityEvent, saveSecureExamDraft, startSecureExamSession, submitSecureExamResponse } from '../../services/secureExamService.js';

const terminal = new Set([EXAM_RUNTIME_STATES.SUBMITTED, EXAM_RUNTIME_STATES.TIME_EXPIRED, EXAM_RUNTIME_STATES.FORCE_SUBMITTED]);
const locked = new Set([EXAM_RUNTIME_STATES.LOCKED_INTEGRITY, EXAM_RUNTIME_STATES.LOCKED_PROCTOR]);

export const SecureExamContainer = ({ examSessionId, examType = 'digitalSAT', studentSupportProfile = null, onFinished = null, onExitAfterFinished = null }) => {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loggerRef = useRef(null);
  const draftTimerRef = useRef(null);

  const refreshQuestion = useCallback(async (activeSessionId) => {
    const issued = await issueSecureExamQuestion({ examSessionId: activeSessionId });
    setQuestion(issued.questionInstance ? { ...issued.questionInstance, _draftResponse: issued.draftResponse?.responsePayload || null } : null);
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

  const submitResponse = async (responsePayload, supportUsage) => {
    setBusy(true); setError('');
    try {
      if (draftTimerRef.current) { window.clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
      const result = await submitSecureExamResponse({ examSessionId: session.examSessionId, questionInstanceId: question.questionInstanceId, responsePayload, supportUsage });
      setQuestion(null);
      setSession(result.session);
      if (result.needsNextQuestion) await refreshQuestion(session.examSessionId);
      else if (terminal.has(result.session?.status)) onFinished?.(result.session);
    } catch (submitError) { setError(submitError.message || 'Your response was not recorded.'); }
    finally { setBusy(false); }
  };

  const autosaveDraft = useCallback((responsePayload, supportUsage) => {
    if (!session?.examSessionId || !question?.questionInstanceId) return;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      saveSecureExamDraft({ examSessionId: session.examSessionId, questionInstanceId: question.questionInstanceId, responsePayload, supportUsage }).catch(() => {});
      draftTimerRef.current = null;
    }, 500);
  }, [session?.examSessionId, question?.questionInstanceId]);

  useEffect(() => () => { if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current); }, []);

  const finish = useCallback(async (reason = 'studentSubmit') => {
    if (!session?.examSessionId || terminal.has(session.status)) return;
    setBusy(true); setError('');
    try {
      const result = await finalizeSecureExam({ examSessionId: session.examSessionId, reason });
      setSession(result.session); setQuestion(null); onFinished?.(result.session);
    } catch (finishError) { setError(finishError.message || 'The exam could not be finalized yet.'); }
    finally { setBusy(false); }
  }, [session, onFinished]);

  if (!session) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}><section style={{ width: 'min(560px,100%)', textAlign: 'center', padding: 30, border: '1px solid #dadce0', borderRadius: 14, background: '#fff' }}><h1>Secure exam simulation</h1><p style={{ color: '#5f6368', lineHeight: 1.55 }}>Starting enters full-screen when your browser permits it. Focus changes and restricted actions are recorded for your proctor. This is monitored web delivery, not an operating-system lockdown browser.</p>{error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}<button type="button" disabled={busy} onClick={start} style={{ minHeight: 48, padding: '10px 22px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900 }}>{busy ? 'Starting…' : 'Start exam'}</button></section></div>;

  if (terminal.has(session.status)) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}><section style={{ width: 'min(560px,100%)', textAlign: 'center', padding: 30, borderRadius: 14, background: '#e6f4ea', color: '#0d652d' }}><h1>Exam recorded</h1><p>{session.feedbackReleased ? 'Your teacher has released feedback. Return to Secure exams to review your questions and standards.' : 'Your responses were submitted. Correctness and scores remain hidden until your teacher releases feedback.'}</p>{onExitAfterFinished && <button type="button" onClick={onExitAfterFinished} style={{ minHeight: 44, marginTop: 10, padding: '8px 14px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Back to secure exams</button>}</section></div>;

  return <div style={{ minHeight: '100dvh', background: '#f8f9fa', position: 'relative' }}>
    <ExamPrepHeader examType={session.examType || examType} questionOrdinal={Number(session.summary?.completedQuestions || 0) + 1} totalQuestions={session.requiredQuestions} expiresAt={session.expiresAt} onTimeExpired={() => finish('timeExpired')} />
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'grid', placeItems: 'center', opacity: .025, fontSize: 'clamp(36px,10vw,100px)', fontWeight: 900, transform: 'rotate(-20deg)' }}>MATHMASTER SECURE</div>
    {error && <div role="alert" style={{ maxWidth: 820, margin: '14px auto 0', padding: '10px 14px', color: '#b3261e', background: '#fce8e6', borderRadius: 8 }}>{error}</div>}
    <SecureExamQuestionPlayer key={question?.questionInstanceId || 'waiting'} examType={session.examType || examType} question={question} initialResponsePayload={question?._draftResponse} studentSupportProfile={session.accommodationsConfirmed ? studentSupportProfile : null} accommodationConfirmed={session.accommodationsConfirmed === true} busy={busy} onSubmit={submitResponse} onDraftChange={autosaveDraft} />
    {!locked.has(session.status) && <div style={{ textAlign: 'center', padding: '0 16px 28px' }}><button type="button" disabled={busy} onClick={() => finish('studentSubmit')} style={{ border: '1px solid #5f6368', background: '#fff', color: '#3c4043', borderRadius: 8, padding: '9px 14px' }}>Submit exam early</button></div>}
    {locked.has(session.status) && <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(32,33,36,.94)', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}><div style={{ maxWidth: 520, textAlign: 'center' }}><h1>Exam paused for proctor review</h1><p style={{ lineHeight: 1.55, color: '#e8eaed' }}>Your answers remain saved. Please raise your hand. Only an authenticated teacher can unlock this session from the proctor monitor.</p><p style={{ color: '#fdd663' }}>Recorded integrity events: {session.violationCount || 0}</p></div></div>}
  </div>;
};

export default SecureExamContainer;
