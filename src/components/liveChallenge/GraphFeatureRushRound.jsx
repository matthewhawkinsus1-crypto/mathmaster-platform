import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GraphFeatureRushGraph from './GraphFeatureRushGraph.jsx';
import { monotonicRoundOrigin } from '../../../functions/shared/liveChallengeParity.mjs';
import { graphDrawing } from '../../platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  RUSH_INPUT,
  RUSH_PREFETCH,
  RUSH_QUEUE_KEY_PREFIX,
  acknowledge,
  createRushSession,
  currentQuestion,
  dropQueue,
  feedbackMessage,
  inputState,
  lockRemainingMs,
  newAttemptId,
  nextBatch,
  parseStoredQueue,
  prefetchRequest,
  recordDoesNotExist,
  recordSkip,
  recordTap,
  rushQueueKey,
  settle,
  withQuestions,
} from '../../platform/liveChallenge/rushSession.js';
import {
  getGraphFeatureRushRound,
  submitGraphFeatureRushAttempts,
  timestampMillis,
} from '../../platform/liveChallenge/liveChallengeService.js';

/*
 * GRAPH FEATURE RUSH: A STUDENT'S ROUND.
 *
 * The graph fills the screen; the prompt, "Does Not Exist" and Skip sit in the
 * same places on every graph. Every tap is graded on the device at once
 * (rushSession.js) and queued for the server, which grades it again and alone
 * decides what counts.
 *
 * TIME. The round's start and deadline are the room's, anchored once to this
 * device's monotonic clock — a device clock change mid-round moves nothing,
 * and a refresh resumes on the same deadline. Input stops at zero.
 *
 * NETWORK. Attempts are sent one request at a time, gathered for a moment so
 * a burst of taps travels together, and kept in localStorage until the server
 * answers: a refresh or a dropped connection resends them, and the server
 * answers a resent attempt as a replay. Graphs are fetched ahead of the one
 * on screen, so the next appears the instant the last one completes.
 */

const COALESCE_MS = 700;
const RETRY_MIN_MS = 600;
const RETRY_MAX_MS = 5_000;
const JOIN_WAIT_MS = 1_000;

export const RUSH_SERVICES = Object.freeze({
  getRound: getGraphFeatureRushRound,
  submitAttempts: submitGraphFeatureRushAttempts,
});

const readQueue = (key) => {
  if (!key) return [];
  try { return parseStoredQueue(window.localStorage.getItem(key)); } catch { return []; }
};
const writeQueue = (key, queue) => {
  if (!key) return;
  try {
    if (queue.length) window.localStorage.setItem(key, JSON.stringify(queue));
    else window.localStorage.removeItem(key);
  } catch { /* the server still has everything it acknowledged */ }
};

/** Forget every other round's queue: the server would refuse it anyway. */
export const clearStaleRushQueues = (keepKey) => {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(RUSH_QUEUE_KEY_PREFIX) && key !== keepKey) window.localStorage.removeItem(key);
    }
  } catch { /* storage unavailable: nothing to clear */ }
};

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const wait = (milliseconds) => new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });

// The server will never take these: the round is over, stale, or not this student's.
const isFinalRefusal = (error) => /failed-precondition|not-found|permission-denied|invalid-argument/.test(String(error?.code || ''));

function useElementSquare(ref) {
  const [side, setSide] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setSide(Math.max(0, Math.floor(Math.min(box.width, box.height))));
    };
    measure();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return side;
}

/** The round clock: its own component, so its ticks redraw nothing else. */
function RushClock({ startMono, endMono }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  const before = startMono - now;
  if (before > 0) {
    return <span className="mm-rush-clock" role="timer" aria-label={`Starts in ${Math.ceil(before / 1000)} seconds`}>Starts in {Math.ceil(before / 1000)}</span>;
  }
  const remaining = Math.max(0, endMono - now);
  return (
    <span className={remaining <= 10_000 ? 'mm-rush-clock mm-rush-clock-low' : 'mm-rush-clock'} role="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      {formatClock(remaining)}
    </span>
  );
}

/** Spoken time warnings, once each: a screen reader is not asked to read a ticking clock. */
function useTimeAnnouncements(endMono, active) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (!active) return undefined;
    const timers = [30_000, 10_000].map((left) => {
      const delay = endMono - left - performance.now();
      return delay > 0 ? window.setTimeout(() => setSpoken(`${left / 1000} seconds left`), delay) : null;
    });
    return () => timers.forEach((timer) => timer != null && window.clearTimeout(timer));
  }, [endMono, active]);
  return spoken;
}

const RUSH_CSS = `
.mm-rush-shell {
  position: fixed; inset: 0; z-index: 9000;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  background: radial-gradient(120% 90% at 50% 0%, #1f2a44 0%, #131722 55%, #0d1017 100%);
  color: #eef1f6; font-family: "Segoe UI", system-ui, sans-serif;
  touch-action: manipulation; overscroll-behavior: none;
  --mm-rush-curve: var(--mm-primary); --mm-rush-found: var(--mm-success-text); --mm-rush-miss: var(--mm-error-border);
}
.mm-rush-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left));
  border-bottom: 1px solid rgba(255,255,255,.1); min-height: 52px; box-sizing: border-box;
}
.mm-rush-chip { padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.12); font-weight: 900; font-size: 13px; white-space: nowrap; }
.mm-rush-round { font-weight: 900; font-size: 15px; white-space: nowrap; }
.mm-rush-done { font-weight: 1000; font-size: 18px; color: #81c995; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mm-rush-clock { margin-left: auto; font-size: 30px; font-weight: 1000; line-height: 1; font-variant-numeric: tabular-nums; }
.mm-rush-clock-low { color: #ffb4ab; }
.mm-rush-sync { font-size: 12px; font-weight: 900; color: #fdd663; white-space: nowrap; }
.mm-rush-exit { min-height: 40px; padding: 6px 12px; border: 1px solid rgba(255,255,255,.3); border-radius: 8px; background: transparent; color: #eef1f6; font-weight: 900; cursor: pointer; }
.mm-rush-stage {
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; min-height: 0;
  padding: 10px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
.mm-rush-prompt h2 { margin: 0; font-size: clamp(21px, 4.2vmin, 34px); line-height: 1.15; font-weight: 800; color: #f7f9ff; }
.mm-rush-hint { margin: 4px 0 0; font-size: 13px; color: #b9c4d8; }
.mm-rush-graph-area { position: relative; min-height: 0; min-width: 0; display: grid; place-items: start center; }
.mm-rush-graph-frame { position: relative; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
.mm-rush-graph-frame[data-paused="1"] .mm-rush-graph { opacity: .55; transition: opacity 120ms; }
.mm-rush-controls { display: grid; gap: 8px; }
.mm-rush-feedback { min-height: 1.5em; font-weight: 900; font-size: 16px; }
.mm-rush-feedback[data-kind="hit"], .mm-rush-feedback[data-kind="complete"] { color: #81c995; }
.mm-rush-feedback[data-kind="miss"], .mm-rush-feedback[data-kind="autoSkipped"] { color: #ffb4ab; }
.mm-rush-buttons { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px; }
.mm-rush-dne, .mm-rush-skip { min-height: 52px; border-radius: 12px; font-size: 17px; font-weight: 1000; cursor: pointer; }
.mm-rush-dne { border: 0; background: #fdd663; color: #1b1f2a; }
.mm-rush-skip { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.06); color: #eef1f6; }
.mm-rush-dne:disabled, .mm-rush-skip:disabled { opacity: .45; cursor: not-allowed; }
.mm-rush-dne:focus-visible, .mm-rush-skip:focus-visible, .mm-rush-exit:focus-visible { outline: 3px solid var(--mm-focus); outline-offset: 2px; }
.mm-rush-cooldown { height: 6px; border-radius: 999px; background: rgba(255,255,255,.12); overflow: hidden; }
.mm-rush-cooldown > span { display: block; height: 100%; background: #ffb4ab; transform-origin: left; animation: mmRushDrain linear forwards; }
.mm-rush-overlay {
  position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; text-align: center;
  border-radius: 12px; background: rgba(13,16,23,.86); color: #f7f9ff; padding: 16px;
}
.mm-rush-overlay strong { font-size: clamp(28px, 7vmin, 56px); line-height: 1; }
.mm-rush-flash { position: absolute; inset: 0; border-radius: 12px; pointer-events: none; box-shadow: inset 0 0 0 6px #81c995; animation: mmRushFlash 420ms ease-out forwards; }
.mm-rush-banner { padding: 6px 10px; border-radius: 8px; background: rgba(253,214,99,.14); border: 1px solid rgba(253,214,99,.45); color: #fdd663; font-weight: 800; font-size: 13px; }
.mm-rush-alert { padding: 9px 12px; border-radius: 9px; background: #4a3708; color: #ffe9a8; border: 1px solid #f9ab00; font-weight: 800; }
.mm-rush-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mm-rush-found-fresh { animation: mmRushPop 360ms cubic-bezier(.2,.9,.3,1.4); }
.mm-rush-miss { animation: mmRushMiss 650ms ease-out forwards; }
.mm-rush-in-a { animation: mmRushInA 160ms ease-out; }
.mm-rush-in-b { animation: mmRushInB 160ms ease-out; }
@keyframes mmRushDrain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes mmRushFlash { from { opacity: 1; } to { opacity: 0; } }
@keyframes mmRushPop { from { transform: scale(.4); } to { transform: scale(1); } }
@keyframes mmRushMiss { 0% { opacity: 1; transform: scale(.8); } 70% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.05); } }
@keyframes mmRushInA { from { opacity: .6; } to { opacity: 1; } }
@keyframes mmRushInB { from { opacity: .6; } to { opacity: 1; } }
@media (min-aspect-ratio: 5/4) and (min-width: 600px) {
  .mm-rush-stage {
    grid-template-columns: minmax(0, 1fr) clamp(240px, 30vw, 380px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "graph prompt" "graph controls";
    column-gap: 18px;
  }
  .mm-rush-prompt { grid-area: prompt; padding-top: 6px; }
  .mm-rush-graph-area { grid-area: graph; place-items: center; }
  .mm-rush-controls { grid-area: controls; align-self: end; }
  .mm-rush-buttons { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .mm-rush-chip { display: none; }
  .mm-rush-bar { flex-wrap: nowrap; gap: 8px; }
  .mm-rush-clock { font-size: 26px; }
}
@media (max-height: 420px) {
  .mm-rush-bar { min-height: 44px; padding-top: 4px; padding-bottom: 4px; }
  .mm-rush-clock { font-size: 24px; }
  .mm-rush-hint { display: none; }
  .mm-rush-dne, .mm-rush-skip { min-height: 46px; }
}
@media (prefers-reduced-motion: reduce) {
  .mm-rush-found-fresh, .mm-rush-in-a, .mm-rush-in-b { animation: none; }
  .mm-rush-miss { animation: mmRushFlash 650ms linear forwards; }
  .mm-rush-flash { animation: none; opacity: .8; }
}
`;

/**
 * @param {object}   props.room      the room snapshot, with serverNowAtRender
 *                                   (Date.now() + calibrated offset)
 * @param {object}   props.services  { getRound, submitAttempts } — injectable,
 *                                   so a teacher's practice plays the same screen
 * @param {boolean}  props.persist   keep unsent attempts across a refresh
 * @param {boolean}  props.practice  a teacher's practice: nothing is recorded
 */
export default function GraphFeatureRushRound({
  room,
  alias = '',
  onExit,
  exitLabel = 'Exit',
  services = RUSH_SERVICES,
  persist = true,
  practice = false,
  onPracticeAgain = null,
}) {
  const roomId = room.roomId;
  const roundIndex = Number(room.currentRound) || 0;
  const roundVersion = Number(room.roundVersion) || 0;
  const roundToken = room.roundToken || '';
  const roundCount = Math.max(1, Number(room.roundCount) || 1);
  const roundClosed = room.roundState === 'closed';
  const identity = useMemo(() => ({ roomId, roundIndex, roundVersion, roundToken }), [roomId, roundIndex, roundVersion, roundToken]);
  const queueKey = persist ? rushQueueKey(roomId, roundIndex, roundVersion) : null;

  // Anchored once per mount; the parent mounts one of these per round.
  const [timing] = useState(() => {
    const startsAtMs = timestampMillis(room.startsAt || room.roundStartedAt);
    const endsAtMs = timestampMillis(room.roundEndsAt || room.endsAt);
    const startMono = monotonicRoundOrigin({
      monotonicNow: performance.now(),
      serverNowMs: Number(room.serverNowAtRender) || Date.now(),
      startsAtMs,
    });
    return { startMono, endMono: startMono + Math.max(0, endsAtMs - startsAtMs) };
  });

  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [phase, setPhase] = useState('loading');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [alert, setAlert] = useState('');
  const [connection, setConnection] = useState('ok');
  const [started, setStarted] = useState(() => performance.now() >= timing.startMono);
  const [timeUp, setTimeUp] = useState(() => performance.now() >= timing.endMono);
  const [, setWake] = useState(0);
  const over = timeUp || roundClosed;
  const overRef = useRef(over);
  overRef.current = over;

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const flushTimerRef = useRef(null);
  const retryDelayRef = useRef(0);
  const stoppedRef = useRef(false);
  const fetchingRef = useRef(false);
  const flushRef = useRef(() => {});
  const prefetchRef = useRef(() => {});

  const commit = useCallback((next) => {
    const previous = sessionRef.current;
    sessionRef.current = next;
    setSession(next);
    if (queueKey && previous?.queue !== next.queue) writeQueue(queueKey, next.queue);
  }, [queueKey]);

  const scheduleFlush = useCallback((delay = COALESCE_MS) => {
    if (stoppedRef.current || inFlightRef.current || flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => flushRef.current(), delay);
  }, []);

  flushRef.current = async () => {
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const current = sessionRef.current;
    if (!current || inFlightRef.current || stoppedRef.current) return;
    const batch = nextBatch(current);
    if (!batch.length) return;
    inFlightRef.current = true;
    try {
      const reply = await services.submitAttempts({ ...identity, attempts: batch });
      if (!mountedRef.current) return;
      retryDelayRef.current = 0;
      const { session: next } = acknowledge(sessionRef.current, { sent: batch, reply });
      commit(next);
      setConnection('ok');
    } catch (error) {
      if (!mountedRef.current) return;
      const code = String(error?.code || '');
      // "Time is up" from the server, when this device's clock agrees; a
      // client-side timeout with the same code mid-round is retried.
      const timeIsUp = /deadline-exceeded/.test(code) && performance.now() >= timing.endMono - 1_500;
      if (isFinalRefusal(error) || timeIsUp) {
        stoppedRef.current = true;
        commit(dropQueue(sessionRef.current));
        setConnection('ok');
        if (timeIsUp) setTimeUp(true);
        else if (!overRef.current) setAlert(error?.message || 'This round is no longer taking answers.');
      } else {
        retryDelayRef.current = Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, retryDelayRef.current * 2));
        setConnection('retrying');
        flushTimerRef.current = window.setTimeout(() => flushRef.current(), retryDelayRef.current);
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && !stoppedRef.current && sessionRef.current?.queue.length && !flushTimerRef.current) {
        scheduleFlush(overRef.current ? 0 : COALESCE_MS);
      }
    }
  };

  prefetchRef.current = async () => {
    const current = sessionRef.current;
    if (!current || fetchingRef.current || stoppedRef.current || overRef.current) return;
    const request = prefetchRequest(current);
    if (!request) return;
    fetchingRef.current = true;
    try {
      const reply = await services.getRound({ ...identity, ...request });
      if (!mountedRef.current) return;
      if (reply?.roundOpen !== false) commit(withQuestions(sessionRef.current, reply?.questions || []));
    } catch {
      if (mountedRef.current) await wait(1_500);
    } finally {
      fetchingRef.current = false;
    }
    if (mountedRef.current && prefetchRequest(sessionRef.current)) prefetchRef.current();
  };

  // START OR RESUME: first anything this device sent and never heard back
  // about, then where the server says the student is, with their next graphs.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    if (persist) clearStaleRushQueues(queueKey);
    const start = async () => {
      let pending = readQueue(queueKey);
      let delay = RETRY_MIN_MS;
      while (pending.length && !cancelled) {
        const batch = pending.slice(0, 12);
        try {
          // eslint-disable-next-line no-await-in-loop
          await services.submitAttempts({ ...identity, attempts: batch });
          pending = pending.slice(batch.length);
          writeQueue(queueKey, pending);
        } catch (error) {
          if (isFinalRefusal(error) || /deadline-exceeded/.test(String(error?.code || ''))) {
            pending = [];
            writeQueue(queueKey, pending);
            break;
          }
          setConnection('retrying');
          // eslint-disable-next-line no-await-in-loop
          await wait(delay);
          delay = Math.min(RETRY_MAX_MS, delay * 2);
        }
      }
      delay = RETRY_MIN_MS;
      while (!cancelled) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const reply = await services.getRound({ ...identity, count: RUSH_PREFETCH.batch });
          if (cancelled) return;
          if (reply?.roundOpen === false) { setPhase('closed'); return; }
          if (reply?.joined === false) {
            // The parent's join is on its way.
            // eslint-disable-next-line no-await-in-loop
            await wait(JOIN_WAIT_MS);
            continue;
          }
          commit(createRushSession({ roundIndex, serverState: reply?.state || {}, questions: reply?.questions || [], poolSize: reply?.poolSize ?? null }));
          setConnection('ok');
          setPhase('ready');
          return;
        } catch (error) {
          if (cancelled) return;
          if (isFinalRefusal(error)) {
            setAlert(error?.message || 'This round could not be opened.');
            setPhase('closed');
            return;
          }
          setConnection('retrying');
          // eslint-disable-next-line no-await-in-loop
          await wait(delay);
          delay = Math.min(RETRY_MAX_MS, delay * 2);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      // Leaving mid-round: one last send. What it misses stays stored.
      const batch = sessionRef.current ? nextBatch(sessionRef.current) : [];
      if (batch.length && !stoppedRef.current) services.submitAttempts({ ...identity, attempts: batch }).catch(() => {});
    };
    // One start per mount: the parent remounts this screen for each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The round's start and its deadline, on the monotonic clock.
  useEffect(() => {
    const now = performance.now();
    const timers = [];
    if (now < timing.startMono) timers.push(window.setTimeout(() => setStarted(true), timing.startMono - now));
    if (now < timing.endMono) timers.push(window.setTimeout(() => setTimeUp(true), timing.endMono - now));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [timing]);

  // At the buzzer, whatever is queued goes now.
  useEffect(() => {
    if (over) flushRef.current();
  }, [over]);

  // A completion flash or skip pause ends: the next graph.
  useEffect(() => {
    if (!session?.transition) return undefined;
    const timer = window.setTimeout(() => {
      if (sessionRef.current) commit(settle(sessionRef.current, performance.now()));
    }, Math.max(0, session.transition.until - performance.now()) + 5);
    return () => window.clearTimeout(timer);
  }, [session?.transition, commit]);

  // A cooldown ends: draw the graph as ready again.
  useEffect(() => {
    const remaining = session ? session.lockedUntil - performance.now() : 0;
    if (!(remaining > 0)) return undefined;
    const timer = window.setTimeout(() => setWake((value) => value + 1), remaining + 5);
    return () => window.clearTimeout(timer);
  }, [session?.lockedUntil, session]);

  // Keep graphs ready ahead of the one on screen.
  useEffect(() => {
    if (phase === 'ready' && session && prefetchRequest(session)) prefetchRef.current();
  }, [phase, session]);

  // Send what is waiting when the connection returns or the page is hidden.
  useEffect(() => {
    const now = () => flushRef.current();
    const hidden = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const graphAreaRef = useRef(null);
  const side = useElementSquare(graphAreaRef);
  const question = session ? currentQuestion(session) : null;
  const drawing = useMemo(() => graphDrawing(question), [question]);
  const nowMs = performance.now();
  const input = session ? inputState(session, nowMs) : RUSH_INPUT.WAITING;
  const playing = phase === 'ready' && started && !over;
  const lockMs = session ? lockRemainingMs(session, nowMs) : 0;
  const spoken = useTimeAnnouncements(timing.endMono, playing);

  // Refs only: the tap handler is memoized for the graph, and must never see
  // a stale phase.
  const accepting = () => phaseRef.current === 'ready' && !overRef.current
    && performance.now() >= timing.startMono && performance.now() < timing.endMono;
  const act = (record) => {
    const current = sessionRef.current;
    if (!current || !accepting()) return;
    const at = performance.now();
    const outcome = record(current, { nowMs: at, elapsedMs: at - timing.startMono, attemptId: newAttemptId() });
    if (outcome.session !== current) commit(outcome.session);
    if (outcome.attempt) scheduleFlush();
  };
  const onTap = useCallback(({ x, y, pointer, tolerance }) => {
    act((current, context) => recordTap(current, { ...context, x, y, pointer, tolerance }));
    // `act` reads only refs and stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, scheduleFlush]);
  const onDoesNotExist = () => act(recordDoesNotExist);
  const onSkip = () => act(recordSkip);

  // Focus the graph when play begins, so a keyboard is ready at once.
  const frameRef = useRef(null);
  useEffect(() => {
    if (playing) frameRef.current?.querySelector('svg')?.focus({ preventScroll: true });
  }, [playing]);

  const feedback = session?.feedback || null;
  const feedbackQuestion = feedback ? session.questions[feedback.questionIndex] : null;
  // A message belongs to its graph: it shows through that graph's flash or
  // skip pause, and clears when the next graph appears.
  const message = feedback && (feedback.questionIndex === session.cursor || session.transition)
    ? feedbackMessage(feedback, feedbackQuestion)
    : '';
  const completed = session?.counts.completed ?? 0;
  const transition = session?.transition || null;
  const queued = session?.queue.length || 0;
  const buttonsDisabled = !playing || input !== RUSH_INPUT.READY;

  let overlay = null;
  if (phase === 'loading') overlay = <><strong>Loading…</strong><span>{connection === 'retrying' ? 'Reconnecting to the round…' : 'Getting your graphs ready.'}</span></>;
  else if (phase === 'closed' || roundClosed) overlay = <><strong>Round over</strong><span>Waiting for the results…</span></>;
  else if (!started) overlay = <><strong>Get ready</strong><span>Tap each feature you are asked for. Starting in a moment.</span></>;
  else if (over) {
    overlay = practice
      ? (
        <>
          <strong>Time!</strong>
          <span>{completed} graph{completed === 1 ? '' : 's'} completed in practice.</span>
          {typeof onPracticeAgain === 'function' && <button type="button" className="mm-rush-skip" style={{ marginTop: 8 }} onClick={onPracticeAgain}>Play again</button>}
        </>
      )
      : <><strong>Time!</strong><span>{completed} graph{completed === 1 ? '' : 's'} completed. {queued ? 'Saving your last taps…' : 'Waiting for the results…'}</span></>;
  } else if (input === RUSH_INPUT.EXHAUSTED) overlay = <><strong>All done!</strong><span>You finished every graph in this round.</span></>;
  else if (!question) overlay = <><strong>Loading…</strong><span>Getting your next graph.</span></>;

  return (
    <div className="mm-rush-shell" role="region" aria-label={practice ? 'Graph Feature Rush practice' : `Graph Feature Rush, round ${roundIndex + 1}`}>
      <style>{RUSH_CSS}</style>
      <header className="mm-rush-bar">
        {alias && <span className="mm-rush-chip">{alias}</span>}
        <span className="mm-rush-round">{practice ? 'Practice' : `Round ${roundIndex + 1} of ${roundCount}`}</span>
        <span className="mm-rush-done" aria-label={`${completed} graphs completed`}><span aria-hidden="true">✓ </span>{completed}</span>
        {connection === 'retrying' && <span className="mm-rush-sync" role="status">Reconnecting… your taps are saved</span>}
        <RushClock startMono={timing.startMono} endMono={timing.endMono} />
        {typeof onExit === 'function' && <button type="button" className="mm-rush-exit" onClick={onExit}>{exitLabel}</button>}
      </header>
      <div className="mm-rush-stage">
        <section className="mm-rush-prompt" aria-live="polite">
          {practice && <div className="mm-rush-banner" style={{ marginBottom: 6 }}>Practice — nothing is recorded.</div>}
          <h2>{playing && question ? question.prompt : 'Graph Feature Rush'}</h2>
          <p className="mm-rush-hint">Tap it on the graph. Not there? Choose Does Not Exist.</p>
        </section>
        <section className="mm-rush-graph-area" ref={graphAreaRef}>
          {side > 0 && (
            <div
              ref={frameRef}
              className="mm-rush-graph-frame"
              data-question-index={question && started ? question.questionIndex : ''}
              data-paused={playing && input === RUSH_INPUT.LOCKED ? '1' : '0'}
              style={{ width: side, height: side }}
            >
              {question && drawing && started && phase === 'ready' ? (
                <div className={question.questionIndex % 2 ? 'mm-rush-in-a' : 'mm-rush-in-b'} style={{ width: side, height: side }}>
                  <GraphFeatureRushGraph
                    question={question}
                    drawing={drawing}
                    side={side}
                    found={session.found}
                    feedback={feedback}
                    paused={input === RUSH_INPUT.LOCKED || over}
                    onTap={onTap}
                    label={`${question.prompt}. Tap the graph, or use the arrow keys and Enter.`}
                  />
                </div>
              ) : <div style={{ width: side, height: side, borderRadius: 12, background: 'var(--mm-graph-bg)' }} />}
              {transition?.kind === RUSH_FEEDBACK.COMPLETE && <div key={transition.questionIndex} className="mm-rush-flash" aria-hidden="true" />}
              {overlay && <div className="mm-rush-overlay">{overlay}</div>}
            </div>
          )}
        </section>
        <section className="mm-rush-controls">
          <div className="mm-rush-feedback" data-kind={feedback?.kind || ''} aria-live="polite">{playing ? message : ''}</div>
          {input === RUSH_INPUT.LOCKED && playing && (
            <div className="mm-rush-cooldown" role="status" aria-label="Short pause after misses">
              <span key={session.lockedUntil} style={{ animationDuration: `${lockMs}ms` }} />
            </div>
          )}
          <div className="mm-rush-buttons">
            <button type="button" className="mm-rush-dne" disabled={buttonsDisabled} onClick={onDoesNotExist}>Does Not Exist</button>
            <button type="button" className="mm-rush-skip" disabled={buttonsDisabled} onClick={onSkip}>Skip</button>
          </div>
          {alert && <div role="alert" className="mm-rush-alert">{alert}</div>}
          <div aria-live="polite" className="mm-rush-visually-hidden">{spoken}</div>
        </section>
      </div>
    </div>
  );
}
