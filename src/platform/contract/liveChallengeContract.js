import {
  DEFAULT_ROUND_SECONDS,
  MAX_ROUND_COUNT,
  MAX_ROUND_SECONDS,
  MIN_ROUND_COUNT,
  MIN_ROUND_SECONDS,
  complexityAdjustedRoundSeconds,
} from '../../../functions/shared/liveChallenge.mjs';
import { DOK3_MIN_ROUND_SECONDS } from '../../../functions/shared/liveChallengeDifficulty.mjs';
import {
  READING_SHARE_PERCENT,
  READING_WORDS_PER_SECOND,
  WORDS_PER_FORMULA,
  maxPromptWordsFor,
} from '../../../functions/shared/liveChallengeRoundTiming.mjs';

/*
 * THE "LIVE CHALLENGE ROUNDS" SECTION OF THE AUTHORING CONTRACT (LC14).
 *
 * What an outside AI is told when a teacher asks it for questions that suit a
 * timed class game rather than a lesson: one answer, a fast reader, a round
 * of seconds. Every number in it is read from the rules the game and the
 * timing validator (functions/shared/liveChallengeRoundTiming.mjs) apply, so
 * what the AI is told and what an import will accept cannot drift apart;
 * tests/platform/liveChallengeContractSlice.test.mjs holds the text to the
 * validator's behaviour.
 *
 * It is NOT part of the full Assignment V5 contract: an assignment prompt
 * does not carry it. It is added only to the "liveChallenge" slice
 * (authoringContract.js CONTRACT_SLICES), cut from the same builder as every
 * other slice.
 */

export const LIVE_CHALLENGE_SECTION = 'Live Challenge rounds';

// Words a question may have, by how many steps it takes, in a default round.
const wordsForSteps = (steps) => maxPromptWordsFor(
  complexityAdjustedRoundSeconds({ baselineSeconds: DEFAULT_ROUND_SECONDS, question: { solutionDepth: steps } }),
);
const secondsForSteps = (steps) => complexityAdjustedRoundSeconds({
  baselineSeconds: DEFAULT_ROUND_SECONDS, question: { solutionDepth: steps },
});

export const liveChallengeSectionLines = () => [
  `## ${LIVE_CHALLENGE_SECTION}`,
  '- Use this section only when the teacher asks for questions for a Live Challenge (a timed class game). It does not apply to a lesson or any other assignment, and a lesson never carries Live Challenge fields.',
  '- Return one Assignment V5 object as usual, with a single section of role "practice" holding the round questions. The teacher imports those questions into the Live Challenge Question Library, and MathMaster draws each game\'s rounds from it. Each question must stand on its own, in any round and in any order.',
  `- A round gives the whole class ONE question for ${MIN_ROUND_SECONDS}-${MAX_ROUND_SECONDS} seconds (${DEFAULT_ROUND_SECONDS} by default), and a game has ${MIN_ROUND_COUNT}-${MAX_ROUND_COUNT} rounds. At the default MathMaster runs a one-step question for ${secondsForSteps(1)} seconds, a two-step question for ${secondsForSteps(2)} and a three-step question for ${secondsForSteps(3)}. Reading, working and answering all have to fit.`,
  `- Keep the prompt and any choices to at most ${wordsForSteps(1)} words for a one-step question, ${wordsForSteps(2)} for two steps and ${wordsForSteps(3)} for three (a formula counts as ${WORDS_PER_FORMULA} words). Students read about ${READING_WORDS_PER_SECOND} words a second, and reading should take no more than ${READING_SHARE_PERCENT}% of the round. Put the question first; no story and no preamble.`,
  '- Ask for ONE answer: a number, an expression, an equation, or a choice from four options. Do not ask for several parts, an explanation, a justification or shown work; a timed round has nowhere to write one.',
  `- Write DOK 1 or 2 (recall, or a skill or concept). A DOK 3 question needs a round of at least ${DOK3_MIN_ROUND_SECONDS} seconds, and a DOK 4 question never fits a timed round.`,
  '- Make it answerable by thinking and one entry: no scratchpad, no multi-stage tool, no table or graph the student must build. Reading one graph or figure is fine.',
  '- Make it unambiguous when read fast: one correct answer, the units and the form of the answer stated, no trick wording, and no "which of these is NOT" (a fast reader skips the NOT).',
  '- Give each question its own idea. Do not repeat a question with different numbers: when a question has a generator MathMaster varies the numbers itself.',
  '',
];
