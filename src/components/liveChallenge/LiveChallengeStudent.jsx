import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import QuestionEngineView from '../../QuestionEngine.jsx';
import { publicLeaderboard, LIVE_PROVISIONAL_MAX_POINTS } from '../../../functions/shared/liveChallenge.mjs';
import { acceptChallengeSnapshot, calibrateChallengeClock, challengePhaseAt, monotonicRoundOrigin } from '../../../functions/shared/liveChallengeParity.mjs';
import { getScoringStrategy, leaderboardOptionsFor, SCORE_ACCUMULATION } from '../../../functions/shared/liveChallengeScoring.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { PROJECTION_KIND, standingsFromProjection } from '../../../functions/shared/liveChallengeStandingsProjection.mjs';
import { calculateStepPartialCredit, emptyQuestionRecord, recordQuestionStep } from '../../attemptPolicy.js';
import { hasMeaningfulRawPathResponse, questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import { CHALLENGE_STAGE, GO_FLASH_MS, personalRoundClock, studentGuidance } from '../../platform/liveChallenge/challengeShellModel.js';
import { speakAloud, speechAvailable, stopSpeaking } from '../../platform/language/speechText.js';
import { projectionBoardRows, rewardSummaryLines, roundResultsView, scorePresentation, standingsRows } from '../../platform/liveChallenge/challengeStandingsModel.js';
import { readLastSeenRound, roundsClosedWhileAway, seenRoundOf, unansweredRounds, missedRoundsNotice, writeLastSeenRound } from '../../platform/liveChallenge/challengeMissedRounds.js';
import { normalizeMatchRecap, recapHighlights } from '../../platform/liveChallenge/challengeRecapModel.js';
import { PUBLIC_TOP_COUNT, finalPlaceIsHeadline, roomShowsFullStandings } from '../../../functions/shared/liveChallengePrivacy.mjs';
import { projectorBoardLimit } from '../../platform/liveChallenge/liveChallengeProjectorModel.js';
import { roomFullRoundMs, storedTimeMultiplier } from '../../../functions/shared/liveChallengeAccommodations.mjs';
import { resolveSupportEntitlements } from '../../../functions/shared/supportEntitlements.mjs';
import { useChallengeClock, usePreviousRoundSummary, useRoundSolution, useRoundSummary } from '../../platform/liveChallenge/challengeHooks.js';
import { SOLUTION_STATE, roundSolutionState, solutionRevealed } from '../../platform/liveChallenge/challengeSolutionModel.js';
import { studentConnectionState } from '../../platform/liveChallenge/challengePresenceModel.js';
import LiveChallengeFieldQuestion from './LiveChallengeFieldQuestion.jsx';
import { ChallengeCountdown, ChallengeShellStyles, Confetti, ConnectionPill } from './ChallengeShellParts.jsx';
import { StudentFinalCard, StudentGuidance, StudentLobbyCard, StudentMatchRecap, StudentRoundResultsCard } from './ChallengeStudentShell.jsx';
import { RoundSolutionPanel } from './ChallengeSolutionParts.jsx';
import {
  joinLiveChallenge,
  calibrateLiveChallengeClock,
  ensureLiveChallengeFinalStandings,
  getLiveChallengeMatchRecap,
  readLiveChallengeRound,
  reportLiveChallengeProgress,
  submitLiveChallengeResponse,
  timestampMillis,
  watchLiveChallengePlayer,
  watchLiveChallengeRoom,
  watchLiveChallengeStandings,
} from '../../platform/liveChallenge/liveChallengeService.js';

// Graph Feature Rush plays on its own full-screen surface, loaded only for a
// rush room — and fetched while the lobby waits, so Round 1 opens at once.
const loadGraphFeatureRushRound = () => import('./GraphFeatureRushRound.jsx');
const GraphFeatureRushRound = lazy(loadGraphFeatureRushRound);

function useMonotonicNow(active = true) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// The server's answer to this device's locked response, kept for the round so
// a refresh shows the result instead of reopening a question already answered.
const challengeResultKey = (roomId, roundIndex, roundVersion) => `live-challenge-result-${roomId}-${roundIndex}-${roundVersion || 0}`;
const readStoredJson = (key) => {
  if (!key) return null;
  try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
};
const writeStoredJson = (key, value) => {
  if (!key) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* the server still holds the answer */ }
};

/*
 * A STABLE QUESTION ENGINE. The round around the question redraws its clock
 * four times a second and its board whenever a classmate makes progress; the
 * engine — every interactive tool a question can use — must not redraw with
 * them. This wrapper hands QuestionEngine the same element until something it
 * SHOWS changes (the question, its lock, its record), and routes every
 * callback to the round's latest handler through a ref, so a skipped render
 * can never leave the engine holding an old one.
 */
function QuestionEngine(props) {
  const latest = useRef(props);
  latest.current = props;
  const handlers = useMemo(() => ({
    onStepGrade: (...args) => latest.current.onStepGrade?.(...args),
    onResponseStateChange: (...args) => latest.current.onResponseStateChange?.(...args),
    onGrade: (...args) => latest.current.onGrade?.(...args),
    submit: (...args) => latest.current.serverGrading?.submit?.(...args),
  }), []);
  const {
    question, questionRecord, studentProfile, attemptsDoNotExpire, activityRole,
    assignmentLocked, assignmentLockedMessage, draftKey, serverGrading,
  } = props;
  const pathToolId = serverGrading?.pathToolId;
  const recordStatus = questionRecord?.status;
  const recordAttempts = questionRecord?.attemptCount;
  return useMemo(() => (
    <QuestionEngineView
      question={question}
      questionRecord={{ status: recordStatus, attemptCount: recordAttempts }}
      studentProfile={studentProfile}
      attemptsDoNotExpire={attemptsDoNotExpire}
      activityRole={activityRole}
      assignmentLocked={assignmentLocked}
      assignmentLockedMessage={assignmentLockedMessage}
      draftKey={draftKey}
      serverGrading={pathToolId === undefined ? undefined : { pathToolId, submit: handlers.submit }}
      onResponseStateChange={handlers.onResponseStateChange}
      onStepGrade={handlers.onStepGrade}
      onGrade={handlers.onGrade}
    />
  ), [question, recordStatus, recordAttempts, studentProfile, attemptsDoNotExpire, activityRole, assignmentLocked, assignmentLockedMessage, draftKey, pathToolId, handlers]);
}

/*
 * Exported so a teacher's dry run plays the same round a student plays.
 * `submitResponse` is injectable so rehearsal can grade without writing game
 * score while preserving the exact student renderer and countdown behavior.
 */
export function ChallengeRound({
  room,
  alias,
  // This student's own public row as the engine ranks a row (publicLeaderboard):
  // it says whether the server already holds this round's answer. A rehearsal
  // has none.
  //
  // NO BOARD UNDER THE QUESTION. A round shows no standings and no rank while
  // it can be answered: a student thinking about a question should not be
  // watching their name slide down a list (liveChallengePrivacy.mjs). Their
  // place comes with the round's results, on their own screen.
  selfEntry = null,
  studentProfile,
  onResult,
  submitResponse = submitLiveChallengeResponse,
  reportProgress = reportLiveChallengeProgress,
  beforeQuestion = null,
  // EXTENDED TIME: this student's own multiplier (their invite; 1 for everyone
  // without it). Their clock, their buzzer and their lock all follow their own
  // deadline, which is the one the server judges their answer against.
  timeMultiplier = 1,
  // READ ALOUD, for a student whose support plan grants text-to-speech.
  readAloud = false,
  // A live room keeps the server's answer across a refresh. A rehearsal does
  // not: a teacher revisiting a dry-run round should be able to answer again.
  persistResult = false,
  // What a live round says comes next (its results); a rehearsal keeps its own words.
  liveShell = false,
}) {
  const question = room.currentQuestion;
  const roundIndex = Number(room.currentRound) || 0;
  // The round's clock re-renders on a quarter-second tick; every reading below
  // is taken at render time, and the countdown's steps and GO get renders of
  // their own (below), so 3 · 2 · 1 and the question land on the server's
  // second — in step with the projector — not up to a tick later.
  useMonotonicNow(true);
  const [, setBoundaryRender] = useState(0);
  const monotonicNow = performance.now();
  const classEndsAtMs = timestampMillis(room.roundEndsAt);
  const startsAtMs = timestampMillis(room.startsAt || room.roundStartedAt);
  // The deadline THIS student answers against: the class's, or later when
  // their plan gives them extended time (challengeShellModel.personalRoundClock).
  const personalClock = personalRoundClock({
    startsAtMs, endsAtMs: classEndsAtMs, timeMultiplier, fullDurationMs: roomFullRoundMs(room),
  });
  const endsAtMs = personalClock.endsAtMs;
  const roundOriginMonoRef = useRef(monotonicRoundOrigin({
    monotonicNow: performance.now(),
    serverNowMs: Number(room.serverNowAtRender) || Date.now(),
    startsAtMs,
  }));
  const startsInMs = Math.max(0, roundOriginMonoRef.current - monotonicNow);
  const roundStarted = startsInMs <= 0;
  const elapsedMs = Math.max(0, monotonicNow - roundOriginMonoRef.current);
  const remainingMs = Math.max(0, personalClock.durationMs - elapsedMs);
  const paceMode = room.timingMode === 'pace';
  // A round the host has closed is over whatever its clock says; the server
  // accepts nothing more for it.
  const roundClosed = room.roundState === 'closed';
  const expired = roundClosed || (endsAtMs > 0 && remainingMs <= 0);
  const urgent = !expired && remainingMs <= 10000;
  const resultKey = persistResult ? challengeResultKey(room.roomId, roundIndex, room.roundVersion) : null;
  const [result, setResult] = useState(() => readStoredJson(resultKey));
  const pendingKey = `live-challenge-pending-${room.roomId}-${roundIndex}-${room.roundVersion || 0}`;
  const [pending, setPending] = useState(() => readStoredJson(pendingKey));
  // The student's own public row says whether the server already holds their
  // answer for this round — true after a refresh on this device or a switch to
  // another one, when no local result or pending envelope survives. It is their
  // own row, never the class's standings snapshot: a snapshot may be a second
  // stale and decides nothing.
  const answeredOnServer = Number(selfEntry?.answeredRound) === roundIndex;
  const answeredOnServerRef = useRef(answeredOnServer);
  answeredOnServerRef.current = answeredOnServer;
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const recoveredPendingRef = useRef(Boolean(pending));
  const submissionInFlightRef = useRef(false);
  const submissionLockRef = useRef(Boolean(pending || result));
  const pendingRef = useRef(pending);
  const resultRef = useRef(result);
  const latestRawResponseRef = useRef(null);
  const [progressRawResponse, setProgressRawResponse] = useState(null);
  const wasExpiredRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [stepRecord, setStepRecord] = useState(() => emptyQuestionRecord());
  const stepRecordRef = useRef(stepRecord);
  const workingPoints = useMemo(
    () => Math.round((LIVE_PROVISIONAL_MAX_POINTS * clampPercent(calculateStepPartialCredit(stepRecord.stepGrades, stepRecord.variantIndex))) / 100),
    [stepRecord],
  );
  const secureQuestion = useMemo(
    () => questionFromToolPayload(question),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.questionInstanceId, question?.pathToolId],
  );

  pendingRef.current = pending;
  resultRef.current = result;

  // Read aloud speaks this round's prompt only; a new round, or leaving the
  // game, silences whatever is still being read.
  const promptText = typeof question?.prompt === 'string' ? question.prompt : '';
  useEffect(() => () => stopSpeaking(), [roundIndex, question?.questionInstanceId]);

  useEffect(() => {
    const stored = readStoredJson(resultKey);
    setResult(stored);
    resultRef.current = stored;
    setAlreadyRecorded(false);
    setSubmitError('');
    const fresh = emptyQuestionRecord();
    roundOriginMonoRef.current = monotonicRoundOrigin({
      monotonicNow: performance.now(),
      serverNowMs: Number(room.serverNowAtRender) || Date.now(),
      startsAtMs,
    });
    stepRecordRef.current = fresh;
    setStepRecord(fresh);
    latestRawResponseRef.current = null;
    setProgressRawResponse(null);
    wasExpiredRef.current = false;
    submissionLockRef.current = Boolean(pendingRef.current || stored);
    // The origin is intentionally not recalculated when wall-clock calibration
    // refreshes; device clock changes during a round cannot alter elapsed time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex, question?.questionInstanceId, pendingKey]);

  // A render at each countdown step and at GO, off this round's origin.
  useEffect(() => {
    const untilStart = roundOriginMonoRef.current - performance.now();
    if (untilStart <= 0) return undefined;
    const timers = [3_000, 2_000, 1_000, 0]
      .map((before) => untilStart - before)
      .filter((delay) => delay > 0)
      .map((delay) => window.setTimeout(() => setBoundaryRender((value) => value + 1), delay + 5));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // The same identity as the origin itself (the effect above resets it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex, question?.questionInstanceId, pendingKey]);

  // The same lock and messages for each way a round can already be over for
  // this student.
  const settle = (grading) => {
    setResult(grading);
    resultRef.current = grading;
    writeStoredJson(resultKey, grading);
    setPending(null);
    pendingRef.current = null;
    window.localStorage.removeItem(pendingKey);
    onResult?.(grading);
  };
  const settleAsAlreadyRecorded = () => {
    // The server refused a second answer for this round: the first one is
    // recorded. Nothing is lost, so this is information, not an error.
    setPending(null);
    pendingRef.current = null;
    window.localStorage.removeItem(pendingKey);
    setAlreadyRecorded(true);
  };

  const reportedRef = useRef('');
  useEffect(() => {
    if (result || answeredOnServer || expired || !room?.roomId) return undefined;
    const signature = `${workingPoints}:${JSON.stringify(progressRawResponse || null)}`;
    if (signature === reportedRef.current) return undefined;
    const timer = window.setTimeout(() => {
      reportedRef.current = signature;
      Promise.resolve(reportProgress({
        roomId: room.roomId,
        roundIndex,
        roundVersion: Number(room.roundVersion) || 0,
        roundToken: room.roundToken || '',
        provisionalPoints: workingPoints,
        ...(progressRawResponse ? { responsePayload: { raw: progressRawResponse } } : {}),
      })).catch(() => {});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [workingPoints, progressRawResponse, result, answeredOnServer, expired, room?.roomId, room?.roundVersion, room?.roundToken, roundIndex, reportProgress]);

  const submit = async (responsePayload, { atRoundEnd = false } = {}) => {
    if (resultRef.current || pendingRef.current || submissionLockRef.current || answeredOnServerRef.current || (!atRoundEnd && expired) || !roundStarted) return null;
    submissionLockRef.current = true;
    setSubmitError('');
    const submissionId = globalThis.crypto?.randomUUID?.() || `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const capture = {
      roomId: room.roomId,
      roundIndex,
      roundVersion: Number(room.roundVersion) || 0,
      roundToken: room.roundToken || '',
      submissionId,
      responsePayload,
      humanElapsedMs: atRoundEnd
        ? Math.max(0, endsAtMs - startsAtMs)
        : Math.max(0, performance.now() - roundOriginMonoRef.current),
      connectionQuality: room.connectionQuality || 'unknown',
      timingDegraded: room.connectionQuality === 'degraded',
      autoFinalizedAtRoundEnd: atRoundEnd,
    };
    // Lock and acknowledge before awaiting transport. The exact payload/id is
    // retained so a transient failure retries rather than creating an attempt.
    setPending(capture);
    pendingRef.current = capture;
    window.localStorage.setItem(pendingKey, JSON.stringify(capture));
    submissionInFlightRef.current = true;
    try {
      const grading = await submitResponse(capture);
      settle(grading);
      return {
        isCorrect: grading.isCorrect,
        status: grading.isCorrect ? 'correct' : 'attempted',
        attemptCount: 1,
        remainingAttempts: 0,
        expired: false,
        message: grading.isCorrect
          ? `${grading.comebackBonus > 0 ? 'Comeback! ' : grading.secondChance ? 'Second chance · ' : ''}Correct · +${grading.pointsAwarded} points`
          : `${Number(grading.scorePercent) || 0}% credit · +${Number(grading.pointsAwarded) || 0} points`,
      };
    } catch (error) {
      if (/already-exists/.test(String(error?.code || ''))) settleAsAlreadyRecorded();
      else setSubmitError(error?.message || 'Your answer could not be submitted.');
      return null;
    } finally {
      submissionInFlightRef.current = false;
      submissionLockRef.current = Boolean(pendingRef.current || resultRef.current);
    }
  };

  useEffect(() => {
    const transitionedToExpired = expired && !wasExpiredRef.current;
    wasExpiredRef.current = expired;
    if (!transitionedToExpired || !secureQuestion || resultRef.current || pendingRef.current || answeredOnServerRef.current || submissionInFlightRef.current) return;
    // The buzzer sends work the clock ran out on. A round the host closed is
    // not accepting it, so sending would only end in an error.
    if (roundClosed) return;
    const rawWork = latestRawResponseRef.current;
    // Any meaningful solver state is worth sending at the buzzer. The secure
    // server grader decides whether it earns 0%, partial credit, or full credit;
    // requiring a locally flagged "correct" step here could silently discard
    // mathematically valid progress that used a different route.
    if (!hasMeaningfulRawPathResponse(rawWork)) return;
    void submit({ raw: rawWork }, { atRoundEnd: true });
    // `submit` is deliberately the same finalization path used by the button.
    // Refs provide the synchronous lock that wins a submit/deadline race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, secureQuestion]);

  const retryPending = async () => {
    if (!pending || result || submissionInFlightRef.current) return;
    submissionInFlightRef.current = true;
    setSubmitError('');
    try {
      const grading = await submitResponse(pending);
      settle(grading);
    } catch (error) {
      const code = String(error?.code || '');
      if (/already-exists/.test(code)) settleAsAlreadyRecorded();
      else if (/failed-precondition|deadline-exceeded|not-found/.test(code)) {
        setPending(null);
        pendingRef.current = null;
        window.localStorage.removeItem(pendingKey);
        setSubmitError('That round has closed. Your screen has caught up safely.');
      } else setSubmitError(error?.message || 'Still reconnecting. Your locked answer is safe.');
    } finally {
      submissionInFlightRef.current = false;
      submissionLockRef.current = Boolean(pendingRef.current || resultRef.current);
    }
  };

  useEffect(() => {
    if (!pending || result) return undefined;
    const recover = () => retryPending();
    const timer = recoveredPendingRef.current ? window.setTimeout(() => {
      recoveredPendingRef.current = false;
      recover();
    }, 0) : null;
    window.addEventListener('online', recover);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener('online', recover);
    };
    // Retry identity is the persisted envelope; never manufacture a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.submissionId, result]);

  const answerRecorded = Boolean(result) || answeredOnServer || alreadyRecorded;
  const locked = answerRecorded || Boolean(pending);
  const perRoundScoring = getScoringStrategy(result?.scoringStrategyId || room.scoringStrategyId).accumulation === SCORE_ACCUMULATION.PER_ROUND;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {beforeQuestion}
      <section
        style={{
          display: 'grid',
          gap: 10,
          padding: '14px 17px',
          borderRadius: 14,
          background: urgent ? 'linear-gradient(135deg,#7f1d1d,#a50e0e)' : 'linear-gradient(135deg,#174ea6,#1a73e8)',
          color: '#fff',
          transition: 'background .5s',
          boxShadow: '0 2px 10px rgba(23,78,166,.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,.18)', fontWeight: 900, fontSize: 13 }}>{alias}</span>
            <span style={{ fontWeight: 900, fontSize: 15 }}>{room.secondChanceOf != null ? `FINAL ROUND ${roundIndex - Number(room.scheduledRoundCount || room.roundCount) + 1}` : `Round ${roundIndex + 1} of ${room.roundCount}`}</span>
            <span style={{ opacity: .82, fontSize: 13 }}>{question?.teksCode || 'Mixed review'}</span>
            {/* Only once the question is on screen: reading it during the
                countdown would hand this student a head start. */}
            {readAloud && roundStarted && promptText && (
              <button
                type="button"
                data-mm-read-aloud="1"
                onClick={() => speakAloud(promptText)}
                style={{ minHeight: 44, padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.14)', color: '#fff', fontWeight: 900, cursor: 'pointer' }}
              >
                <span aria-hidden="true">🔊 </span>Read aloud
              </button>
            )}
          </div>
          <div
            aria-label={roundStarted ? `${Math.ceil(remainingMs / 1000)} seconds left` : `Round starts in ${Math.ceil(startsInMs / 1000)} seconds`}
            style={{
              fontSize: 40,
              fontWeight: 1000,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              animation: urgent ? 'challengePulse .9s ease-in-out infinite' : 'none',
            }}
          >
            {roundStarted ? (paceMode ? `Elapsed: ${formatClock(elapsedMs)}` : formatClock(remainingMs)) : `Starts in ${Math.ceil(startsInMs / 1000)}`}
          </div>
        </div>
        {paceMode && endsAtMs > 0 && <div style={{ fontWeight: 900 }}>Round closes in {formatClock(remainingMs)}</div>}
        {/* Their clock runs longer than the projector's; say why, on their own
            screen only (nobody else's shows who has extra time). */}
        {personalClock.extended && roundStarted && <div data-mm-extended-time="1" style={{ fontSize: 13, fontWeight: 800, opacity: .9 }}>Your extra time is on — this clock is yours.</div>}

        <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
          {Array.from({ length: Math.max(1, Number(room.roundCount) || 1) }).map((_, pip) => (
            <span
              key={pip}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                background: pip < roundIndex ? 'rgba(255,255,255,.85)' : pip === roundIndex ? '#fdd663' : 'rgba(255,255,255,.25)',
                transition: 'background .3s',
              }}
            />
          ))}
        </div>

        {workingPoints > 0 && !result && (
          <div aria-live="polite" style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontWeight: 900 }}>
            <span style={{ fontSize: 13, opacity: .85 }}>Points banked this round</span>
            <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', color: '#fdd663' }}>+{workingPoints.toLocaleString()}</span>
            <span style={{ fontSize: 12, opacity: .8 }}>keep going — every correct step adds more</span>
          </div>
        )}
      </section>

      <div style={{ position: 'relative' }}>
      {/* 3 · 2 · 1 off the round's authoritative start (this device's
          monotonic anchor of it). The question stays mounted — so GO shows
          it at once — but unseen until then; GO never blocks a tap. */}
      {(!roundStarted || elapsedMs < GO_FLASH_MS) && (
        <div data-mm-round-countdown={roundStarted ? 'go' : 'counting'} style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', borderRadius: 14, pointerEvents: roundStarted ? 'none' : 'auto', background: roundStarted ? 'transparent' : 'radial-gradient(120% 90% at 50% 0%, #22325a 0%, #141a2b 100%)', minHeight: 220 }}>
          <ChallengeCountdown
            look="student"
            clock={{ countdownStep: roundStarted ? null : Math.min(3, Math.max(1, Math.ceil(startsInMs / 1000))), showGo: roundStarted }}
            title={room.secondChanceOf != null ? 'Second Chance round' : `Round ${roundIndex + 1} of ${room.roundCount}`}
          />
        </div>
      )}
      <div style={{ visibility: roundStarted ? 'visible' : 'hidden' }}>
      {secureQuestion ? (
        <section style={{ background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', borderRadius: 14, border: '1px solid var(--mm-border)', overflow: 'hidden' }}>
          <QuestionEngine
            key={question?.questionInstanceId}
            question={secureQuestion}
            questionRecord={{ status: result?.isCorrect ? 'correct' : result ? 'attempted' : 'unattempted', attemptCount: result ? 1 : 0 }}
            studentProfile={studentProfile}
            attemptsDoNotExpire
            activityRole="practice"
            assignmentLocked={locked || expired || !roundStarted}
            assignmentLockedMessage={!roundStarted ? 'The synchronized round is about to start.' : expired && !answerRecorded ? 'Time is up for this Live Challenge round.' : 'Your answer is locked in for this round.'}
            draftKey={`live-challenge-${room.roomId}-${roundIndex}`}
            serverGrading={{
              pathToolId: question.pathToolId,
              submit: async (rawWork) => submit({ raw: rawWork }),
            }}
            onResponseStateChange={(rawWork) => {
              latestRawResponseRef.current = rawWork;
              setProgressRawResponse(rawWork);
            }}
            onStepGrade={async ({ stepGrade, statePatch, supportUsage = null }) => {
              const outcome = recordQuestionStep({
                record: stepRecordRef.current,
                stepGrade,
                // Solver Race already penalizes inefficient work through time.
                // Intermediate algebra moves therefore never consume an attempt;
                // only the final locked response is graded authoritatively.
                countsAttempt: false,
                statePatch,
                supportUsage,
                maximumAttempts: Number.MAX_SAFE_INTEGER,
              });
              stepRecordRef.current = outcome.record;
              setStepRecord(outcome.record);
              return outcome.result;
            }}
            onGrade={() => null}
          />
        </section>
      ) : (
        <LiveChallengeFieldQuestion question={question} disabled={locked || expired || !roundStarted} onSubmit={submit} />
      )}
      </div>
      </div>

      {pending && !result && <div aria-live="assertive" style={{ padding: 12, borderRadius: 9, background: '#17365f', color: '#dbeafe', fontWeight: 900 }}>Answer locked in · checking it…</div>}

      {submitError && <div role="alert" style={{ padding: 11, borderRadius: 9, background: '#4a3708', color: '#ffe9a8', border: '1px solid #f9ab00' }}>{submitError}</div>}
      {pending && !result && <button type="button" onClick={retryPending}>Retry locked answer</button>}
      {!result && !pending && (answeredOnServer || alreadyRecorded) && <div aria-live="polite" style={{ padding: 12, borderRadius: 9, background: '#17365f', color: '#dbeafe', fontWeight: 900 }}>{liveShell ? 'Your answer for this round is recorded. The results show when the round ends.' : 'Your answer for this round is recorded. Wait for your teacher to start the next round.'}</div>}
      {expired && !answerRecorded && <div aria-live="polite" style={{ padding: 15, borderRadius: 11, background: 'rgba(255,255,255,.08)', color: '#eef1f6', border: '1px solid rgba(255,255,255,.16)', fontWeight: 900 }}>{liveShell ? 'Time is up! The results are coming.' : 'Time is up. Wait for your teacher to start the next round.'}</div>}
      {liveShell && result && !expired && <div aria-live="polite" data-mm-finished-early="1" style={{ padding: 12, borderRadius: 9, background: '#17365f', color: '#dbeafe', fontWeight: 900 }}>Round complete for you — waiting for the others. The results show when the round ends.</div>}
      {result && (
        <section aria-live="polite" style={{ padding: 16, borderRadius: 12, background: result.isCorrect ? 'var(--mm-success-bg)' : 'var(--mm-warning-soft)', color: result.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-warning-text)', textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 1000 }}>{result.isCorrect ? 'Correct!' : `${Number(result.scorePercent) || 0}% credit`}</div>
          {result.comebackBonus > 0 && (
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900 }}>
              Comeback! You missed the last one and got this one. +{result.comebackBonus}
            </div>
          )}
          {result.secondChance && result.recoveryPoints > 0 && (
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900 }}>
              Second chance — you got points back on this one. +{result.recoveryPoints}
            </div>
          )}
          <div style={{ marginTop: 5, fontWeight: 800 }}>
            {perRoundScoring
              // A championship strategy ranks the round first; the points above
              // are round performance, and placement points arrive at round close.
              ? `+${Number(result.pointsAwarded) || 0} round points · ${(Number(result.totalScore) || 0).toLocaleString()} championship points so far`
              // Their own points only: no rank while the class is still
              // answering (their place comes with the round's results).
              : `+${Number(result.pointsAwarded) || 0} points · Total ${(Number(result.totalScore) || 0).toLocaleString()}`}
          </div>
          {!result.secondChance && (result.speedBonus > 0 || result.streakBonus > 0) && <div style={{ marginTop: 4, fontSize: 13 }}>Accuracy base {Number(result.basePoints) || 0} · Speed +{Number(result.speedBonus) || 0} · Streak +{Number(result.streakBonus) || 0}</div>}
        </section>
      )}

    </div>
  );
}

/*
 * One closed round on a student's device — Graph Feature Rush and every
 * classic mode alike — read from the round's result document. That document
 * is written once, in the transaction that closes the round, with the
 * standings the round left behind: what a student reads here is exactly what
 * the projector shows, and a refresh or a reconnect reads it back unchanged.
 * (It never waits on the standings listener, which a rush pauses during play.)
 */
function StudentRoundResults({ room, stage, playerKey, guidance, presentation, rushRound = false }) {
  const roundIndex = Number(room.currentRound) || 0;
  const summary = useRoundSummary(room.roomId, roundIndex, true);
  const previousSummary = usePreviousRoundSummary(room.roomId, roundIndex, true);
  const view = useMemo(
    () => roundResultsView({ summary, previousSummary, selfKey: playerKey }),
    [summary, previousSummary, playerKey],
  );
  // THE WORKED SOLUTION, once nobody can answer this round. The server
  // publishes it after the round closes — and holds it while a Second Chance
  // replay of the question may still come — and the room lists it as revealed;
  // only then is it read. This screen adds its own gate on top: it asks only
  // at the results stage of a closed round, never while a round is open.
  const roundClosed = stage === CHALLENGE_STAGE.ROUND_RESULTS && room.roundState === 'closed';
  const solution = useRoundSolution(room.roomId, roundIndex, roundClosed && solutionRevealed(room, roundIndex));
  const solutionState = roundClosed ? roundSolutionState({ room, roundIndex, solution, roundClosed }) : SOLUTION_STATE.NONE;
  return (
    <StudentRoundResultsCard
      view={view}
      presentation={presentation}
      guidance={guidance}
      rushRound={rushRound}
      solutionSlot={<RoundSolutionPanel state={solutionState} solution={solution} />}
      // The projector's top few, never a small class's last place.
      boardLimit={projectorBoardLimit(room, PUBLIC_TOP_COUNT, view?.standings?.length ?? view?.fieldSize ?? null)}
    />
  );
}

// One id per browser tab, kept across a refresh of that tab: the teacher's
// roster counts game screens, and a refresh is the same screen coming back.
const CHALLENGE_SESSION_KEY = 'mm-live-challenge-session';
const launchDiagnosticKey = (roomId) => `mm-live-challenge-launch-${roomId}`;
const readLaunchDiagnostics = (roomId) => {
  if (!roomId) return { milestones: {}, reported: {} };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(launchDiagnosticKey(roomId)) || '{}');
    return {
      milestones: parsed?.milestones && typeof parsed.milestones === 'object' ? parsed.milestones : {},
      reported: parsed?.reported && typeof parsed.reported === 'object' ? parsed.reported : {},
    };
  } catch { return { milestones: {}, reported: {} }; }
};
const writeLaunchDiagnostics = (roomId, report) => {
  if (!roomId) return;
  try { window.sessionStorage.setItem(launchDiagnosticKey(roomId), JSON.stringify(report)); } catch { /* memory copy still retries */ }
};
const challengeSessionId = () => {
  const fresh = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const kept = window.sessionStorage.getItem(CHALLENGE_SESSION_KEY);
    if (kept && /^[A-Za-z0-9_-]{6,64}$/.test(kept)) return kept;
    const id = fresh();
    window.sessionStorage.setItem(CHALLENGE_SESSION_KEY, id);
    return id;
  } catch {
    return fresh();
  }
};

// This tab's sessionStorage, or null where the browser refuses it.
const tabStorage = () => {
  try { return window.sessionStorage; } catch { return null; }
};

const exitButton = { minHeight: 44, padding: '11px 20px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };

/*
 * A STUDENT'S LIVE CHALLENGE. The screen is a function of the match's stage
 * (challengeShellModel), read from the authoritative room at this device's
 * calibrated server time — never from local flags:
 *
 *   lobby         you're in, who else is, what the game is
 *   countdown     3 · 2 · 1 off the round's own start
 *   roundActive   the mode's round (a question; a rush's graphs)
 *   roundLocked   time's up — work is locked in, the results are coming
 *   roundResults  your place in the round, the points it earned, the standings
 *   completed     how you finished, what reached your wallet, the top of the class
 *   cancelled     the challenge ended; nothing is recorded
 *
 * `renderMatchRewards(roomId, { offered })` is the host's rewards card for a
 * finished match (what reached the wallet; `offered` is what the game put up,
 * in words). It is a slot, not game logic: the game's own placement and
 * points beside it are unchanged and never read rewards.
 */
export default function LiveChallengeStudent({ invite, studentProfile = {}, onExit, exitLabel = 'Back to Dashboard', renderMatchRewards = null }) {
  const [room, setRoom] = useState(null);
  // Whether the room on screen came from this device's cache (the server is
  // unreachable), and whether a server copy has arrived since the screen opened.
  const [roomFromCache, setRoomFromCache] = useState(false);
  const [everInSync, setEverInSync] = useState(false);
  // The server says the room does not exist (an invite to a game that was
  // removed): the screen says so and offers the way out, never "Opening…" forever.
  const [roomMissing, setRoomMissing] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  // THE STUDENT'S STANDINGS come from two single-document listeners, never the
  // class's player rows (every answer in the class used to be delivered to
  // every screen): their OWN public row — their score, and whether the server
  // holds this round's answer — and the room's standings SNAPSHOT — their
  // place and the top of the class (liveChallengeStandingsProjection.mjs).
  // Neither grows with the class.
  const [selfRow, setSelfRow] = useState(null);
  const [projection, setProjection] = useState(null);
  // True once each has delivered since it last (re)started.
  const [selfFresh, setSelfFresh] = useState(false);
  const [projectionFresh, setProjectionFresh] = useState(false);
  // The key the join answered with, for a screen opened without one.
  const [joinedPlayerKey, setJoinedPlayerKey] = useState(null);
  const [joining, setJoining] = useState(false);
  // The round a student walked in on, when they joined a game already running.
  const [joinedAtRound, setJoinedAtRound] = useState(null);
  // EXTENDED TIME. The student's own multiplier: the join's answer for this
  // room, else their own invite (readable only by them). Never the room's
  // `maxTimeMultiplier`, which says that someone has more time, not who.
  const [joinedTimeMultiplier, setJoinedTimeMultiplier] = useState(null);
  // Rounds that closed while this device was away (challengeMissedRounds.js).
  const [missedNotice, setMissedNotice] = useState('');
  // The student's own end-of-game recap (challengeRecapModel.js); null shows nothing.
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState('');
  const roomId = invite?.roomId || null;
  const playerKey = invite?.playerKey || joinedPlayerKey || null;
  const [clock, setClock] = useState({ offsetMs: 0, rttMs: 0, jitterMs: 0, quality: 'reconnecting', sampleCount: 0 });
  // Read by the room listener without being one of its dependencies: a clock
  // re-calibration (every 30 s) must not tear down and re-open the listener.
  const clockOffsetRef = useRef(clock.offsetMs);
  clockOffsetRef.current = clock.offsetMs;
  // A join the server refused for this room is not retried on every snapshot.
  const joinRefusedForRef = useRef(null);
  // A join that succeeded is not repeated either: while a rush round is open
  // the standings listener is paused, so "am I on the board?" cannot be asked.
  const joinedRoomRef = useRef(null);
  const sessionId = useMemo(() => challengeSessionId(), []);
  const launchDiagnosticsRef = useRef({ roomId: null, milestones: {}, reported: {} });
  const launchDiagnosticInFlightRef = useRef(false);
  const collectLaunchEvent = (launchEvent, observedRoom = room) => {
    if (!roomId) return;
    if (launchDiagnosticsRef.current.roomId !== roomId) {
      launchDiagnosticsRef.current = { roomId, ...readLaunchDiagnostics(roomId) };
    }
    // One bounded entry per event. First observation is the useful one.
    if (launchDiagnosticsRef.current.milestones[launchEvent] || launchDiagnosticsRef.current.reported[launchEvent]) return;
    launchDiagnosticsRef.current.milestones[launchEvent] = {
      clientAtMs: Date.now(),
      roomStatus: observedRoom?.status || null,
      roundIndex: Number.isInteger(Number(observedRoom?.currentRound)) ? Number(observedRoom.currentRound) : null,
    };
    writeLaunchDiagnostics(roomId, launchDiagnosticsRef.current);
  };
  const sendLaunchDiagnostics = async (extra = {}) => {
    if (!roomId || launchDiagnosticInFlightRef.current) return null;
    const pending = launchDiagnosticsRef.current.roomId === roomId
      ? launchDiagnosticsRef.current.milestones
      : readLaunchDiagnostics(roomId).milestones;
    if (!Object.keys(pending).length) {
      return extra.quality ? calibrateLiveChallengeClock({ roomId, sessionId, ...extra }) : null;
    }
    const sent = { milestones: { ...pending } };
    launchDiagnosticInFlightRef.current = true;
    try {
      const reply = await calibrateLiveChallengeClock({ roomId, sessionId, ...extra, launchReport: sent });
      for (const [event, milestone] of Object.entries(sent.milestones)) {
        if (launchDiagnosticsRef.current.milestones[event]?.clientAtMs === milestone.clientAtMs) {
          launchDiagnosticsRef.current.reported[event] = milestone.clientAtMs;
          delete launchDiagnosticsRef.current.milestones[event];
        }
      }
      writeLaunchDiagnostics(roomId, launchDiagnosticsRef.current);
      return reply;
    } finally {
      launchDiagnosticInFlightRef.current = false;
    }
  };

  useEffect(() => {
    // A different room is a different game. Nothing from the previous one —
    // its final standings, its round, an error about it — may carry over.
    setRoom(null);
    setError('');
    setRoomFromCache(false);
    setEverInSync(false);
    setRoomMissing(false);
    setJoinedAtRound(null);
    setJoinedTimeMultiplier(null);
    setMissedNotice('');
    setRecap(null);
    if (!roomId) return undefined;
    launchDiagnosticsRef.current = { roomId, ...readLaunchDiagnostics(roomId) };
    collectLaunchEvent('listener_attached', null);
    return watchLiveChallengeRoom(roomId, (next, { fromCache = false } = {}) => {
      const phase = challengePhaseAt({
        ...next,
        roundEndsAtMs: timestampMillis(next?.endsAt || next?.roundEndsAt),
      }, Date.now() + clockOffsetRef.current);
      setRoomFromCache(fromCache);
      if (!fromCache) {
        setEverInSync(true);
        setRoomMissing(!next);
      }
      setRoom((current) => acceptChallengeSnapshot(current, next ? { ...next, phase } : null));
      if (next?.status === 'running') {
        collectLaunchEvent('running_received', next);
        if (timestampMillis(next.startsAt || next.roundStartedAt) > Date.now() + clockOffsetRef.current) collectLaunchEvent('countdown_received', next);
      }
    }, (watchError) => {
      collectLaunchEvent('listener_error');
      // A screen that never mounts still reports the failure when reachable.
      window.setTimeout(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
      setError(watchError?.message || 'Could not load the Live Challenge.');
    }, { includeMetadataChanges: true });
  }, [roomId]);

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine !== false;
      setOnline(isOnline);
      collectLaunchEvent(isOnline ? 'connection_restored' : 'connection_lost');
      if (isOnline) window.setTimeout(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // The clock is calibrated while the game can still be played. A finished or
  // cancelled match needs no clock, and its screen stops reporting in.
  const calibrating = !room || room.status === 'lobby' || room.status === 'running';
  useEffect(() => {
    if (!roomId || !calibrating) return undefined;
    let stopped = false;
    let timer = 0;
    let failures = 0;
    const sample = async () => {
      try {
        const samples = [];
        for (let index = 0; index < 5; index += 1) {
          const clientSentAt = Date.now();
          // eslint-disable-next-line no-await-in-loop
          const reply = await calibrateLiveChallengeClock({ roomId });
          samples.push({ clientSentAt, clientReceivedAt: Date.now(), serverAt: reply.serverAt });
        }
        const estimate = calibrateChallengeClock(samples);
        failures = 0;
        if (!stopped) setClock(estimate);
        // The report is this screen's heartbeat on the teacher's roster: its
        // quality, and which tab it is (two tabs are two devices).
        // Piggyback anything collected so far on the normal presence heartbeat;
        // this adds no diagnostic request. A failed send leaves the bounded
        // sessionStorage report intact for reconnect or the next heartbeat.
        await sendLaunchDiagnostics({ quality: estimate.quality }).catch(() => (
          calibrateLiveChallengeClock({ roomId, quality: estimate.quality, sessionId }).catch(() => {})
        ));
        if (!stopped) timer = window.setTimeout(sample, 30000);
      } catch {
        failures += 1;
        if (!stopped) setClock((value) => ({
          ...value,
          sampleCount: Number(value.sampleCount) || 0,
          quality: 'degraded',
        }));
        // Quickly retry join calibration; after repeated failure the usable
        // degraded renderer scores from server arrival and gains no advantage.
        if (!stopped) timer = window.setTimeout(sample, failures > 5 ? 10000 : 2000);
      }
    };
    sample();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [roomId, calibrating, sessionId]);

  // GRAPH FEATURE RUSH. While a rush round is open the round screen shows the
  // student's own count (each of their taps changes their own row), and no
  // standings are published; both standings listeners pause, and the standings
  // return — exact — when the round closes.
  const rushRoom = room?.challengeMode === RUSH_MODE_ID;
  const rushRoundOpen = rushRoom && room?.status === 'running' && room?.roundState !== 'closed';
  useEffect(() => {
    if (rushRoom) loadGraphFeatureRushRound().catch(() => {});
  }, [rushRoom]);

  // What is held while a listener is paused is from before the round: it stops
  // counting as current the moment the pause begins, so nothing shows it as
  // this round's — not even for the frame before the listener is back.
  useEffect(() => {
    setSelfFresh(false);
    if (!roomId || !playerKey) { setSelfRow(null); return undefined; }
    if (rushRoundOpen) return undefined;
    return watchLiveChallengePlayer(roomId, playerKey, (row) => {
      setSelfRow(row);
      setSelfFresh(true);
    }, (watchError) => setError(watchError?.message || 'Could not load your Live Challenge score.'));
  }, [roomId, playerKey, rushRoundOpen]);
  useEffect(() => {
    setProjectionFresh(false);
    if (!roomId) { setProjection(null); return undefined; }
    if (rushRoundOpen) return undefined;
    return watchLiveChallengeStandings(roomId, (snapshot) => {
      setProjection(snapshot);
      setProjectionFresh(true);
    }, (watchError) => setError(watchError?.message || 'Could not load Live Challenge standings.'));
  }, [roomId, rushRoundOpen]);

  // The match's stage at this device's calibrated server time, re-read at
  // each boundary (a countdown step, the start, the deadline) — not on a timer.
  const stageClock = useChallengeClock(room, clock.offsetMs);
  const stage = stageClock.stage;
  useEffect(() => {
    if (room?.status !== 'running' || stage !== CHALLENGE_STAGE.ROUND_ACTIVE) return undefined;
    collectLaunchEvent('game_mounted', room);
    // One best-effort batch after the critical transition. Gameplay never
    // awaits it; all earlier milestones travel in this same small report.
    const timer = window.setTimeout(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
    return () => window.clearTimeout(timer);
  }, [room?.status, room?.currentRound, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  // In-progress ("working…") points belong on the board only while the round
  // takes answers; after the buzzer the board is what was banked.
  const activeRound = room && stage === CHALLENGE_STAGE.ROUND_ACTIVE ? Number(room.currentRound) : null;
  const scoringStrategyId = room?.scoringStrategyId || null;
  // This student's own row as the engine reads a row (publicLeaderboard): their
  // live score — work in progress only while the round takes answers — and
  // whether this round's answer is on the server.
  const selfEntry = useMemo(
    () => (selfRow ? publicLeaderboard([selfRow], { activeRound, ...leaderboardOptionsFor(scoringStrategyId) })[0] || null : null),
    [selfRow, activeRound, scoringStrategyId],
  );
  // Their seat in the snapshot: fixed when the room was created, on their row
  // and their invite (a room from before seats finds them by key instead).
  const selfSlot = Number.isInteger(selfRow?.slot) ? selfRow.slot : (Number.isInteger(invite?.slot) ? invite.slot : null);
  // The class's standings, as the room's snapshot ranks them.
  const standings = useMemo(
    () => standingsFromProjection(projection, { roomId, slot: selfSlot, playerKey }),
    [projection, roomId, selfSlot, playerKey],
  );
  const presentation = useMemo(() => scorePresentation({ scoringStrategyId, questionSet: rushRoom }), [scoringStrategyId, rushRoom]);

  // A FINISHED ROOM WITHOUT ITS FINAL SNAPSHOT (it finished before snapshots
  // existed, or its final one could not be written): ask once for it to be
  // rebuilt from the match result. The finishing commit writes it with the
  // room, so a normal finish never gets here.
  const finalRepairAskedRef = useRef(null);
  const finalMissing = room?.status === 'finished' && projectionFresh && standings?.kind !== PROJECTION_KIND.FINAL;
  useEffect(() => {
    if (!finalMissing || !roomId || finalRepairAskedRef.current === roomId) return undefined;
    const timer = window.setTimeout(() => {
      finalRepairAskedRef.current = roomId;
      ensureLiveChallengeFinalStandings({ roomId }).catch(() => {});
    }, 2_500);
    return () => window.clearTimeout(timer);
  }, [finalMissing, roomId]);

  useEffect(() => {
    if (!roomId || activeRound == null) return;
    const currentPrefix = `live-challenge-pending-${roomId}-${activeRound}-${room?.roundVersion || 0}`;
    const currentResult = challengeResultKey(roomId, activeRound, room?.roundVersion);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`live-challenge-pending-${roomId}-`) && key !== currentPrefix) {
        window.localStorage.removeItem(key);
      }
      // A kept result only matters for the round on screen, in any room.
      if (key?.startsWith('live-challenge-result-') && key !== currentResult) {
        window.localStorage.removeItem(key);
      }
    }
  }, [roomId, activeRound, room?.roundVersion]);

  useEffect(() => {
    if (!roomId || joining || !room || room.roomId !== roomId || !['lobby', 'running'].includes(room.status)) return;
    if (joinRefusedForRef.current === roomId || joinedRoomRef.current === roomId) return;
    // Their own row exists once they have joined (on this device or another).
    const alreadyJoined = selfRow?.joined === true;
    if (alreadyJoined) return;
    setJoining(true);
    joinLiveChallenge({ roomId })
      .then((reply) => {
        if (reply?.playerKey) setJoinedPlayerKey(String(reply.playerKey));
        if (reply?.timeMultiplier !== undefined) setJoinedTimeMultiplier(storedTimeMultiplier(reply.timeMultiplier));
        // LATE JOIN. A rostered student who arrives after the start plays from
        // the round that is open now (the server records it, and a round that
        // already closed is not counted against them); the screen says so once.
        if (reply && reply.rejoined === false && room.status === 'running' && room.roundState !== 'closed') {
          setJoinedAtRound(Number(room.currentRound) || 0);
        }
      })
      .then(() => { joinedRoomRef.current = roomId; })
      .catch((joinError) => {
        // A refusal (the game ended, or this student is not on its roster) will
        // not change by asking again on the next snapshot; a dropped
        // connection might, so only refusals stop the automatic join.
        if (/permission-denied|failed-precondition|not-found|invalid-argument/.test(String(joinError?.code || ''))) {
          joinRefusedForRef.current = roomId;
        }
        setError(joinError?.message || 'Could not join the Live Challenge.');
      })
      .finally(() => setJoining(false));
  }, [roomId, room, joining, selfRow?.joined]);

  // MISSED ROUNDS. Each server copy of the room is compared with the last round
  // this tab saw (sessionStorage keeps it across a reload). A device that comes
  // back — a reload, a reconnect, a wake from sleep — to a later round reads the
  // results of the rounds in between once, and says which closed without this
  // student's answer. A copy from the device's cache is not the server's word.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (!roomId || !playerKey || !room || room.roomId !== roomId || roomFromCache || !everInSync) return;
    const now = seenRoundOf(room);
    if (!now) return;
    const storage = tabStorage();
    const lastSeen = readLastSeenRound(storage, roomId);
    writeLastSeenRound(storage, roomId, now);
    const rounds = roundsClosedWhileAway({ lastSeen, now, joinedAtRound, finished: room.status === 'finished' });
    if (!rounds.length) return;
    const scheduledRoundCount = Number(room.scheduledRoundCount || room.roundCount) || 0;
    // Not cancelled by the next snapshot: the memory above has already moved
    // on, so this read is the only chance to say it.
    Promise.all(rounds.map((roundIndex) => readLiveChallengeRound(roomId, roundIndex)
      .then((summary) => ({ roundIndex, summary }))
      .catch(() => ({ roundIndex, summary: null }))))
      .then((results) => {
        const missed = unansweredRounds(results, playerKey);
        if (missed.length && mountedRef.current) setMissedNotice(missedRoundsNotice(missed, { scheduledRoundCount }));
      });
  }, [roomId, playerKey, room?.roomId, room?.status, room?.currentRound, room?.roundState, roomFromCache, everInSync]); // eslint-disable-line react-hooks/exhaustive-deps

  // THE RECAP of a finished game, asked for once. Until the server can answer
  // (or if it refuses), the screen simply shows no recap: the final card has
  // already said how the game went.
  const recapAskedRef = useRef(null);
  useEffect(() => {
    if (!roomId || room?.status !== 'finished' || recapAskedRef.current === roomId) return undefined;
    recapAskedRef.current = roomId;
    let cancelled = false;
    const scheduledRoundCount = Number(room.scheduledRoundCount || room.roundCount) || 0;
    getLiveChallengeMatchRecap({ roomId })
      .then((reply) => { if (!cancelled) setRecap(normalizeMatchRecap(reply, { roomId, scheduledRoundCount })); })
      .catch(() => { if (!cancelled) setRecap(null); });
    return () => { cancelled = true; };
  }, [roomId, room?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // READ ALOUD, for a student whose support plan grants text-to-speech, on a
  // browser that can speak.
  const readAloud = useMemo(
    () => resolveSupportEntitlements(studentProfile).granted?.textToSpeech === true && speechAvailable(),
    [studentProfile],
  );

  if (!invite || !roomId) {
    return <div style={{ padding: 40, textAlign: 'center' }}><h2>No Live Challenge is waiting.</h2><button type="button" onClick={onExit}>{exitLabel}</button></div>;
  }

  if (!room || roomMissing) {
    return (
      <div data-mm-student-room={roomMissing ? 'missing' : 'opening'} style={{ minHeight: '100vh', padding: 40, background: 'radial-gradient(120% 90% at 50% 0%, #1f2a44 0%, #131722 55%, #0d1017 100%)', color: '#eef1f6', textAlign: 'center', fontFamily: '"Segoe UI", sans-serif' }}>
        {roomMissing ? (
          <>
            <h2 style={{ color: '#fff' }}>This Live Challenge is no longer available.</h2>
            <p>Your teacher may have closed it. Nothing was lost — head back to your dashboard.</p>
          </>
        ) : <h2 style={{ color: '#fff' }}>Opening {invite.title || 'Live Challenge'}…</h2>}
        {error && <p role="alert" style={{ color: '#ffb4ab' }}>{error}</p>}
        {(roomMissing || error) && (
          <button type="button" onClick={onExit} style={{ marginTop: 12, minHeight: 44, padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{exitLabel}</button>
        )}
      </div>
    );
  }

  const clockReady = clock.sampleCount > 0 || clock.quality === 'degraded';
  const roundOpen = room.status === 'running' && room.roundState !== 'closed';
  const roundIndex = Number(room.currentRound) || 0;
  const guidance = studentGuidance({ room, stage, joinedAtRound });
  const connection = studentConnectionState({ online, fromCache: roomFromCache, everInSync });
  // The header: the student's own score from their own row (it moves the
  // moment their answer lands). Never their place: a rank in the corner of
  // every round is a rank under the question (liveChallengePrivacy.mjs) — it
  // comes with each round's results instead. A paused listener (a rush round)
  // holds values from before the round: the header shows nothing it cannot
  // keep current.
  const headerRow = selfEntry && room.status === 'running' && selfFresh ? selfEntry : null;
  const timeMultiplier = joinedTimeMultiplier ?? (invite?.roomId === roomId ? storedTimeMultiplier(invite?.timeMultiplier) : 1);
  const lateJoinNote = joinedAtRound !== null && joinedAtRound === roundIndex && stage === CHALLENGE_STAGE.ROUND_ACTIVE
    ? <StudentGuidance compact guidance={guidance} />
    : null;
  // THE FINAL STANDINGS AND PODIUM are the final snapshot's alone: written
  // from the match result in the commit that finished the match. A live
  // snapshot is never shown as the final one.
  const finalStandings = room.status === 'finished' && standings?.kind === PROJECTION_KIND.FINAL ? standings : null;
  const finalRows = finalStandings ? standingsRows(projectionBoardRows(finalStandings, { selfKey: playerKey, alias: invite.alias }), { selfKey: playerKey }) : [];
  const finalSelfRow = finalRows.find((row) => row.isSelf) || null;
  // Their correct answers are on their own row, which the match result was built from.
  const finalSelf = finalSelfRow ? { ...finalSelfRow, correctCount: Math.max(0, Math.round(Number(selfRow?.correctCount) || 0)) } : null;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 50% 0%, #1f2a44 0%, #131722 55%, #0d1017 100%)', padding: '20px 14px 50px', fontFamily: '"Segoe UI", sans-serif', color: '#eef1f6' }}>
      <ChallengeShellStyles />
      <div data-mm-student-stage={stage} style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ color: '#fdd663', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}>MathMaster Live Challenge</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 25, color: '#fff', overflowWrap: 'anywhere' }}>{room.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <ConnectionPill state={connection} look="student" />
            {headerRow && (
              <div data-mm-student-score="1" style={{ textAlign: 'right', lineHeight: 1.2 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9fb0cc', fontWeight: 900 }}>Your score</div>
                <div style={{ fontSize: 22, fontWeight: 1000, fontVariantNumeric: 'tabular-nums', color: '#fdd663' }}>
                  {(headerRow.liveScore ?? headerRow.score).toLocaleString()}
                  <span style={{ marginLeft: 6, fontSize: 12, color: '#c3d2ea' }}>{presentation.total.short}</span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onExit}
              style={{ minHeight: 44, padding: '9px 14px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 8, background: 'transparent', color: '#eef1f6', fontWeight: 900, cursor: 'pointer' }}
            >
              {exitLabel}
            </button>
          </div>
        </header>
        {error && <div role="alert" style={{ marginBottom: 14, padding: 11, borderRadius: 9, background: '#4a3708', color: '#ffe9a8', border: '1px solid #f9ab00' }}>{error}</div>}
        {missedNotice && (
          <div role="status" data-mm-missed-rounds="1" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14, padding: '11px 14px', borderRadius: 10, background: 'rgba(23,54,95,.9)', border: '1px solid rgba(138,180,248,.4)', color: '#dbeafe', fontWeight: 800 }}>
            <span>{missedNotice}</span>
            <button type="button" onClick={() => setMissedNotice('')} style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Got it</button>
          </div>
        )}

        {room.status === 'lobby' && (
          <StudentLobbyCard room={room} alias={invite.alias} joining={joining} playerCount={Math.max(standings?.count || 0, selfRow?.joined ? 1 : 0)} />
        )}

        {roundOpen && room.currentQuestion && !clockReady && (
          <section aria-live="polite" style={{ padding: 26, borderRadius: 16, background: '#17365f', textAlign: 'center' }}>
            <h2>Getting the round ready…</h2>
            <p>Your screen is catching up with your teacher's timer. This only takes a moment.</p>
          </section>
        )}

        {rushRoundOpen && room.currentQuestion && clockReady && (
          <Suspense fallback={<section aria-live="polite" style={{ padding: 26, borderRadius: 16, background: '#17365f', textAlign: 'center' }}><h2>Loading your graphs…</h2></section>}>
            <GraphFeatureRushRound
              key={`${room.roomId}-${room.currentRound}-${room.roundVersion}`}
              room={{ ...room, connectionQuality: clock.quality, serverNowAtRender: Date.now() + clock.offsetMs }}
              alias={invite.alias}
              onExit={onExit}
              exitLabel="Exit"
            />
          </Suspense>
        )}

        {!rushRoom && room.status === 'running' && room.currentQuestion && roundOpen && clockReady && (
          <ChallengeRound
            key={`${room.roomId}-${room.currentRound}-${room.roundVersion}`}
            room={{ ...room, connectionQuality: clock.quality, serverNowAtRender: Date.now() + clock.offsetMs }}
            alias={invite.alias}
            selfEntry={selfEntry}
            studentProfile={studentProfile}
            persistResult
            liveShell
            timeMultiplier={timeMultiplier}
            readAloud={readAloud}
            beforeQuestion={(
              <>
                {lateJoinNote}
                {clock.quality === 'degraded' ? <div role="status">Your connection is slow right now. You can still answer — your time is taken when your answer arrives.</div> : null}
              </>
            )}
          />
        )}

        {stage === CHALLENGE_STAGE.ROUND_RESULTS && (
          <StudentRoundResults room={room} stage={stage} playerKey={playerKey} guidance={guidance} presentation={presentation} rushRound={rushRoom} />
        )}

        {room.status === 'finished' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {finalSelf && finalPlaceIsHeadline(finalSelf.rank) && <Confetti pieces={28} />}
            <StudentFinalCard
              selfRow={finalSelf}
              presentation={presentation}
              totalPlayers={finalStandings?.count || 0}
              rows={finalRows}
              selfKey={playerKey}
              rush={rushRoom}
              rewardsSlot={renderMatchRewards && invite?.roomId ? renderMatchRewards(invite.roomId, { offered: rewardSummaryLines(room.rewardSummary) }) : null}
              loading={!finalStandings}
              // A Warm-Up game's accuracy is the student's Warm-Up grade.
              warmup={Boolean(room.assignmentId)}
              highlights={recapHighlights(recap)}
              // A teacher's full standings put every place on the projector.
              fullStandings={roomShowsFullStandings(room)}
              boardLimit={projectorBoardLimit(room, PUBLIC_TOP_COUNT, finalStandings?.count ?? null)}
            />
            <StudentMatchRecap recap={recap} />
            <button type="button" onClick={onExit} style={{ ...exitButton, justifySelf: 'center' }}>{exitLabel}</button>
          </div>
        )}

        {room.status === 'cancelled' && (
          <section style={{ padding: 26, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>This challenge was cancelled.</h2>
            <p style={{ color: '#c3d2ea' }}>Nothing from it is recorded.</p>
            <button type="button" onClick={onExit} style={exitButton}>{exitLabel}</button>
          </section>
        )}
      </div>
    </div>
  );
}
