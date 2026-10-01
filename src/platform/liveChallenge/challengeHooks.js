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
import { readLiveChallengeRound, watchLiveChallengeRound } from './liveChallengeService.js';

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
 * round, so a value from another round is never returned for this one.
 */
export const useRoundSummary = (roomId, roundIndex, active = true) => {
  const key = active && roomId && Number.isInteger(roundIndex) && roundIndex >= 0 ? `${roomId}:${roundIndex}` : null;
  const [state, setState] = useState({ key: null, summary: null });
  useEffect(() => {
    if (!key) return undefined;
    return watchLiveChallengeRound(roomId, roundIndex, (summary) => setState({ key, summary }), () => setState({ key, summary: null }));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.summary : null;
};

// A round's result never changes once written, so one read serves every
// later results moment that compares against it.
const pastRounds = new Map();
const PAST_ROUND_MEMORY = 24;

/** The result of the round BEFORE `roundIndex`, for movement since then. */
export const usePreviousRoundSummary = (roomId, roundIndex, active = true) => {
  const previous = Number.isInteger(roundIndex) ? roundIndex - 1 : -1;
  const key = active && roomId && previous >= 0 ? `${roomId}:${previous}` : null;
  const [state, setState] = useState(() => ({ key, summary: key ? pastRounds.get(key) || null : null }));
  useEffect(() => {
    if (!key) return undefined;
    if (pastRounds.has(key)) { setState({ key, summary: pastRounds.get(key) }); return undefined; }
    let cancelled = false;
    readLiveChallengeRound(roomId, previous)
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
