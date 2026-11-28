/*
 * EVERY TEXT THE CLASSROOM FEEDBACK LADDER CAN PRODUCE, which an exit ticket
 * (DOL) or a test may not carry while an item can still be answered.
 *
 * tests/browser/assessmentLeakGates.mjs refuses each of them anywhere in a DOL
 * or test page's document (visible text, aria-labels, live regions, hidden
 * nodes). Its document includes the page's stylesheets: in development Vite
 * serves each one as a <style>, comments and all, so a CSS comment that
 * quotes the hint button fails the gate as surely as a leaked hint does.
 * tests/platform/stylesheetsQuoteNoLeakWords.test.mjs reads this same list to
 * refuse that in every stylesheet before a browser is started.
 */
import { MISCONCEPTION_STUDENT_MESSAGES } from '../../../functions/shared/misconceptionStudentMessages.mjs';
import { GENERIC_MISS_MESSAGES } from '../../../src/platform/supports/feedback/genericMissChecks.js';
import { FALLBACK_HINTS } from '../../../src/platform/supports/hints/questionHints.js';
import { PENDING_RUNG_TEXT } from '../../../src/platform/supports/hints/hintCopy.js';
import { EXAMPLE_COULD_NOT_LOAD_TEXT } from '../../../src/platform/supports/hints/hintCopy.js';
import { EXAMPLE_OPENED_ANNOUNCEMENT } from '../../../src/platform/supports/workedExample/examplePlayer.js';
import {
  EXAMPLE_FADED_OPENED_TEXT,
  EXAMPLE_FADED_TURN_TEXT,
  EXAMPLE_OPENED_BY_ITSELF_TEXT,
  EXAMPLE_PROBLEM_NOTE,
  EXAMPLE_YOUR_TURN_TEXT,
  SPOT_THE_MISTAKE_DIFFERENT,
  SPOT_THE_MISTAKE_INTRO,
  SPOT_THE_MISTAKE_NOTE,
  SPOT_THE_MISTAKE_OTHER,
  SPOT_THE_MISTAKE_QUESTION,
  SPOT_THE_MISTAKE_RIGHT,
  SPOT_THE_MISTAKE_THIS_STEP,
  WHY_THIS_STEP_OTHER,
  WHY_THIS_STEP_PROMPT,
  WHY_THIS_STEP_RIGHT,
} from '../../../src/platform/supports/workedExample/exampleSlides.js';
import { SPOT_THE_MISTAKE_GENERIC } from '../../../src/platform/supports/workedExample/spotTheMistake.js';
import { REFERENCE_CARD_TEXT } from '../../../src/platform/supports/referenceCards/referenceCardLibrary.js';

// Authored supports (marked LEAKCHECK in the fixtures) and the ladder's own
// words.
export const LADDER_WORDS = Object.freeze(['LEAKCHECK', 'A hint is ready', 'Show a hint', 'See why it works', 'Worked solution', 'Why it works', 'Try a similar one', 'A similar problem, worked out', 'Let’s back up',
  // Student pass 3, Batch 4: the worked sibling after a miss, the diagnosis
  // rung, and the sentence beside every hint offer.
  'See a similar problem worked', 'What might have gone wrong', 'Hints never lower your grade', 'won\'t count toward unlocking',
  // Student pass 3, wave 6 (HELP-23): the pointer beside the fallbacks, and
  // every fallback (none may reach a DOL or test).
  'These hints are general', ...Object.values(FALLBACK_HINTS).flat(),
  // Hint-ladder timing: the line a rung shows while its tool loads.
  PENDING_RUNG_TEXT,
  // The worked-example player (WE-A): its hand-over sentence, the line it
  // opens with on Classwork, the line under its problem, and its loading line.
  // A DOL, quiz or test never shows an example. Its name ("Worked example")
  // and its last button ("Your turn") are words real prompts use too, so the
  // gate looks for the player itself instead (EXAMPLE_CONTROL_SELECTORS).
  EXAMPLE_YOUR_TURN_TEXT, EXAMPLE_OPENED_BY_ITSELF_TEXT, EXAMPLE_PROBLEM_NOTE, 'Loading the example',
  EXAMPLE_OPENED_ANNOUNCEMENT, EXAMPLE_COULD_NOT_LOAD_TEXT,
  // The tool replay and the faded example (WE-C): what a faded example opens
  // and ends with, and the name of the line every replayed move has.
  EXAMPLE_FADED_OPENED_TEXT, EXAMPLE_FADED_TURN_TEXT, 'The same move on both sides',
  // The radical replay (WE-D): the names of its rejected candidate and its zero
  // product line. "Show how" is a phrase real prompts use, so the gate looks
  // for the button itself (EXAMPLE_CONTROL_SELECTORS).
  'Extraneous: rejected', 'Each factor equal to 0',
  // The plane replay (WE-E): the names of its drawn line and its test point.
  // "Rise and run" is a phrase real prompts use, so the gate looks for the
  // picture itself (EXAMPLE_CONTROL_SELECTORS).
  'The line, dashed', 'The line, solid', 'With the point put in',
  // Spot the mistake and Why this step? (WE-F): every sentence of their own,
  // and the two fixed wrong choices. Their names ("Spot the mistake", "Why
  // this step?") and "Skip" are words real prompts use, so the gate looks for
  // the controls themselves (EXAMPLE_CONTROL_SELECTORS).
  SPOT_THE_MISTAKE_INTRO, SPOT_THE_MISTAKE_QUESTION, SPOT_THE_MISTAKE_RIGHT, SPOT_THE_MISTAKE_OTHER, SPOT_THE_MISTAKE_NOTE,
  SPOT_THE_MISTAKE_DIFFERENT, SPOT_THE_MISTAKE_THIS_STEP, "Not this step's mistake", "not this step's mistake",
  ...SPOT_THE_MISTAKE_GENERIC, WHY_THIS_STEP_PROMPT, WHY_THIS_STEP_RIGHT, WHY_THIS_STEP_OTHER,
  // The reference cards (WE-H): every fixed word of a card, in English and in
  // Spanish (its name, its note, its parts heading, what Read aloud calls it).
  // A card's own titles and formulas ("The slope formula") are words real
  // prompts use, so the gate looks for the card itself (REFERENCE_CARD_SELECTORS).
  ...Object.values(REFERENCE_CARD_TEXT).flatMap((words) => Object.values(words))]);

/**
 * Every control of the worked example: the open example, the player inside
 * it, and the offer of one after a miss. None may be in a DOL, quiz or test
 * page's document, drawn or hidden.
 */
export const EXAMPLE_CONTROL_SELECTORS = Object.freeze([
  '[data-similar-example]', '[data-worked-example-player]', '[data-similar-offer]', '[data-example-opened-by-itself]', '[data-example-next]', '[data-example-your-turn]',
  '[data-example-announcement]', '[data-example-whole]',
  // WE-C: a replayed move's board, and a faded example.
  '[data-example-board]', '[data-example-board-line]', '[data-example-faded]', '[data-example-show-how]', '[data-example-plane]',
  // WE-F: Spot the mistake (its step, its choices, its answer) and Why this step?.
  '[data-spot-the-mistake]', '[data-spot-line]', '[data-spot-choice]', '[data-spot-feedback]', '[data-spot-chosen]', '[data-why-this-step]', '[data-why-choice]', '[data-why-skip]', '[data-why-feedback]',
]);

/**
 * Every part of a pinned reference card (WE-H): the cards, each card, its
 * formulas, its parts and their disclosure, and the row that holds them. None
 * may be in a DOL, quiz or test page's document, drawn or hidden.
 */
export const REFERENCE_CARD_SELECTORS = Object.freeze([
  '[data-reference-cards-row]', '[data-reference-cards]', '[data-reference-card]', '[data-reference-card-skill]', '[data-reference-card-note]', '[data-reference-card-name]',
  '[data-reference-card-title]', '[data-reference-card-formulas]', '[data-reference-card-formula]', '[data-reference-card-conditions]', '[data-reference-card-condition]', '[data-reference-card-parts]', '[data-reference-card-part]',
]);

/** Every control or support a DOL, quiz or test page may not carry: the worked example's and the reference card's. */
export const ASSESSMENT_LEAK_SELECTORS = Object.freeze([...EXAMPLE_CONTROL_SELECTORS, ...REFERENCE_CARD_SELECTORS]);

// Every misconception and generic miss message.
export const MISS_MESSAGES = Object.freeze([...Object.values(MISCONCEPTION_STUDENT_MESSAGES), ...Object.values(GENERIC_MISS_MESSAGES)]);

/** Every text the leak gate refuses on a DOL or test page. */
export const ASSESSMENT_LEAK_TEXTS = Object.freeze([...LADDER_WORDS, ...MISS_MESSAGES]);
