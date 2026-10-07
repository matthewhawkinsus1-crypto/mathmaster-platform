/*
 * A STUDENT'S OWN END-OF-GAME RECAP.
 *
 * When a game finishes, the student's screen asks the server once for their
 * recap (getLiveChallengeMatchRecap): every shared round they could play, how
 * their answer went, and the worked solution — now that no round can be
 * answered — plus their private personal bests and the recognitions they
 * earned. The server builds it from the match result, which no client can
 * read, and it holds only this student's own facts: never another student's
 * name, answers or place.
 *
 * This module reads the reply defensively (the callable may be older or newer
 * than this screen) and turns it into what the card says. A reply that cannot
 * be read is null, and a null recap shows nothing: the final card already
 * says how the game went, so a missing recap is never an error on screen.
 *
 * Pure: no React, no Firebase.
 */

import { PUBLIC_TOP_COUNT } from '../../../functions/shared/liveChallengePrivacy.mjs';

const text = (value, max = 600) => {
  const string = value === null || value === undefined ? '' : String(value).trim();
  return string.length > max ? `${string.slice(0, max - 1)}…` : string;
};
const intOrNull = (value) => (Number.isInteger(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const nonNegative = (value) => Math.max(0, Math.round(Number(value) || 0));
const percentOrNull = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
  ? null
  : Math.max(0, Math.min(100, Math.round(Number(value)))));

/** A worked solution as the server published it, or null. */
export const normalizeSolutionReview = (review = null) => {
  if (!review || typeof review !== 'object') return null;
  const reasoning = (Array.isArray(review.reasoning) ? review.reasoning : []).map((step) => text(step)).filter(Boolean).slice(0, 12);
  const normalized = {
    headline: text(review.headline, 240),
    reasoning,
    commonError: text(review.commonError),
    connection: text(review.connection),
    answerSummary: text(review.answerSummary, 400),
  };
  return normalized.headline || reasoning.length || normalized.answerSummary ? Object.freeze(normalized) : null;
};

const RESULT_TONE = Object.freeze({ CORRECT: 'correct', PARTIAL: 'partial', MISSED: 'missed', NONE: 'none' });
export { RESULT_TONE };

/** "Correct" / "60% credit" / "Not correct" / "No answer" for one of the student's rounds. */
export const recapRoundResult = (round = {}) => {
  if (!round?.answered) return Object.freeze({ text: 'No answer', tone: RESULT_TONE.NONE });
  if (round.isCorrect === true) return Object.freeze({ text: 'Correct', tone: RESULT_TONE.CORRECT });
  const percent = percentOrNull(round.scorePercent);
  return percent && percent > 0
    ? Object.freeze({ text: `${percent}% credit`, tone: RESULT_TONE.PARTIAL })
    : Object.freeze({ text: 'Not correct', tone: RESULT_TONE.MISSED });
};

const normalizeRound = (round = {}, scheduledRoundCount = 0) => {
  const roundIndex = intOrNull(round?.roundIndex);
  if (roundIndex === null || roundIndex < 0) return null;
  const secondChance = round.secondChance === true;
  const originalRoundIndex = intOrNull(round.originalRoundIndex);
  const solutionReview = round.solutionAvailable === true ? normalizeSolutionReview(round.solutionReview) : null;
  const normalized = {
    roundIndex,
    originalRoundIndex: originalRoundIndex !== null && originalRoundIndex >= 0 ? originalRoundIndex : null,
    secondChance,
    answered: round.answered === true,
    isCorrect: round.isCorrect === true ? true : (round.isCorrect === false ? false : null),
    scorePercent: percentOrNull(round.scorePercent),
    prompt: text(round.prompt, 1200) || null,
    teksCode: text(round.teksCode, 40) || null,
    solutionReview,
  };
  return Object.freeze({
    ...normalized,
    label: secondChance
      ? (Number(scheduledRoundCount) > 0 ? `Second Chance round ${roundIndex - Number(scheduledRoundCount) + 1}` : 'Second Chance round')
      : `Round ${roundIndex + 1}`,
    // A replay says which question it brought back.
    replayOf: secondChance && normalized.originalRoundIndex !== null ? `Round ${normalized.originalRoundIndex + 1} again` : null,
    result: recapRoundResult(normalized),
  });
};

const normalizeLine = (entry = {}) => {
  const label = text(entry?.label, 120);
  if (!label) return null;
  // A detail that opens by repeating the label ("Best comeback — after a
  // miss…") would read twice under it; keep only what it adds.
  let detail = text(entry.detail, 240);
  if (detail.toLowerCase().startsWith(label.toLowerCase())) detail = detail.slice(label.length).replace(/^[\s—–:,.-]+/, '');
  if (detail) detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  return Object.freeze({ id: text(entry.id, 60) || label, label, detail });
};

/**
 * The recap reply, read defensively, or null when it is not a finished
 * game's recap for this room.
 */
export const normalizeMatchRecap = (reply = null, { roomId = null, scheduledRoundCount = 0 } = {}) => {
  if (!reply || typeof reply !== 'object') return null;
  if (reply.status !== undefined && reply.status !== 'finished') return null;
  if (roomId && reply.roomId && String(reply.roomId) !== String(roomId)) return null;
  const self = reply.self && typeof reply.self === 'object' ? reply.self : {};
  const rounds = (Array.isArray(reply.rounds) ? reply.rounds : [])
    .map((round) => normalizeRound(round, scheduledRoundCount))
    .filter(Boolean)
    .sort((left, right) => left.roundIndex - right.roundIndex);
  return Object.freeze({
    roomId: text(reply.roomId, 120) || roomId,
    self: Object.freeze({
      joined: self.joined !== false,
      score: nonNegative(self.score),
      correctCount: nonNegative(self.correctCount),
      roundsAnswered: nonNegative(self.roundsAnswered),
      roundsAvailable: nonNegative(self.roundsAvailable),
    }),
    rounds: Object.freeze(rounds),
    personalBests: Object.freeze((Array.isArray(reply.personalBests) ? reply.personalBests : []).map(normalizeLine).filter(Boolean).slice(0, 6)),
    recognitions: Object.freeze((Array.isArray(reply.recognitions) ? reply.recognitions : []).map(normalizeLine).filter(Boolean).slice(0, 6)),
    firstGame: reply.firstGame === true,
    countsAsWarmUp: reply.warmup?.countsAsWarmUp === true,
  });
};

/**
 * What the student did, in the order the final card leads with it when the
 * place is not the headline: recognitions first (something they earned this
 * game), then personal bests (their own record, against nobody else).
 */
export const recapHighlights = (recap = null, max = 3) => {
  if (!recap) return [];
  return [
    ...recap.recognitions.map((line) => ({ ...line, kind: 'recognition' })),
    ...recap.personalBests.map((line) => ({ ...line, kind: 'personalBest' })),
  ].slice(0, Math.max(0, max));
};

/** Whether the recap has anything to show beyond what the final card says. */
export const recapHasContent = (recap = null) => Boolean(recap && (recap.rounds.length || recap.personalBests.length || recap.recognitions.length));

/**
 * The plain sentence about what the game counts for. A Warm-Up game's
 * accuracy IS the student's Warm-Up grade (warmupChallengeGrade.mjs); its
 * points are not. A standalone game changes no grade at all.
 */
export const gameGradeSentence = ({ warmup = false } = {}) => (warmup
  ? 'Your accuracy counts as your Warm-Up; game points don’t.'
  : 'Game points are just for the game — they don’t change any grade.');

/**
 * Whether a final place is truly the student's alone to see, so the card may
 * say "only you see this". Every class-wide board shows the top
 * PUBLIC_TOP_COUNT rows — the projector by default, and the final board on
 * each classmate's own card — so a 4th or 5th place is on them, and when the
 * teacher opts the projector into full standings every place is. The promise
 * is made only when it is kept: outside the top few, with top-few standings.
 */
export const finalPlaceIsPrivate = ({ rank = null, fullStandings = false } = {}) => {
  const place = Number(rank);
  return !fullStandings && rank !== null && Number.isInteger(place) && place > PUBLIC_TOP_COUNT;
};
