/*
 * LIVE CHALLENGE SHELL HOOKS.
 *
 * RE-RENDER AT BOUNDARIES, NOT ON A TIMER. A screen used to re-render its whole
 * tree four times a second so a clock could tick — the student's question
 * engine and every leaderboard row included. The stage only changes at known
 * instants (each countdown step, the start, the end of GO, the deadline), so
 * useChallengeClock re-derives exactly then; the time-left digits tick in their
 * own small component (useTicker) and redraw nothing else.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { challengeClock, nextClockBoundaryMs } from './challengeShellModel.js';
import { readLiveChallengeRound, readLiveChallengeSolution, watchLiveChallengeRound } from './liveChallengeService.js';
import { createStandingsPublishPacer, hostStandingsSignature, roomPublishesLiveStandings } from './standingsPublishPacer.js';

/**
 * THE HOST'S SHARE OF THE CLASS'S LIVE STANDINGS. The console already ranks
 * every player's row (`leaderboard`); whenever what it shows changes while the
 * room has live standings, it asks the server for a fresh snapshot — at most
 * once a second (standingsPublishPacer.js). The server ranks the rows itself
 * and decides whether anything is written; this only says when. A console that
 * is closed, asleep or offline leaves the students' live board stale and
 * nothing else: round closes and the finish write exact standings without it.
 */
export const useStandingsPublisher = ({ roomId, room, leaderboard, questionSetRoom = false, publish }) => {
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const pacerRef = useRef(null);
  useEffect(() => {
    if (!roomId) return undefined;
    const pacer = createStandingsPublishPacer({ publish: () => publishRef.current?.({ roomId }) });
    pacerRef.current = pacer;
    return () => { pacer.stop(); pacerRef.current = null; };
  }, [roomId]);
  const live = roomPublishesLiveStandings(room, { questionSetRoom });
  const ended = room?.status === 'finished' || room?.status === 'cancelled';
  const signature = useMemo(() => hostStandingsSignature(leaderboard), [leaderboard]);
  useEffect(() => {
    if (ended) { pacerRef.current?.stop(); return; }
    if (live) pacerRef.current?.changed();
  }, [signature, live, ended]);
};

/**
 * The room's clock (challengeShellModel.challengeClock) at the caller's
 * calibrated server time, refreshed at each boundary and when the page comes
 * back into view (a hidden tab's timers are throttled; its clock must not be).
 */
export const useChallengeClock = (room, offsetMs = 0) => {
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;
  const [tick, setTick] = useState(0);
  // `tick` is the boundary that just passed: a new reading of the same room.
  const clock = useMemo(() => challengeClock(room || {}, Date.now() + offsetRef.current), [room, offsetMs, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!room) return undefined;
    const next = nextClockBoundaryMs(room, Date.now() + offsetRef.current);
    if (next === null) return undefined;
    const timer = window.setTimeout(() => setTick((value) => value + 1), Math.max(0, next - (Date.now() + offsetRef.current)) + 15);
    return () => window.clearTimeout(timer);
  }, [room, offsetMs, tick]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') setTick((value) => value + 1); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  return clock;
};

/** Date.now(), refreshed every `intervalMs` while active. For digits only. */
export const useTicker = (intervalMs = 250, active = true) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);
  return now;
};

/**
 * One closed round's anonymous result, while `active`. Keyed by room and
 * round (and copy), so a value from another round is never returned for this
 * one. `host`: the teacher's whole table (hostRounds) instead of the class's
 * copy (liveChallengeService.watchLiveChallengeRound).
 */
export const useRoundSummary = (roomId, roundIndex, active = true, { host = false } = {}) => {
  const key = active && roomId && Number.isInteger(roundIndex) && roundIndex >= 0 ? `${host ? 'host' : 'class'}:${roomId}:${roundIndex}` : null;
  const [state, setState] = useState({ key: null, summary: null });
  useEffect(() => {
    if (!key) return undefined;
    return watchLiveChallengeRound(roomId, roundIndex, (summary) => setState({ key, summary }), () => setState({ key, summary: null }), { host });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.summary : null;
};

// A published solution never changes, so one read per round per page.
const solutionReads = new Map();
const SOLUTION_MEMORY = 40;

/**
 * One round's worked solution, read only once the room lists it as revealed
 * (challengeSolutionModel). Returns undefined until read, null when missing.
 */
export const useRoundSolution = (roomId, roundIndex, revealed = false) => {
  const key = revealed && roomId && Number.isInteger(roundIndex) && roundIndex >= 0 ? `${roomId}:${roundIndex}` : null;
  const [state, setState] = useState(() => ({ key, solution: key && solutionReads.has(key) ? solutionReads.get(key) : undefined }));
  useEffect(() => {
    if (!key) return undefined;
    if (solutionReads.has(key)) { setState({ key, solution: solutionReads.get(key) }); return undefined; }
    let cancelled = false;
    readLiveChallengeSolution(roomId, roundIndex)
      .then((solution) => {
        solutionReads.set(key, solution);
        if (solutionReads.size > SOLUTION_MEMORY) solutionReads.delete(solutionReads.keys().next().value);
        if (!cancelled) setState({ key, solution });
      })
      .catch(() => { if (!cancelled) setState({ key, solution: null }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.solution : undefined;
};

// A round's result never changes once written, so one read serves every
// later results moment that compares against it.
const pastRounds = new Map();
const PAST_ROUND_MEMORY = 24;

/** The result of the round BEFORE `roundIndex`, for movement since then. */
export const usePreviousRoundSummary = (roomId, roundIndex, active = true, { host = false } = {}) => {
  const previous = Number.isInteger(roundIndex) ? roundIndex - 1 : -1;
  const key = active && roomId && previous >= 0 ? `${host ? 'host' : 'class'}:${roomId}:${previous}` : null;
  const [state, setState] = useState(() => ({ key, summary: key ? pastRounds.get(key) || null : null }));
  useEffect(() => {
    if (!key) return undefined;
    if (pastRounds.has(key)) { setState({ key, summary: pastRounds.get(key) }); return undefined; }
    let cancelled = false;
    readLiveChallengeRound(roomId, previous, { host })
      .then((summary) => {
        if (summary) {
          pastRounds.set(key, summary);
          // Bounded: a long session of games never accumulates rounds.
          if (pastRounds.size > PAST_ROUND_MEMORY) pastRounds.delete(pastRounds.keys().next().value);
        }
        if (!cancelled) setState({ key, summary: summary || null });
      })
      .catch(() => { if (!cancelled) setState({ key, summary: null }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.summary : null;
};

/** The latest value, readable from callbacks that must stay stable. */
export const useLatest = (value) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

/** True while `prefers-reduced-motion: reduce` is set. */
export const usePrefersReducedMotion = () => {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const changed = () => setReduced(list.matches);
    list.addEventListener?.('change', changed);
    return () => list.removeEventListener?.('change', changed);
  }, []);
  return reduced;
};
