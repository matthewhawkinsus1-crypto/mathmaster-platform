/*
 * CAN A CLASS READ THIS QUESTION AND ANSWER IT IN THE ROUND IT IS IN? (LC14)
 *
 * The timing validator for a Live Challenge round set, and the one place the
 * numbers an outside AI is told (the authoring contract's "Live Challenge
 * rounds" section, src/platform/contract/liveChallengeContract.js) come from.
 * A round gives a whole class one question for 15–120 seconds (45 by default);
 * a question written for homework can be a fine question and still be the
 * wrong one for that clock. This answers, for each question of a set, what the
 * game itself would do with it and what it would only be unfair to ask:
 *
 *   ERRORS — the game would refuse it, or could not play it:
 *     notAnswerable   a live round cannot draw its answer box or choices
 *                     (liveChallengeResponseReadiness, the gate the game
 *                     already applies), or the question has no words
 *     tooDeep         a multi-step (DOK 3) question in a round shorter than
 *                     DOK3_MIN_ROUND_SECONDS, or any DOK 4 question, in a timed
 *                     round (liveChallengeDifficulty.fitsTimedRound, the filter
 *                     the game applies when it draws a set)
 *     roundSeconds    the set's round length is outside 15–120 seconds
 *     roundCount      the set has fewer than 3 or more than 20 questions
 *
 *   WARNINGS — the game would play it, and it is probably unfair:
 *     longToRead      reading it takes more than READING_SHARE_PERCENT of the
 *                     round: the round measures reading speed, not mathematics
 *     severalParts    more than one answer box: each part is time
 *     asksToExplain   it asks the student to explain, justify or show work: a
 *                     timed round has nowhere to write one
 *
 * A Pace Race has no clock to fit, so only the errors that do not depend on
 * one (notAnswerable, the set's count) apply to it.
 *
 * WHAT THIS DOES NOT CHECK. Whether the question is unambiguous when read fast,
 * whether it needs a scratchpad or a tool with several stages, and whether it
 * is mathematically right: those are the author's, and the authoring contract
 * says so. Whether the server can issue and grade it is Path's gate
 * (safeBuildTemplateIssuePlan), which an import must still run. A reading pace
 * is an assumption, written down here and nowhere else: about 3 words a second
 * is a comfortable pace for a student reading mathematics on a screen, and
 * reading should not take more than 40% of a round, which leaves most of it to
 * think and answer in. Pure: Cloud Functions, the browser and tests.
 */

import {
  DEFAULT_ROUND_SECONDS,
  MAX_ROUND_COUNT,
  MAX_ROUND_SECONDS,
  MIN_ROUND_COUNT,
  MIN_ROUND_SECONDS,
  complexityAdjustedRoundSeconds,
  liveChallengeResponseReadiness,
  normalizeChallengeTimingMode,
} from './liveChallenge.mjs';
import { DOK3_MIN_ROUND_SECONDS, fitsTimedRound, questionDok, timedRoundSecondsFor } from './liveChallengeDifficulty.mjs';

export const READING_WORDS_PER_SECOND = 3;
// Whole percent, so the limit below is exact integer arithmetic.
export const READING_SHARE_PERCENT = 40;
// A formula takes longer to read than a word; it counts as this many.
export const WORDS_PER_FORMULA = 2;

/** The most words a prompt and its choices may have in a round of this length. */
export const maxPromptWordsFor = (roundSeconds) => Math.floor(
  (Math.max(0, Number(roundSeconds) || 0) * READING_SHARE_PERCENT * READING_WORDS_PER_SECOND) / 100,
);

export const CHALLENGE_PROBLEM = Object.freeze({
  NOT_ANSWERABLE: 'notAnswerable',
  TOO_DEEP: 'tooDeep',
  ROUND_SECONDS: 'roundSeconds',
  ROUND_COUNT: 'roundCount',
  LONG_TO_READ: 'longToRead',
  SEVERAL_PARTS: 'severalParts',
  ASKS_TO_EXPLAIN: 'asksToExplain',
});

const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning' });

const text = (value) => String(value ?? '').trim();

// What a reason from liveChallengeResponseReadiness means to the author.
const NOT_ANSWERABLE_SENTENCE = Object.freeze({
  no_response_fields: 'It has no answer box or choices, so a student could not answer it.',
  choice_field_has_no_choices: 'A multiple-choice answer needs at least two choices.',
  choice_profile_mismatch: 'It says to choose or select, but the answer is a typed box. Make it multiple choice, or reword it.',
  choice_instruction_has_no_choices: 'It says to choose or select, but gives no choices.',
  unsupported_response_profile: 'Its answer box is a kind a live round cannot show.',
});

/*
 * Words a student has to read: the prompt and every choice they are shown.
 * A $formula$ counts as WORDS_PER_FORMULA words however long its markup is,
 * and markup around words (\text{...}) costs nothing.
 */
const countWords = (value) => {
  const source = text(value);
  if (!source) return 0;
  let formulas = 0;
  const prose = source.replace(/\$\$?[^$]+\$\$?/g, () => { formulas += 1; return ' '; });
  const words = prose.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  return words + formulas * WORDS_PER_FORMULA;
};

const choiceText = (choice) => (choice && typeof choice === 'object' ? text(choice.label ?? choice.text ?? choice.value) : text(choice));

/** The prompt and choices a student reads, as words. */
export const wordsToRead = (question = {}) => {
  const prompt = text(question?.prompt ?? question?.stem ?? question?.question);
  const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
  // The same choices are often on the question and on its field; read once.
  const seen = new Set();
  const choices = [question?.choices, ...fields.map((field) => field?.choices)]
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map(choiceText)
    .filter((choice) => choice && !seen.has(choice) && seen.add(choice));
  return countWords(prompt) + choices.reduce((total, choice) => total + countWords(choice), 0);
};

const EXPLAIN = /\b(?:explain|justify|show (?:your )?work|in your own words|describe how)\b/i;

const asksToExplain = (question = {}) => {
  const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
  return [question?.prompt, ...fields.flatMap((field) => [field?.label, field?.responseHint])]
    .some((part) => EXPLAIN.test(text(part)));
};

/**
 * Judge one question for a round of `roundSeconds` (the teacher's setting, 15–120).
 *
 * @returns {{ ok: boolean, seconds: number|null, words: number, readSeconds: number,
 *   problems: Array<{ code: string, severity: string, message: string }> }}
 *   `ok` is "no errors" (warnings do not make a question unusable); `seconds` is
 *   how long the game would actually run its round (null in a Pace Race).
 */
export const validateChallengeRound = ({ question = {}, roundSeconds = DEFAULT_ROUND_SECONDS, timingMode = 'timed' } = {}) => {
  const timed = normalizeChallengeTimingMode(timingMode) === 'timed';
  const problems = [];
  const add = (code, severity, message) => problems.push({ code, severity, message });

  // Run the way the game runs it: the teacher's length is a baseline, the
  // question fits its own round (complexityAdjustedRoundSeconds), and a
  // multi-step question is never given less than DOK3_MIN_ROUND_SECONDS.
  const adjusted = complexityAdjustedRoundSeconds({ baselineSeconds: roundSeconds, question });
  const seconds = timed ? timedRoundSecondsFor({ question, adjustedSeconds: adjusted, timingMode: 'timed' }) : null;

  const words = wordsToRead(question);
  if (!text(question?.prompt ?? question?.stem ?? question?.question)) {
    add(CHALLENGE_PROBLEM.NOT_ANSWERABLE, SEVERITY.ERROR, 'It has no question for the class to read.');
  }
  const readiness = liveChallengeResponseReadiness(question);
  if (!readiness.eligible) {
    add(CHALLENGE_PROBLEM.NOT_ANSWERABLE, SEVERITY.ERROR, NOT_ANSWERABLE_SENTENCE[readiness.reason] || 'A live round cannot show how to answer it.');
  }

  if (!fitsTimedRound(question, { roundSeconds: adjusted, timingMode })) {
    add(
      CHALLENGE_PROBLEM.TOO_DEEP,
      SEVERITY.ERROR,
      questionDok(question) >= 4
        ? 'It is an extended-thinking (DOK 4) question, which never fits a timed round. Use a Pace Race, or a shorter question.'
        : `It is a multi-step (DOK 3) question and needs a round of at least ${DOK3_MIN_ROUND_SECONDS} seconds; this game would give it ${adjusted}. Make it a one-step question, or use longer rounds.`,
    );
  }

  const readSeconds = Math.round((words / READING_WORDS_PER_SECOND) * 10) / 10;
  if (timed && words > maxPromptWordsFor(seconds)) {
    add(
      CHALLENGE_PROBLEM.LONG_TO_READ,
      SEVERITY.WARNING,
      `It is about ${words} words, which takes about ${Math.round(readSeconds)} seconds just to read. A ${seconds}-second round works best at ${maxPromptWordsFor(seconds)} words or fewer.`,
    );
  }

  const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
  if (fields.length > 1) {
    add(CHALLENGE_PROBLEM.SEVERAL_PARTS, SEVERITY.WARNING, `It has ${fields.length} answers to give. A timed round works best with one.`);
  }
  if (asksToExplain(question)) {
    add(CHALLENGE_PROBLEM.ASKS_TO_EXPLAIN, SEVERITY.WARNING, 'It asks the student to explain or show work. A timed round has no room to write one.');
  }

  return {
    ok: !problems.some((problem) => problem.severity === SEVERITY.ERROR),
    seconds,
    words,
    readSeconds,
    problems,
  };
};

/**
 * Judge a whole round set: its length and size, then every question.
 *
 * @returns {{ ok: boolean, problems: Array, rounds: Array, totalSeconds: number|null }}
 *   `problems` are the set's own; each of `rounds` is validateChallengeRound's
 *   answer for that question (in order, with its `index`). `totalSeconds` is
 *   how long the rounds would run together (null in a Pace Race).
 */
export const validateChallengeRoundSet = ({ questions = [], roundSeconds = DEFAULT_ROUND_SECONDS, timingMode = 'timed' } = {}) => {
  const timed = normalizeChallengeTimingMode(timingMode) === 'timed';
  const list = Array.isArray(questions) ? questions : [];
  const problems = [];
  const seconds = Number(roundSeconds);
  if (timed && !(Number.isInteger(seconds) && seconds >= MIN_ROUND_SECONDS && seconds <= MAX_ROUND_SECONDS)) {
    problems.push({
      code: CHALLENGE_PROBLEM.ROUND_SECONDS,
      severity: SEVERITY.ERROR,
      message: `A round runs ${MIN_ROUND_SECONDS} to ${MAX_ROUND_SECONDS} seconds.`,
    });
  }
  if (list.length < MIN_ROUND_COUNT || list.length > MAX_ROUND_COUNT) {
    problems.push({
      code: CHALLENGE_PROBLEM.ROUND_COUNT,
      severity: SEVERITY.ERROR,
      message: `A game has ${MIN_ROUND_COUNT} to ${MAX_ROUND_COUNT} rounds; this set has ${list.length}.`,
    });
  }
  const rounds = list.map((question, index) => ({
    index,
    ...validateChallengeRound({ question, roundSeconds: Number.isFinite(seconds) ? seconds : DEFAULT_ROUND_SECONDS, timingMode }),
  }));
  return {
    ok: !problems.length && rounds.every((round) => round.ok),
    problems,
    rounds,
    totalSeconds: timed ? rounds.reduce((total, round) => total + (round.seconds || 0), 0) : null,
  };
};
