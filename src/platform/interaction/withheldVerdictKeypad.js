/*
 * WHERE THE VERDICT IS WITHHELD, THE KEYPAD SAYS NOTHING ABOUT THE ANSWER
 * (N56, the PR #537 walkthrough's notes).
 *
 * On an exit ticket the keypad of a typed box offered the letters m, p, o and
 * w on a problem in x and y, and its "Needed for this answer" row showed a
 * fraction key only when the answer had a fraction. Both came from the key:
 *
 *   - the import reads each field's key for the symbols it needs and stores
 *     them as `requiredSymbols` (interactionContract.js
 *     normalizeResponseFieldInteractionContract). It read the radicals exit
 *     ticket's template, {{d}}|x{{m|pow}}|y^{{k}}, so "m|pow" became m, p, o
 *     and w;
 *   - the box reads its accepted answers again (MultiAnswerGrader,
 *     inferRequiredAnswerSymbols), and opens its keypad when they hold any;
 *   - MathInput puts those symbols in the "Needed for this answer" row on a
 *     phone, and among the keypad's keys on a laptop. And a box declared an
 *     expression whose key is a plain number got the number pad
 *     (keypadProfileForResponseField).
 *
 * Practice and classwork keep that scaffold: there the verdict comes at once,
 * and a key that says "fraction" says no more than "Not quite" will. Where the
 * verdict is withheld (an exit ticket, a quiz, a test, until its release) the
 * box follows the secure-field rule (assessment/secureAnswerEntry.js): nothing
 * in its keypad comes from the key. It gets
 *
 *   - its pad from what it declares (declaredKeypadProfile);
 *   - the keys the secure field's profile adds, the same on every box of that
 *     profile (SECURE_PROFILE_KEYS: a fraction, |x|, a power, √, π, and / or on
 *     an inequality; set notation and ln on an expression or an equation);
 *   - on an inequality, an expression or an equation, the letters the student
 *     reads: the prompt's mathematics and the field's label (secureFieldLetters,
 *     with x and y on every one) and, since a lesson names its variables in
 *     words ("Let j be Jordan's age and r be Riley's age"), the letters
 *     standing alone in the prompt's words.
 *
 * A phone opens no keyboard of its own for these boxes, so what the answer
 * needs must be on the pad: withheldVerdictKeypad.test.mjs types every exit
 * ticket's key, in every version of every lesson, on the pad this gives.
 * Nothing here grades, or changes what is graded.
 */
import { SECURE_LETTER_PROFILES, SECURE_PROFILE_KEYS, secureFieldLetters } from '../assessment/secureAnswerEntry.js';
import { requiredAnswerToolForSymbol } from './answerEntryTools.js';
import { keypadProfileForResponseField, normalizeInteractionInputProfile } from './interactionContract.js';
import { isMathSegment, splitMathSegments } from '../../components/common/mathSegments.js';

/** The pad a box declares, never one its key implies (a plain-number key read as the number pad). */
export const declaredKeypadProfile = (field = {}) => keypadProfileForResponseField({
  ...field, answer: null, expected: null, correctAnswer: null, acceptedAnswers: [],
});

// The secure profile whose keys a pad gets: the pad's own, or, on the general
// pad, an equation if the box declares one, else an expression.
const PAD_PROFILES = new Set(['set', 'inequality', 'number', 'orderedPair', 'interval', 'equation', 'expression']);
const profileOfPad = (field, toolProfile) => {
  if (PAD_PROFILES.has(toolProfile)) return toolProfile;
  return normalizeInteractionInputProfile(field?.inputProfile) === 'equation' ? 'equation' : 'expression';
};

// A letter standing alone in words (a coefficient before it is allowed: 3t);
// one beside an accented letter is part of a word ("César"). "a", "A" and "I"
// are words, except where the sentence names them a variable: "Let a be the
// number of adult tickets", "a = 5", "a, the number of…" (L2's exit ticket).
const WORD_LETTERS = new Set(['a', 'A', 'I']);
const NAMED_HERE = /^\s*(?:(?:be|is|are|represents?|stands?|denotes?|equals?)\b|[=,;:)])/;
const lettersInWords = (text = '') => {
  const words = splitMathSegments(String(text ?? '')).filter((segment) => !isMathSegment(segment)).join(' ');
  return [...words.matchAll(/(?<![\p{L}'’-])[A-Za-z](?![\p{L}\p{N}'’])/gu)]
    .filter(({ 0: letter, index }) => !WORD_LETTERS.has(letter) || NAMED_HERE.test(words.slice(index + 1)))
    .map(([letter]) => letter);
};

/**
 * The keys a typed box adds to its pad while its verdict is withheld, in
 * place of anything read from its key. `toolProfile` is the pad it shows,
 * `prompt` the question's.
 */
export const withheldVerdictKeys = (field = {}, { prompt = '', toolProfile = '' } = {}) => {
  const profile = profileOfPad(field, toolProfile);
  const keys = [];
  const add = (key) => { if (key && !keys.some((existing) => existing.command === key.command)) keys.push(key); };
  (SECURE_PROFILE_KEYS[profile] || []).forEach(add);
  if (SECURE_LETTER_PROFILES.includes(profile)) {
    [...secureFieldLetters({ prompt, label: field?.label }), ...lettersInWords(prompt)]
      .forEach((letter) => add(requiredAnswerToolForSymbol(letter)));
  }
  return Object.freeze(keys);
};
