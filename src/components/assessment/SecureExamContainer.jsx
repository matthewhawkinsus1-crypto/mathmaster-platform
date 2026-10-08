import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExamPrepHeader, { EXAM_HEADER_CONTROL } from './ExamPrepHeader.jsx';
import GraphingCalculatorPanel from './GraphingCalculatorPanel.jsx';
import SatReferenceSheet from './SatReferenceSheet.jsx';
import SecureExamNavigator from './SecureExamNavigator.jsx';
import SecureExamQuestionPlayer from './SecureExamQuestionPlayer.jsx';
import SecureExamSubmitReview from './SecureExamSubmitReview.jsx';
import ExamIntegrityLogger from '../../platform/assessment/examIntegrityLogger.js';
import { EXAM_RUNTIME_STATES } from '../../platform/assessment/examRuntimeController.js';
import { clearSecureExamActive, setSecureExamActive } from '../../platform/assessment/secureExamPresence.js';
import { COURSE_TEST_EXAM_TYPE, getExamPolicy } from '../../platform/policies/examPolicyResolver.js';
import { SECURE_ITEM_DRAFT_PREFIX, secureItemDraftKey } from '../../platform/assessment/questionRuntimePolicy.js';
import { resolveSecureExamTools } from '../../platform/assessment/secureExamTools.js';
import { useExamToolRoom } from './examToolDrawerHooks.js';
import { assessmentSupportProfile } from '../../studentSupport.js';
import {
  DEFAULT_INTEGRITY_LOCK_THRESHOLD,
  INTEGRITY_WARNING_TEXT,
  classifySecureExamError,
  finishedSummary,
  integrityPauseText,
  integrityWarningDue,
  nextActionLabel,
  nextTarget,
  pauseKind,
  pausedStatusAfterRefusal,
  pendingModuleEnd,
  previousTarget,
  readNavigation,
  startScreenRules,
  startScreenTime,
  targetFor,
  timeAllowance,
  withReviewFlag,
} from '../../platform/assessment/secureExamNavigationModel.js';
import { removeQuestionDraftFamily } from '../../questionDraftStorage.js';
import { forgetToolDraftFamily } from '../../tools/shared/usePersistentToolState.js';
import {
  finalizeSecureExam,
  issueSecureExamQuestion,
  listStudentSecureExamSessions,
  recordSecureExamIntegrityEvent,
  saveSecureExamDraft,
  startSecureExamSession,
} from '../../services/secureExamService.js';

const terminal = new Set([EXAM_RUNTIME_STATES.SUBMITTED, EXAM_RUNTIME_STATES.TIME_EXPIRED, EXAM_RUNTIME_STATES.FORCE_SUBMITTED]);
const locked = new Set([EXAM_RUNTIME_STATES.LOCKED_INTEGRITY, EXAM_RUNTIME_STATES.LOCKED_PROCTOR]);

/*
 * LAYERS. QuestionEngine's Work View ("Enlarge question") is a fixed modal at
 * z-index 2147483000, with its keypad and calculator above it up to
 * 2147483400 (WorkViewShell.css). A pause has to cover all of that — a
 * student working in an enlarged question must still see that the test
 * stopped — and the warning before the pause has to reach them there too.
 */
const PAUSE_LAYER = 2147483600;
const WARNING_LAYER = 2147483550;

// While a test is in progress, how often the screen asks whether a teacher
// paused it, added time or turned it in (see the status check below).
const STATUS_CHECK_MS = 30 * 1000;

/*
 * A SECURE TEST THE STUDENT MOVES AROUND IN.
 *
 * Every question the student has opened stays open until they submit: they
 * can skip one (Next opens the next question), come back to it (Previous, or
 * the question list from the header), mark it for review, and change any
 * answer. Answers are drafts. The server grades them all once, when the test
 * is submitted, by the student, by the timer or by the teacher — so nothing
 * on this screen ever says, or could say, whether an answer is right.
 *
 * The server decides where a move may go (functions/lib/secureExamNavigation.js);
 * this screen asks for a question by its number, shows the server's own words
 * when a move is refused, and never asks for a question further ahead than
 * the next unopened one. A Digital SAT practice test reviews module 1 before
 * module 2 opens, and module 1 is closed after that.
 *
 * Kept from the linear runtime, unchanged in meaning: the timer from the
 * server's `expiresAt` only, autosave and resume, the device copy of what the
 * student typed, the leave-page guard, the integrity logger, the watermark,
 * the secure-exam presence flag and the accommodations the student is owed.
 */

/*
 * THE STUDENT'S OWN TYPED ANSWER, KEPT ON THIS DEVICE UNTIL THE TEST IS SUBMITTED.
 *
 * Autosave goes to the server (`saveSecureExamDraft`), which is what lets a
 * student resume on another device. It used to fail silently: offline, the
 * debounce fired, the call rejected, `.catch(() => {})` swallowed it, and a
 * refresh then restored an older server draft. The local copy covers exactly
 * that gap — one question, the student's own response text, nothing about the
 * item or its key.
 *
 * Now that a student comes back to questions, there is one copy per question
 * for the whole test, and each copy says whether the server has it yet
 * (`synced`). Only a copy the server never received outranks the server's on
 * the way back in: a synced copy is either what the server already holds or
 * older than what another device has saved since. All of them are removed
 * when the test is finished.
 */
const LOCAL_DRAFT_PREFIX = 'mm-secure-draft:';
const LOCAL_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
const localDraftKey = (examSessionId, questionInstanceId) => `${LOCAL_DRAFT_PREFIX}${examSessionId}:${questionInstanceId}`;

/*
 * A RICH TOOL ITEM'S OWN WORK lives under its secure item draft key
 * (secureItemDraftKey): the graph's points, the workspace's lines. That is
 * ordinary question draft storage, so it survives a reload, a Chromebook
 * sleep, a pause or moving to another question on this device, and it travels
 * with every server autosave as `workspaceDrafts` so another device reopens
 * the same construction. It is removed with the session once the test is
 * finished.
 */
const itemDraftKey = (examSessionId, questionInstanceId) => (
  examSessionId && questionInstanceId ? secureItemDraftKey({ surface: 'exam', sessionId: examSessionId, questionInstanceId }) : null
);
const sessionDraftFamily = (examSessionId) => `${SECURE_ITEM_DRAFT_PREFIX}:exam:${encodeURIComponent(String(examSessionId || '').trim())}`;
// The device mirror keeps the answer and the raw construction. The tool's own
// drafts are already on this device under the item draft key.
const deviceMirrorOf = (responsePayload) => {
  if (!responsePayload || typeof responsePayload !== 'object') return responsePayload;
  const { workspaceDrafts: _workspaceDrafts, ...rest } = responsePayload;
  return rest;
};

let lastLocalStamp = 0;
const readLocalDraft = (examSessionId, questionInstanceId) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localDraftKey(examSessionId, questionInstanceId)) || 'null');
    if (!parsed || typeof parsed !== 'object' || Date.now() - Number(parsed.at || 0) > LOCAL_DRAFT_TTL_MS) return null;
    if (!parsed.responsePayload || typeof parsed.responsePayload !== 'object') return null;
    return { responsePayload: parsed.responsePayload, at: Number(parsed.at) || 0, synced: parsed.synced === true };
  } catch { return null; }
};
const writeLocalDraft = (examSessionId, questionInstanceId, responsePayload) => {
  // Unique per write, so a save can tell whether the copy changed after it left.
  const at = Math.max(Date.now(), lastLocalStamp + 1);
  lastLocalStamp = at;
  try { window.localStorage.setItem(localDraftKey(examSessionId, questionInstanceId), JSON.stringify({ at, responsePayload: deviceMirrorOf(responsePayload) })); } catch { /* storage full or blocked: the server copy still applies */ }
  return at;
};
const markLocalDraftSynced = (examSessionId, questionInstanceId, at) => {
  try {
    const key = localDraftKey(examSessionId, questionInstanceId);
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    // Typed again since this save left: the newer copy is still unsaved.
    if (!parsed || typeof parsed !== 'object' || Number(parsed.at) !== Number(at)) return;
    window.localStorage.setItem(key, JSON.stringify({ ...parsed, synced: true }));
  } catch { /* the copy stays marked unsaved, which only means it is re-sent */ }
};
const clearLocalDrafts = (examSessionId) => {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${LOCAL_DRAFT_PREFIX}${examSessionId}:`))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch { /* nothing to clear */ }
  // Every Rich Tool construction of this session, too — stored and cached.
  removeQuestionDraftFamily(sessionDraftFamily(examSessionId));
  forgetToolDraftFamily(sessionDraftFamily(examSessionId));
};

const SAVE_LABEL = {
  saving: 'Saving…',
  saved: 'Answer saved',
  offline: 'Offline — your answer is kept on this device and will save when you reconnect.',
  error: 'Not saved yet — check your connection. Your answer is kept on this device.',
};

// The answer on screen could not be saved, so the student stays where it is.
const OFFLINE_MOVE = 'You\'re offline, so this answer isn\'t saved yet. It is kept on this device — reconnect, then try again.';
const unsavedMessage = (problem) => (
  problem?.kind === 'network' || (typeof navigator !== 'undefined' && navigator.onLine === false)
    ? OFFLINE_MOVE
    : `Your answer to this question isn't saved yet.${problem?.message ? ` ${problem.message}` : ''} Try again.`
);
// The answer WAS saved; it is the next question that did not arrive.
const OPEN_FAILED = 'That question couldn\'t open. Your answers are saved — check your connection, then try again.';
// Time ran out and the test could not be turned in: the server was not reached.
const TIME_UP_OFFLINE = 'Time is up. Reconnect to the internet so your test can be turned in — your saved answers are kept.';
// Time ran out on this device's clock, and the server's clock is a moment behind it.
const TIME_UP_WAITING = 'Time is up. Turning in your test…';

const primaryButton = (enabled = true, tone = 'var(--mm-primary)') => ({
  minHeight: 48, padding: '10px 22px', border: 0, borderRadius: 8, fontWeight: 900,
  background: enabled ? tone : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
const secondaryButton = (enabled = true) => ({
  minHeight: 48, padding: '9px 18px', borderRadius: 8, border: '1px solid var(--mm-border-strong)',
  background: enabled ? 'var(--mm-surface)' : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-text)' : 'var(--mm-disabled-text)', fontWeight: 800,
  cursor: enabled ? 'pointer' : 'not-allowed',
});
const bannerStyle = (tone) => ({
  width: 'min(820px, calc(100% - 32px))', margin: '14px auto 0', padding: '10px 14px', boxSizing: 'border-box', borderRadius: 9, lineHeight: 1.5,
  ...(tone === 'error'
    ? { color: 'var(--mm-error-text)', background: 'var(--mm-error-bg)' }
    : tone === 'warning'
      ? { color: 'var(--mm-warning-text)', background: 'var(--mm-warning-bg)', border: '1px solid var(--mm-warning-border)' }
      : { color: 'var(--mm-info-text)', background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)' }),
});

// The finished and pause screens' titles wrap on a phone: sized like the
// start screen's, with a line height of their own (the root's is a fixed
// pixel value, and two lines of a large title overlapped under it).
const screenTitle = { marginTop: 0, fontSize: 'clamp(24px, 6vw, 32px)', lineHeight: 1.2 };
// On the dark pause screen the title is white: a bare <h1> takes the page's
// heading colour (index.css), which in the light theme is near-black on the
// pause screen's near-black — a title nobody could read.
const pauseTitle = { ...screenTitle, color: '#fff' };

/*
 * KEYBOARD FOCUS STAYS IN THE TEST.
 *
 * Tab past the last control of a page moves focus to the browser itself, and
 * the window losing focus is exactly what the integrity logger records as
 * leaving the test — so a student who works by keyboard could be paused for
 * pressing Tab. Two empty guards, first and last in the test, send focus round
 * to the other end instead. Controls behind the question list or a pause are
 * inert, so they are skipped; with nothing else to reach, focus stays on the
 * pause screen. (The question list is a panel on the page, not a modal, so
 * it needs no trap of its own.)
 */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, math-field, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const focusGuardStyle = { position: 'fixed', top: 0, left: 0, width: 1, height: 0, padding: 0, overflow: 'hidden', outline: 'none' };

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
  // What the student's list already knew about this session before it was
  // opened (question count, time, how results are released): start screen only.
  sessionPreview = null,
  // Opens released results from the finished screen. A practice test comes
  // back from Submit with its results already released.
  onOpenResults = null,
}) => {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  // The question on screen, as the server numbers it (zero-based).
  const [position, setPosition] = useState(null);
  // The question at `position` is an answer the older runtime locked.
  const [recordedHere, setRecordedHere] = useState(false);
  // 'question' | 'review' (before Submit) | 'moduleEnd' (before module 2)
  const [view, setView] = useState({ kind: 'question' });
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [integrityNotice, setIntegrityNotice] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  // The session as the student's list knows it, read for the start screen when
  // the screen was opened without one (a course Test, from its card).
  const [loadedPreview, setLoadedPreview] = useState(null);
  const loggerRef = useRef(null);
  const draftTimerRef = useRef(null);
  const pendingDraftRef = useRef(null);
  /*
   * WHAT THIS SCREEN LAST HAD FOR EACH QUESTION: the copy it opened with, then
   * every change the student made to it. The review before Submit (and before
   * module 2) replaces the question on screen, and "Back to questions" brings
   * it back from here — never from the copy it opened with, which showed a
   * saved answer blank and, on the next change, saved over the parts of it
   * the student had not touched.
   */
  const latestDraftsRef = useRef(new Map());
  const rootRef = useRef(null);
  // The element that holds the question column, padded clear of open tools.
  const columnRef = useRef(null);
  const [referenceSheetOpen, setReferenceSheetOpen] = useState(false);
  const [graphingCalculatorOpen, setGraphingCalculatorOpen] = useState(false);
  // Questions on which the student opened the graphing calculator: their
  // drafts say a calculator was used, as the scientific one's always did.
  const calculatorUsedRef = useRef(new Set());
  const room = useExamToolRoom(columnRef, { referenceSheetOpen, graphingCalculatorOpen });
  // The toolbar's height, below which the tool drawers open (and above which
  // a phone's bottom sheet stops), so the timer and the tool buttons are never
  // covered by a tool (examToolDrawerHooks reads it where each launcher sits).
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const pauseRef = useRef(null);
  const lastFocusRef = useRef(null);
  const busyRef = useRef(false);
  const finishingRef = useRef(false);
  const finishRef = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const positionRef = useRef(position);
  positionRef.current = position;
  const courseTest = examType === COURSE_TEST_EXAM_TYPE || session?.examType === COURSE_TEST_EXAM_TYPE;
  const inProgress = session?.status === EXAM_RUNTIME_STATES.IN_PROGRESS || locked.has(session?.status);
  const navigation = useMemo(() => readNavigation(session), [session]);

  const setBusyState = useCallback((value) => { busyRef.current = value; setBusy(value); }, []);

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

  useEffect(() => {
    const toolbar = rootRef.current?.querySelector('[data-secure-exam-header]');
    if (!toolbar) return undefined;
    const update = () => setToolbarHeight(Math.ceil(toolbar.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [session?.examSessionId, session?.status]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  // What a save tells the screen: the question list's states and the count.
  const mergeSaveResult = useCallback((result) => {
    if (!result || typeof result !== 'object') return;
    setSession((current) => (current ? {
      ...current,
      ...(result.navigation && typeof result.navigation === 'object' ? { navigation: result.navigation } : {}),
      ...(Number.isInteger(result.answeredQuestions) ? { answeredQuestions: result.answeredQuestions } : {}),
    } : current));
  }, []);

  /*
   * SAVE THE PENDING DRAFT NOW. Returns { ok } or { ok: false, problem }.
   *
   * Called by the autosave timer, by "Save answer" on a Rich Tool, and before
   * every move and before Submit — the server grades the last SAVED draft, so
   * nothing typed is left behind on a question the student moves away from.
   */
  const saveDraftNow = useCallback(async () => {
    const pending = pendingDraftRef.current;
    if (!pending) return { ok: true };
    if (draftTimerRef.current) { window.clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    setSaveState('saving');
    try {
      const result = await saveSecureExamDraft(pending.request);
      if (pendingDraftRef.current === pending) pendingDraftRef.current = null;
      markLocalDraftSynced(pending.request.examSessionId, pending.request.questionInstanceId, pending.localAt);
      mergeSaveResult(result);
      setSaveState('saved');
      return { ok: true };
    } catch (saveError) {
      const problem = classifySecureExamError(saveError, { expiresAt: sessionRef.current?.expiresAt });
      if (problem.kind === 'itemClosed') {
        // The question no longer takes answers (its module closed, or it was
        // recorded): there is nothing left to retry.
        if (pendingDraftRef.current === pending) pendingDraftRef.current = null;
        setSaveState('idle');
        return { ok: true };
      }
      setSaveState(navigator.onLine === false ? 'offline' : 'error');
      return { ok: false, problem };
    }
  }, [mergeSaveResult]);

  // The session as the server has it now (a teacher's pause, resume, added
  // time or submit). Start returns a paused or finished session unchanged.
  const refreshSession = useCallback(async () => {
    const active = sessionRef.current;
    if (!active?.examSessionId) return null;
    try {
      const result = await startSecureExamSession({ examSessionId: active.examSessionId, examType: active.examType });
      if (result?.session) setSession(result.session);
      return result?.session || null;
    } catch { return null; }
  }, []);

  /*
   * A FAILED CALL THAT CHANGES THE SCREEN, rather than one to report.
   *
   * A paused session shows the pause — never "Preparing the next secure
   * item…" for a question that cannot load. Time that ran out finishes the
   * test as timed out. A refusal to move is shown in the server's words.
   * Returns true when it handled the problem.
   */
  const handleProblem = useCallback((problem) => {
    if (!problem) return false;
    if (problem.kind === 'locked') {
      setNavigatorOpen(false);
      setSession((current) => (current ? { ...current, status: pausedStatusAfterRefusal(problem.status, current.status) } : current));
      // A refusal that does not say which pause it is: ask, so the pause
      // screen shows the right words (and the poll below takes over).
      if (!problem.status) refreshSession();
      return true;
    }
    if (problem.kind === 'expired') {
      // After whatever is running now has let go of the screen.
      window.setTimeout(() => finishRef.current?.('timeExpired'), 0);
      return true;
    }
    if (problem.kind === 'finished') {
      refreshSession();
      return true;
    }
    if (problem.kind === 'navigation') {
      const moduleEnd = problem.reason === 'module_end' ? pendingModuleEnd(readNavigation(sessionRef.current)) : null;
      if (moduleEnd) setView({ kind: 'moduleEnd', target: moduleEnd });
      else setNotice(problem.message);
      return true;
    }
    return false;
  }, [refreshSession]);

  const runAutosave = useCallback(async () => {
    const result = await saveDraftNow();
    if (!result.ok) handleProblem(result.problem);
    return result;
  }, [saveDraftNow, handleProblem]);

  /*
   * OPEN THE QUESTION AT `target` — a question already opened, or the next one.
   *
   * The device copy of what the student typed (one per question) wins only if
   * the server never received it; then it is sent straight back so both agree
   * again. A Rich Tool's own drafts come from the server copy too, and
   * restoring them keeps whichever is newer per key (restoreQuestionDrafts),
   * so neither device's work is lost.
   */
  const openPosition = useCallback(async (activeSessionId, target, { closeModule = false } = {}) => {
    const issued = await issueSecureExamQuestion({
      examSessionId: activeSessionId,
      ...(Number.isInteger(target) ? { position: target } : {}),
      ...(closeModule ? { closeModule: true } : {}),
    });
    const instance = issued.recorded === true ? null : (issued.questionInstance || null);
    let resend = null;
    if (instance) {
      const local = readLocalDraft(activeSessionId, instance.questionInstanceId);
      const serverDraft = issued.draftResponse?.responsePayload || null;
      const deviceWins = Boolean(local && !local.synced);
      const restored = deviceWins
        ? { ...local.responsePayload, ...(Array.isArray(serverDraft?.workspaceDrafts) ? { workspaceDrafts: serverDraft.workspaceDrafts } : {}) }
        : serverDraft;
      latestDraftsRef.current.set(instance.questionInstanceId, restored);
      setQuestion({ ...instance, _draftResponse: restored });
      // `restored`, not the bare mirror: the mirror carries no workspace
      // drafts, and a save replaces the server's draft whole — sending it
      // alone deleted the construction the server held for another device.
      if (deviceWins) {
        resend = {
          request: { examSessionId: activeSessionId, questionInstanceId: instance.questionInstanceId, responsePayload: restored, supportUsage: {} },
          localAt: local.at,
        };
      }
      setSaveState(serverDraft || deviceWins ? 'saved' : 'idle');
    } else {
      setQuestion(null);
      setSaveState('idle');
    }
    setRecordedHere(issued.recorded === true);
    setPosition(Number.isInteger(issued.position) ? issued.position : (Number.isInteger(target) ? target : 0));
    if (issued.session) setSession(issued.session);
    setNotice('');
    if (resend) {
      pendingDraftRef.current = resend;
      runAutosave();
    }
  }, [runAutosave]);

  /*
   * MOVE: to a question, to the review before Submit, or to a module's end.
   * Always saves what is pending first; an answer that could not be saved
   * keeps the student where it is, with the reason.
   */
  const move = useCallback(async (target) => {
    const active = sessionRef.current;
    if (!active?.examSessionId || !target || busyRef.current) return;
    setNavigatorOpen(false);
    if (target.kind === 'blocked') { setNotice(target.message); return; }
    setBusyState(true); setError(''); setNotice('');
    try {
      const saved = await saveDraftNow();
      if (!saved.ok) {
        if (!handleProblem(saved.problem)) setError(unsavedMessage(saved.problem));
        return;
      }
      if (target.kind === 'review') { setView({ kind: 'review' }); return; }
      if (target.kind === 'moduleEnd') { setView({ kind: 'moduleEnd', target }); return; }
      await openPosition(active.examSessionId, target.position, { closeModule: target.closeModule === true });
      setView({ kind: 'question' });
    } catch (moveError) {
      // The save above succeeded: what failed is opening the question.
      const problem = classifySecureExamError(moveError, { expiresAt: active.expiresAt });
      if (!handleProblem(problem)) {
        setError(problem.kind === 'network' ? OPEN_FAILED : (problem.message || 'That question did not open. Try again.'));
      }
    } finally {
      setBusyState(false);
    }
  }, [handleProblem, openPosition, saveDraftNow, setBusyState]);

  const start = async () => {
    let started = null;
    setBusyState(true); setError('');
    try {
      if (document.documentElement?.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => {});
      const result = await startSecureExamSession({ examSessionId, examType });
      started = result.session || null;
      setSession(started);
      if (started?.status === EXAM_RUNTIME_STATES.IN_PROGRESS) {
        // Where the student left off; a new test opens its first question.
        await openPosition(started.examSessionId, readNavigation(started).cursor);
        if (integrityWarningDue(started)) setIntegrityNotice(true);
      }
    } catch (startError) {
      // Before a session exists the start screen shows the reason; after, a
      // pause or the end of time changes the screen like any other call.
      const problem = classifySecureExamError(startError, { expiresAt: started?.expiresAt });
      if (!started || !handleProblem(problem)) setError(problem.message || 'The test could not be started.');
    } finally { setBusyState(false); }
  };

  useEffect(() => {
    if (!session?.examSessionId || session.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) return undefined;
    const logger = new ExamIntegrityLogger({
      examSessionId: session.examSessionId,
      onEvent: async (event) => {
        const result = await recordSecureExamIntegrityEvent(event);
        if (result.status && result.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) {
          setSession((current) => ({ ...current, status: result.status, violationCount: result.violationCount }));
          return;
        }
        setSession((current) => (current ? {
          ...current,
          violationCount: Number.isInteger(result.violationCount) ? result.violationCount : current.violationCount,
          ...(result.lockThreshold ? { integrityLockThreshold: result.lockThreshold } : {}),
        } : current));
        // The event before the one that pauses the test: say so now, while
        // the student can still act on it.
        if (integrityWarningDue({ status: EXAM_RUNTIME_STATES.IN_PROGRESS, violationCount: result.violationCount, lockThreshold: result.lockThreshold, warning: result.warning })) {
          setIntegrityNotice(true);
        }
      },
    });
    logger.startListening();
    loggerRef.current = logger;
    return () => { logger.stopListening(); loggerRef.current = null; };
  }, [session?.examSessionId, session?.status]);

  // A paused client has no direct Firestore access. Poll the authenticated
  // callable only while paused so a teacher's resume appears without reloading.
  useEffect(() => {
    if (!session?.examSessionId || !locked.has(session.status)) return undefined;
    const id = window.setInterval(() => { refreshSession(); }, 5000);
    return () => window.clearInterval(id);
  }, [session?.examSessionId, session?.status, refreshSession]);

  /*
   * A TEACHER'S PAUSE, ADDED TIME OR SUBMIT, NOTICED WHILE THE STUDENT READS.
   *
   * Saves and moves meet a pause the moment they are refused, but a student
   * reading a long question makes no calls, and kept reading behind a pause
   * the teacher had already set. So while the test is on screen, the screen
   * asks every half minute (never mid-move, never from a hidden tab). From the
   * answer it takes a change of status whole — the pause, the resume, the
   * finished test — and otherwise only the clock: the question list stays as
   * this screen's own saves left it, so a slow answer cannot undo a newer one.
   */
  const checkStatus = useCallback(async () => {
    const active = sessionRef.current;
    if (!active?.examSessionId) return;
    try {
      const fresh = (await startSecureExamSession({ examSessionId: active.examSessionId, examType: active.examType }))?.session;
      if (!fresh || fresh.examSessionId !== active.examSessionId) return;
      setSession((current) => {
        if (!current || current.examSessionId !== fresh.examSessionId) return current;
        if (fresh.status !== current.status) return fresh;
        return { ...current, expiresAt: fresh.expiresAt, timeLimitSeconds: fresh.timeLimitSeconds, addedTimeSeconds: fresh.addedTimeSeconds };
      });
    } catch { /* the next save, move or check will tell */ }
  }, []);
  useEffect(() => {
    if (!session?.examSessionId || session.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) return undefined;
    const id = window.setInterval(() => {
      if (busyRef.current || finishingRef.current || document.visibilityState === 'hidden') return;
      checkStatus();
    }, STATUS_CHECK_MS);
    return () => window.clearInterval(id);
  }, [session?.examSessionId, session?.status, checkStatus]);

  /*
   * RESUMED: reopen the question the student was on — whether or not one was
   * showing when the test paused (a pause can land mid-move) — after saving
   * anything that was waiting. The review screen, if that is where they were,
   * stays where it is.
   */
  const resumeAfterPause = useCallback(async () => {
    const active = sessionRef.current;
    if (!active?.examSessionId) return;
    setBusyState(true); setError(''); setNotice('');
    try {
      const saved = await saveDraftNow();
      if (!saved.ok && handleProblem(saved.problem)) return;
      const target = Number.isInteger(positionRef.current) ? positionRef.current : readNavigation(active).cursor;
      await openPosition(active.examSessionId, target);
      if (integrityWarningDue(active)) setIntegrityNotice(true);
    } catch (resumeError) {
      const problem = classifySecureExamError(resumeError, { expiresAt: active.expiresAt });
      if (!handleProblem(problem)) setError(problem.message || 'Your question did not reopen. Try again.');
    } finally { setBusyState(false); }
  }, [handleProblem, openPosition, saveDraftNow, setBusyState]);

  const previousStatusRef = useRef(null);
  useEffect(() => {
    const previous = previousStatusRef.current;
    const status = session?.status || null;
    previousStatusRef.current = status;
    if (status === EXAM_RUNTIME_STATES.IN_PROGRESS && locked.has(previous)) resumeAfterPause();
  }, [session?.status, resumeAfterPause]);

  // Back online: the answer that could not be saved is saved now, unprompted.
  useEffect(() => {
    const retry = () => { if (pendingDraftRef.current) runAutosave(); };
    const markOffline = () => { if (pendingDraftRef.current) setSaveState('offline'); };
    window.addEventListener('online', retry);
    window.addEventListener('offline', markOffline);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('offline', markOffline); };
  }, [runAutosave]);

  const autosaveDraft = useCallback((responsePayload, supportUsage) => {
    const active = sessionRef.current;
    if (!active?.examSessionId || !question?.questionInstanceId) return;
    latestDraftsRef.current.set(question.questionInstanceId, responsePayload);
    const localAt = writeLocalDraft(active.examSessionId, question.questionInstanceId, responsePayload);
    const usage = calculatorUsedRef.current.has(question.questionInstanceId)
      ? { ...supportUsage, calculatorUsed: true }
      : supportUsage;
    pendingDraftRef.current = {
      request: { examSessionId: active.examSessionId, questionInstanceId: question.questionInstanceId, responsePayload, supportUsage: usage },
      localAt,
    };
    setSaveState('saving');
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => { draftTimerRef.current = null; runAutosave(); }, 500);
  }, [question?.questionInstanceId, runAutosave]);

  /*
   * A RICH TOOL'S "SAVE ANSWER" (navigation mode): save this work as the
   * question's draft, now. It never records the answer and never returns a
   * result — RichQuestionRuntime hands the engine nothing back, so no verdict
   * can appear and the tool stays open (see its header).
   */
  const saveItemNow = useCallback(async (responsePayload, supportUsage) => {
    autosaveDraft(responsePayload, supportUsage);
    await runAutosave();
    return null;
  }, [autosaveDraft, runAutosave]);

  useEffect(() => () => { if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current); }, []);

  const currentItem = Number.isInteger(position) ? navigation.items.find((item) => item.position === position) || null : null;
  const currentFlagged = Boolean(currentItem?.flagged);

  // Mark for review: shown at once, saved without touching the answer.
  const toggleFlag = useCallback(async () => {
    const active = sessionRef.current;
    const questionInstanceId = question?.questionInstanceId;
    if (!active?.examSessionId || !questionInstanceId) return;
    const flagged = !currentFlagged;
    setSession((current) => withReviewFlag(current, questionInstanceId, flagged));
    try {
      mergeSaveResult(await saveSecureExamDraft({ examSessionId: active.examSessionId, questionInstanceId, flagged }));
    } catch (flagError) {
      setSession((current) => withReviewFlag(current, questionInstanceId, !flagged));
      const problem = classifySecureExamError(flagError, { expiresAt: active.expiresAt });
      if (!handleProblem(problem)) setError('The mark for review was not saved. Check your connection and try again.');
    }
  }, [question?.questionInstanceId, currentFlagged, mergeSaveResult, handleProblem]);

  const openNavigator = useCallback(() => {
    // The list shows saved states, so the answer being typed is saved first.
    if (pendingDraftRef.current) runAutosave();
    setNavigatorOpen(true);
  }, [runAutosave]);

  /*
   * "BACK TO QUESTIONS" from a review screen. The question was replaced by the
   * review, so it is mounted again — from the latest copy of its answer
   * (latestDraftsRef), not the one it was opened with. Nothing can change an
   * answer while a review is showing, and the move to it saved first, so this
   * is also what the server holds.
   */
  const backToQuestion = useCallback(() => {
    setQuestion((current) => (
      current?.questionInstanceId && latestDraftsRef.current.has(current.questionInstanceId)
        ? { ...current, _draftResponse: latestDraftsRef.current.get(current.questionInstanceId) }
        : current
    ));
    setView({ kind: 'question' });
  }, []);

  const returnToFullscreen = () => {
    document.documentElement?.requestFullscreen?.().catch(() => {});
  };

  // See TABBABLE: Tab from the last control comes round to the first, and
  // Shift+Tab from the first to the last, instead of leaving the page.
  const focusEdge = useCallback((edge) => {
    const root = rootRef.current;
    if (!root) return;
    const reachable = [...root.querySelectorAll(TABBABLE)].filter((element) => (
      !element.hasAttribute('data-secure-focus-guard')
      && !element.closest('[inert]')
      && element.getClientRects().length > 0
    ));
    if (edge !== 'first') reachable.reverse();
    // The first one that really takes focus (a hidden control silently refuses).
    const target = reachable.find((element) => { element.focus(); return document.activeElement === element; });
    if (!target) pauseRef.current?.focus();
  }, []);

  // The pause screen takes focus (everything behind it is inert, so typing
  // cannot reach an answer box under it), and gives it back afterwards to
  // where the student was working.
  const paused = pauseKind(session?.status);
  useEffect(() => {
    if (!paused) return undefined;
    pauseRef.current?.focus();
    return () => {
      const last = lastFocusRef.current;
      if (last?.isConnected && typeof last.focus === 'function' && !last.closest('[inert]')) last.focus();
    };
  }, [paused]);

  // A start screen opened without the session asks the student's list for it
  // (read-only), so it can say whether the test is new or resumed and how
  // much time it has. Until it answers, or if it cannot, the card's delivery
  // facts stand in.
  useEffect(() => {
    if (sessionPreview || !examSessionId || session) return undefined;
    let cancelled = false;
    listStudentSecureExamSessions()
      .then((result) => {
        const found = (Array.isArray(result?.sessions) ? result.sessions : []).find((entry) => entry?.examSessionId === examSessionId);
        if (!cancelled && found) setLoadedPreview(found);
      })
      .catch(() => { /* the delivery facts stand in */ });
    return () => { cancelled = true; };
  }, [sessionPreview, examSessionId, session]);

  // Once the finished view is committed, clear again: finishing clears the
  // session's drafts while the item is still mounted, and anything the tool
  // wrote on its way out would otherwise stay on a shared device. A parent's
  // effect runs after its unmounting children's cleanups.
  useEffect(() => {
    if (session?.examSessionId && terminal.has(session.status)) clearLocalDrafts(session.examSessionId);
  }, [session?.examSessionId, session?.status]);

  const finish = useCallback(async (reason = 'studentSubmit') => {
    const active = sessionRef.current;
    if (!active?.examSessionId || terminal.has(active.status) || finishingRef.current) return;
    finishingRef.current = true;
    setBusyState(true); setError(''); setNavigatorOpen(false);
    try {
      // The answer being typed when Submit was pressed is part of the exam: the
      // server finalizes from the last SAVED draft, so save it first. At the
      // deadline the test ends either way.
      const saved = await saveDraftNow();
      if (!saved.ok && reason !== 'timeExpired') {
        if (!handleProblem(saved.problem)) setError(unsavedMessage(saved.problem));
        return;
      }
      const result = await finalizeSecureExam({ examSessionId: active.examSessionId, reason });
      pendingDraftRef.current = null;
      latestDraftsRef.current.clear();
      clearLocalDrafts(active.examSessionId);
      setSession(result.session); setQuestion(null); setNavigatorOpen(false);
      onFinished?.(result.session);
    } catch (finishError) {
      if (reason === 'timeExpired') {
        /*
         * The server keeps the clock. A deadline it has not reached yet means
         * a teacher added time (the header counts down to the new deadline and
         * the test goes on), or this device's clock runs a little ahead of the
         * server's — then the test is turned in as soon as the server agrees,
         * without telling an online student to reconnect. Only a server that
         * could not be reached at all is a connection problem.
         */
        const fresh = await refreshSession();
        const deadline = Number(fresh?.expiresAt);
        if (!fresh) {
          setError(TIME_UP_OFFLINE);
          window.setTimeout(() => finishRef.current?.('timeExpired'), 5000);
        } else if (!terminal.has(fresh.status) && Number.isFinite(deadline) && deadline > 0 && Date.now() >= deadline) {
          setNotice(TIME_UP_WAITING);
          window.setTimeout(() => finishRef.current?.('timeExpired'), 3000);
        }
      } else {
        const problem = classifySecureExamError(finishError, { expiresAt: active.expiresAt });
        if (!handleProblem(problem)) setError(problem.message || 'The test could not be submitted yet. Try again.');
      }
    } finally {
      finishingRef.current = false;
      setBusyState(false);
    }
  }, [handleProblem, onFinished, refreshSession, saveDraftNow, setBusyState]);
  finishRef.current = finish;

  const onTimeExpired = useCallback(() => { finishRef.current?.('timeExpired'); }, []);

  const policyTitle = getExamPolicy(examType).title;
  // What the start screen knows about the session: what the student's list
  // passed in, or what this screen asked the list for itself.
  const startPreview = sessionPreview && typeof sessionPreview === 'object' ? sessionPreview : loadedPreview;
  const examTitle = title || startPreview?.title || (courseTest ? 'Secure Test' : `${policyTitle} practice test`);

  if (!session) {
    const rules = startScreenRules({
      courseTest,
      questionCount: startPreview?.requiredQuestions ?? delivery?.questionCount ?? null,
      allowance: startScreenTime({ session: startPreview, delivery, courseTest }),
      calculatorMode: courseTest ? (delivery?.calculatorMode || null) : null,
      modules: Boolean(startPreview && readNavigation(startPreview).modules),
      automaticResults: !courseTest && startPreview?.releasePolicy === 'automatic',
      lockThreshold: startPreview?.integrityLockThreshold,
    });
    const resuming = Boolean(startPreview?.status) && startPreview.status !== EXAM_RUNTIME_STATES.NOT_STARTED;
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '20px 16px', boxSizing: 'border-box' }}>
        <section style={{ width: 'min(600px,100%)', textAlign: 'left', padding: 'clamp(18px, 5vw, 30px)', border: '1px solid var(--mm-border)', borderRadius: 14, background: 'var(--mm-surface)', boxSizing: 'border-box' }}>
          <h1 style={{ marginTop: 0, fontSize: 'clamp(20px, 5vw, 26px)', lineHeight: 1.25, color: 'var(--mm-text-strong)' }}>{examTitle}</h1>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--mm-text-strong)' }}>How this test works</h2>
          <ul data-secure-start-rules="" style={{ margin: '0 0 16px', paddingLeft: 20, color: 'var(--mm-text)', lineHeight: 1.6 }}>
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
          {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}
          <button type="button" disabled={busy} onClick={start} style={primaryButton(!busy)}>{busy ? 'Opening…' : (startLabel || (resuming ? 'Resume test' : 'Start test'))}</button>
        </section>
      </div>
    );
  }

  if (terminal.has(session.status)) {
    const summary = finishedSummary(session, { courseTest });
    const showResults = summary.canSeeResults && typeof onOpenResults === 'function';
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '20px 16px', boxSizing: 'border-box' }}>
        <section role="status" data-secure-finished={session.status} style={{ width: 'min(560px,100%)', textAlign: 'center', padding: 'clamp(20px, 5vw, 30px)', borderRadius: 14, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', boxSizing: 'border-box' }}>
          <h1 style={screenTitle}>{summary.title}</h1>
          <p style={{ lineHeight: 1.55 }}>{summary.message}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
            {showResults && <button type="button" onClick={() => onOpenResults(session)} style={primaryButton(true)}>See your results</button>}
            {onExitAfterFinished && <button type="button" onClick={onExitAfterFinished} style={showResults ? secondaryButton(true) : primaryButton(true)}>{exitLabel || 'Back to Tests & Exams'}</button>}
          </div>
        </section>
      </div>
    );
  }

  const current = Number.isInteger(position) ? position : null;
  const next = current === null ? null : nextTarget(navigation, current);
  const previous = current === null ? null : previousTarget(navigation, current);
  const pause = pauseKind(session.status);
  const allowance = timeAllowance(session);
  const threshold = Number(session.integrityLockThreshold) || DEFAULT_INTEGRITY_LOCK_THRESHOLD;
  const fullscreenAvailable = typeof document !== 'undefined' && document.fullscreenEnabled !== false && typeof document.documentElement?.requestFullscreen === 'function';
  const reviewing = view.kind === 'review' || view.kind === 'moduleEnd';
  const jumpTo = (targetPosition) => move(targetFor(navigation, targetPosition));
  // Behind a pause the test cannot be reached — not by a click, not by Tab,
  // not by typing into an answer box under the pause.
  const surfaceInert = Boolean(pause);
  /*
   * THE EXAM'S OWN TOOLS: the Digital SAT reference sheet, and a graphing
   * calculator wherever the item's calculator policy is graphing — resolved
   * from the same inputs the question runtime gives its calculator, so the two
   * never disagree (secureExamTools.js). They live in the toolbar and are
   * mounted once for the session, so a student's graphed lines carry from
   * question to question; the question column is padded clear of them.
   */
  const examSupportProfile = (courseTest || session.accommodationsConfirmed) && studentSupportProfile
    ? assessmentSupportProfile(studentSupportProfile)
    : null;
  const tools = resolveSecureExamTools({
    examType: session.examType || examType,
    sessionCalculatorMode: session.calculatorMode || null,
    question,
    studentSupportProfile: examSupportProfile,
    accommodationConfirmed: courseTest || session.accommodationsConfirmed === true,
  });
  const toolLaunchers = (tools.referenceSheet || tools.graphingCalculator) ? (
    <>
      {tools.referenceSheet && <SatReferenceSheet buttonStyle={EXAM_HEADER_CONTROL} onOpenChange={setReferenceSheetOpen} />}
      <GraphingCalculatorPanel
        available={tools.graphingCalculator && !pause}
        launcherStyle={EXAM_HEADER_CONTROL}
        onOpenChange={setGraphingCalculatorOpen}
        onOpened={() => { if (question?.questionInstanceId) calculatorUsedRef.current.add(question.questionInstanceId); }}
      />
    </>
  ) : null;

  return <div ref={rootRef} data-secure-exam-status={session.status} style={{ minHeight: '100dvh', background: 'var(--mm-surface-sunken)', position: 'relative' }}>
    <span tabIndex={0} data-secure-focus-guard="start" onFocus={() => focusEdge('last')} style={focusGuardStyle} />
    {integrityNotice && session.status === EXAM_RUNTIME_STATES.IN_PROGRESS && (
      <div role="alert" data-secure-integrity-warning="" style={{ ...bannerStyle('warning'), position: 'fixed', top: 12, left: 0, right: 0, margin: '0 auto', zIndex: WARNING_LAYER, background: 'var(--mm-warning-bg)', boxShadow: 'var(--mm-shadow-lg)', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span><strong>Stay in the test window.</strong> {INTEGRITY_WARNING_TEXT}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {fullscreenAvailable && !fullscreen && <button type="button" onClick={returnToFullscreen} style={primaryButton(true)}>Return to full screen</button>}
          <button type="button" onClick={() => setIntegrityNotice(false)} style={secondaryButton(true)}>OK</button>
        </span>
      </div>
    )}
    <div inert={surfaceInert || undefined} data-secure-exam-surface="" onFocus={(event) => { lastFocusRef.current = event.target; }} style={toolbarHeight ? { '--mm-exam-toolbar-offset': `${toolbarHeight}px` } : undefined}>
      <ExamPrepHeader
        examType={session.examType || examType}
        title={courseTest ? (session.title || examTitle) : null}
        questionOrdinal={(current ?? navigation.cursor) + 1}
        totalQuestions={navigation.total || session.requiredQuestions}
        expiresAt={session.expiresAt}
        onTimeExpired={onTimeExpired}
        reviewFlagged={currentFlagged}
        onToggleReviewFlag={!reviewing && question && !pause ? toggleFlag : null}
        onOpenNavigator={navigation.total ? (navigatorOpen ? () => setNavigatorOpen(false) : openNavigator) : null}
        navigatorOpen={navigatorOpen}
        navigatorId="secure-question-list"
        extendedTime={allowance.extended}
        tools={toolLaunchers}
      />
      {navigatorOpen && !pause && (
        <SecureExamNavigator
          id="secure-question-list"
          navigation={navigation}
          current={current}
          busy={busy}
          onJump={(cell) => move(cell.target)}
          onReview={() => move({ kind: 'review' })}
          onClose={() => setNavigatorOpen(false)}
        />
      )}
      {session.watermarkEnabled !== false && <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'grid', placeItems: 'center', opacity: .025, fontSize: 'clamp(36px,10vw,100px)', fontWeight: 900, transform: 'rotate(-20deg)' }}>MATHMASTER SECURE</div>}
      {notice && <div role="status" data-secure-notice="" style={bannerStyle('info')}>{notice}</div>}
      {error && <div role="alert" style={bannerStyle('error')}>{error}</div>}
      <div ref={columnRef} data-secure-question-column="" style={{ paddingLeft: room.paddingLeft, paddingRight: room.paddingRight }}>
      {reviewing ? (
        <SecureExamSubmitReview
          mode={view.kind === 'moduleEnd' ? 'moduleEnd' : 'submit'}
          navigation={navigation}
          finishing={view.target?.finishing || null}
          next={view.target?.next || null}
          courseTest={courseTest}
          busy={busy}
          onJump={jumpTo}
          onBack={backToQuestion}
          onSubmit={() => finish('studentSubmit')}
          onContinue={() => move({ kind: 'open', position: view.target.next.start, closeModule: true })}
        />
      ) : (
        <>
          {recordedHere ? (
            <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 24px', boxSizing: 'border-box' }}>
              <section role="status" style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 'clamp(18px, 4vw, 30px)' }}>
                <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Question {(current ?? 0) + 1}</div>
                <p style={{ margin: '10px 0 6px', fontSize: 18, fontWeight: 800, color: 'var(--mm-text-strong)' }}>This answer was recorded earlier and can&apos;t be changed.</p>
                <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>Use Next to keep going, or open the question list.</p>
              </section>
            </main>
          ) : question ? (
            <SecureExamQuestionPlayer
              key={question?.questionInstanceId || 'waiting'}
              examType={session.examType || examType}
              sessionCalculatorMode={session.calculatorMode || null}
              question={question}
              draftKey={itemDraftKey(session.examSessionId, question?.questionInstanceId)}
              initialResponsePayload={question?._draftResponse}
              studentSupportProfile={courseTest || session.accommodationsConfirmed ? studentSupportProfile : null}
              accommodationConfirmed={courseTest || session.accommodationsConfirmed === true}
              busy={busy || Boolean(pause)}
              navigationMode
              onSubmit={saveItemNow}
              onDraftChange={autosaveDraft}
            />
          ) : (
            <div role="status" style={{ padding: 36, textAlign: 'center', color: 'var(--mm-text-muted)' }}>
              {busy || pause ? 'Opening the question…' : (
                <>
                  <p style={{ margin: '0 0 12px' }}>This question didn&apos;t open.</p>
                  <button type="button" onClick={() => move(targetFor(navigation, current ?? navigation.cursor))} style={secondaryButton(true)}>Try again</button>
                </>
              )}
            </div>
          )}
          <nav aria-label="Move between questions" style={{ width: 'min(820px, 100%)', margin: `${question && !recordedHere ? -40 : 0}px auto 0`, padding: '0 18px 32px', boxSizing: 'border-box', display: 'grid', gap: 10, position: 'relative' }}>
            {question && saveState !== 'idle' && (
              <p role="status" aria-live="polite" data-secure-save-state={saveState} style={{ margin: 0, fontSize: 13, fontWeight: 700, color: saveState === 'saved' ? 'var(--mm-success-text)' : saveState === 'saving' ? 'var(--mm-text-muted)' : 'var(--mm-warning-text)' }}>
                {SAVE_LABEL[saveState]}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" data-secure-nav="previous" onClick={() => move(previous)} disabled={busy || !previous} style={secondaryButton(!busy && Boolean(previous))}>← Previous</button>
              <button type="button" data-secure-nav="next" onClick={() => move(next)} disabled={busy || !next} style={primaryButton(!busy && Boolean(next))}>{nextActionLabel(next)} →</button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button type="button" data-secure-nav="review" onClick={() => move({ kind: 'review' })} disabled={busy} style={{ ...secondaryButton(!busy), background: 'transparent' }}>Review and submit</button>
            </div>
          </nav>
        </>
      )}
      </div>
    </div>
    {pause && (
      <div ref={pauseRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="secure-pause-title" aria-describedby="secure-pause-detail" data-secure-pause={pause} style={{ position: 'fixed', inset: 0, zIndex: PAUSE_LAYER, background: 'rgba(32,33,36,.94)', color: '#fff', display: 'grid', placeItems: 'center', padding: 24, outline: 'none' }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          {pause === 'teacher' ? (
            <>
              <h1 id="secure-pause-title" style={pauseTitle}>Your teacher paused the test</h1>
              <p id="secure-pause-detail" style={{ lineHeight: 1.55, color: '#e8eaed' }}>Your answers are saved. Wait here — it will continue when your teacher resumes it.</p>
            </>
          ) : (
            <>
              <h1 id="secure-pause-title" style={pauseTitle}>Your test is paused</h1>
              <p id="secure-pause-detail" style={{ lineHeight: 1.55, color: '#e8eaed' }}>{integrityPauseText(threshold)}</p>
            </>
          )}
          <p style={{ color: '#bdc1c6', fontSize: 14 }}>This screen continues on its own when your teacher lets you back in.</p>
        </div>
      </div>
    )}
    <span tabIndex={0} data-secure-focus-guard="end" onFocus={() => focusEdge('first')} style={focusGuardStyle} />
  </div>;
};

export default SecureExamContainer;
