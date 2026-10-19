/*
 * PERSONAL BESTS.
 *
 * Most students never win a Live Challenge. Every student can beat their own
 * last game. A personal best compares one student's standing in this match
 * with their own earlier finished matches in the same class — never with a
 * classmate — and it is PRIVATE: only ever returned to that student (the
 * recap callable), never written to a room or a projector.
 *
 *   mostCorrect     most correct answers in a match
 *   bestAccuracy    highest share of first-time scheduled answers that were
 *                   right, once at least MIN_ACCURACY_ANSWERED were answered
 *                   (two of two is not a best worth claiming)
 *   longestStreak   longest run of correct answers
 *   fastestCorrect  the quickest correct first answer to a shared question
 *
 * A FIRST GAME CLAIMS NOTHING. With no earlier match to beat, every number is
 * trivially a "best"; saying so would make the word mean nothing the second
 * time. `firstGame: true` lets a screen say "your first Live Challenge"
 * instead.
 *
 * Deterministic: the caller supplies the earlier results (finalized BEFORE
 * this one), so a retried rewards effect reaches the same answer.
 */

import { QUESTION_ISSUE, getChallengeMode } from './liveChallengeModes.mjs';

export const PERSONAL_BEST_ID = Object.freeze({
  MOST_CORRECT: 'mostCorrect',
  BEST_ACCURACY: 'bestAccuracy',
  LONGEST_STREAK: 'longestStreak',
  FASTEST_CORRECT: 'fastestCorrect',
});

export const PERSONAL_BEST_ORDER = Object.freeze([
  PERSONAL_BEST_ID.MOST_CORRECT,
  PERSONAL_BEST_ID.BEST_ACCURACY,
  PERSONAL_BEST_ID.LONGEST_STREAK,
  PERSONAL_BEST_ID.FASTEST_CORRECT,
]);

export const MIN_ACCURACY_ANSWERED = 3;

const list = (value) => (Array.isArray(value) ? value : []);
const isInt = (value) => typeof value === 'number' && Number.isInteger(value);
// A faster answer is only a personal best when it beats the old one by a
// margin a student could notice. Arrival timing jitters by tens of
// milliseconds (and a claimed elapsed time may run slightly ahead of
// arrival), so a 1 ms "best" would be noise farmed for Class Points — and it
// would read as the same number as the old best at the 0.1 s the copy shows.
// 250 ms always shows as a different tenth of a second.
export const MIN_FASTER_MS = 250;

const seconds = (ms) => {
  const value = Math.round(Number(ms) / 100) / 10;
  if (value < 0.1) return 'under 0.1 seconds';
  return `${value} second${value === 1 ? '' : 's'}`;
};

/** The student's standing in a result, joined players only. */
const joinedStanding = (result, studentId) => list(result?.standings)
  .find((standing) => standing?.studentId === studentId && standing.joined === true) || null;

const sharedQuestions = (result) => getChallengeMode(result?.modeId).questionIssue !== QUESTION_ISSUE.PER_PLAYER;

/** First-time outcomes of scheduled rounds (never a replay). */
const firstOutcomes = (standing, scheduled) => {
  const byRound = new Map();
  list(standing?.roundOutcomes).forEach((outcome) => {
    const round = outcome?.roundIndex;
    if (!isInt(round) || round < 0 || (scheduled > 0 && round >= scheduled) || outcome.secondChance === true) return;
    if (!byRound.has(round)) byRound.set(round, outcome);
  });
  return [...byRound.values()];
};

/**
 * One match's measurable facts for one student — `null` where a metric does
 * not apply (too few answers for accuracy, no correct answer to time).
 */
export const personalMetrics = (result = {}, standing = {}) => {
  const scheduled = Math.max(0, Number(result?.scheduledRoundCount) || 0);
  const outcomes = firstOutcomes(standing, scheduled);
  const correct = outcomes.filter((outcome) => outcome.isCorrect === true);
  const times = sharedQuestions(result)
    ? correct.map((outcome) => outcome.elapsedMs).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0).map(Number)
    : [];
  return Object.freeze({
    [PERSONAL_BEST_ID.MOST_CORRECT]: Math.max(0, Math.round(Number(standing?.correctCount) || 0)),
    [PERSONAL_BEST_ID.BEST_ACCURACY]: outcomes.length >= MIN_ACCURACY_ANSWERED
      ? Math.round((correct.length / outcomes.length) * 100)
      : null,
    [PERSONAL_BEST_ID.LONGEST_STREAK]: Math.max(0, Math.round(Number(standing?.bestStreak) || 0)),
    [PERSONAL_BEST_ID.FASTEST_CORRECT]: times.length ? Math.min(...times) : null,
  });
};

// Lower is better only for time.
const lowerIsBetter = (id) => id === PERSONAL_BEST_ID.FASTEST_CORRECT;
const better = (id, a, b) => (lowerIsBetter(id) ? a < b : a > b);
// Beating an earlier best: time must improve by MIN_FASTER_MS (see above).
const beats = (id, value, previous) => (lowerIsBetter(id) ? value <= previous - MIN_FASTER_MS : value > previous);
// A metric a best can be claimed on: something actually achieved.
const claimable = (id, value) => value !== null && (lowerIsBetter(id) ? value >= 0 : value > 0);

const COPY = Object.freeze({
  [PERSONAL_BEST_ID.MOST_CORRECT]: {
    label: 'Most correct answers',
    detail: (value, previous) => (previous === null
      ? `${value} correct — your best so far.`
      : `${value} correct — more than your best before (${previous}).`),
  },
  [PERSONAL_BEST_ID.BEST_ACCURACY]: {
    label: 'Best accuracy',
    detail: (value, previous) => (previous === null
      ? `${value}% of your answers were right — your best so far.`
      : `${value}% of your answers were right — up from your best of ${previous}%.`),
  },
  [PERSONAL_BEST_ID.LONGEST_STREAK]: {
    label: 'Longest streak',
    detail: (value, previous) => (previous === null
      ? `${value} right in a row — your longest so far.`
      : `${value} right in a row — longer than your best before (${previous}).`),
  },
  [PERSONAL_BEST_ID.FASTEST_CORRECT]: {
    label: 'Fastest correct answer',
    detail: (value, previous) => (previous === null
      ? `A right answer in ${seconds(value)} — your fastest so far.`
      : `A right answer in ${seconds(value)} — faster than your best before (${seconds(previous)}).`),
  },
});

/**
 * One student's personal bests in this match.
 *
 * @param {object} input
 * @param {object} input.matchResult      this match's result
 * @param {string} input.studentId
 * @param {object[]} input.previousResults earlier match results; the caller
 *        reads them finalized BEFORE this one. Results from another class, an
 *        unfinished match, this same room, or a later finalization are ignored
 *        here too, so a careless caller cannot make a best depend on the future.
 * @returns {{ firstGame: boolean, personalBests: object[] }}
 */
export const personalBestsFor = ({ matchResult = {}, studentId, previousResults = [] } = {}) => {
  const id = String(studentId || '');
  const standing = joinedStanding(matchResult, id);
  if (!id || !standing || matchResult?.status !== 'finished') return Object.freeze({ firstGame: false, personalBests: [] });
  const before = Number(matchResult.finalizedAtMs);
  const earlier = list(previousResults)
    .filter((result) => result
      && result.status === 'finished'
      && String(result.roomId || '') !== String(matchResult.roomId || '')
      && (result.classId || null) === (matchResult.classId || null)
      && (!Number.isFinite(before) || Number(result.finalizedAtMs) < before))
    .map((result) => ({ result, standing: joinedStanding(result, id) }))
    .filter((entry) => entry.standing)
    .sort((a, b) => Number(b.result.finalizedAtMs) - Number(a.result.finalizedAtMs));
  if (!earlier.length) return Object.freeze({ firstGame: true, personalBests: [] });

  const now = personalMetrics(matchResult, standing);
  const history = earlier.map((entry) => personalMetrics(entry.result, entry.standing));
  const personalBests = PERSONAL_BEST_ORDER.flatMap((metric) => {
    const value = now[metric];
    if (!claimable(metric, value)) return [];
    const previousValues = history.map((entry) => entry[metric]).filter((entry) => claimable(metric, entry));
    const previous = previousValues.length
      ? previousValues.reduce((best, entry) => (better(metric, entry, best) ? entry : best))
      : null;
    if (previous !== null && !beats(metric, value, previous)) return [];
    return [Object.freeze({
      id: metric,
      label: COPY[metric].label,
      detail: COPY[metric].detail(value, previous),
      value,
      previous,
    })];
  });
  return Object.freeze({ firstGame: false, personalBests: Object.freeze(personalBests) });
};
