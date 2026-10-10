/*
 * THE PLATFORM HINT LADDER FOR ONE CLASSROOM QUESTION.
 *
 *   buildQuestionHints(question) → [{ text, source }]
 *
 * In order: the AUTHORED hints (supportHints, hints, hint — a string or a
 * list), then the question family's hints built from this problem's own
 * numbers (../families), then one generic fallback, so every question type —
 * multi-answer included — has at least one hint.
 *
 * THE LEAK GUARD. Every hint is checked with hintRevealsAnswer
 * (pathSolutionSupport.mjs) against the answers this module can read for the
 * question (the family's expectedValues plus the plain keys); a hint that
 * contains one is dropped, whoever wrote it. A hint is never a smaller answer.
 *
 * RELEASE (hintRelease): hints are withheld wherever the activity withholds
 * help (DOL, quiz, test — hintsAllowed false) and once the question is closed.
 * The first hint is available on request; each further hint needs one more
 * attempt on record (Path's rule: a new hint follows a new try, it is not a
 * button to tap through to the end).
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { familyFor } from '../families/index.js';

const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const text = (value) => String(value ?? '').trim();
const MAX_HINTS = 6;

const hintText = (entry) => {
  if (typeof entry === 'string') return text(entry);
  if (entry && typeof entry === 'object') return text(entry.text || entry.hint || entry.message || entry.instruction);
  return '';
};

/** The answers this question could leak, as text — the guard's list. */
export const questionAnswerValues = (question = {}) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value === 'object') return;
    const valueText = text(value);
    if (valueText) values.push(valueText);
  };
  try {
    list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
    push(question.answer);
    push(question.solution);
    push(question.target);
    push(question.generatedAnswer);
    list(question.acceptedAnswers).forEach(push);
    if (question.solutionKey && typeof question.solutionKey === 'object') push(question.solutionKey.value);
    const family = familyFor(question);
    if (family) list(family.expectedValues(question)).forEach(push);
  } catch { /* the guard reads what it can */ }
  return [...new Set(values)];
};

const GENERIC_HINTS = Object.freeze([
  'Underline what the question asks you to find, and list the numbers it gives you. Which of them do you need first?',
  'Write the first step of your work on the scratchpad, then check it before going on: does each step keep the two sides (or the quantities) equal?',
]);

const familyHints = (question) => {
  try {
    const family = familyFor(question);
    return family ? list(family.hints(question)).map(hintText) : [];
  } catch {
    return [];
  }
};

export const buildQuestionHints = (question = {}) => {
  if (!question || typeof question !== 'object') return [];
  const authored = [...list(question.supportHints), ...list(question.hints), ...list(question.hint)]
    .map(hintText).filter(Boolean).map((value) => ({ text: value, source: 'authored' }));
  const family = familyHints(question).filter(Boolean).map((value) => ({ text: value, source: 'family' }));
  const answers = questionAnswerValues(question);
  const seen = new Set();
  const safe = [...authored, ...family].filter((hint) => {
    const key = hint.text.toLowerCase();
    if (seen.has(key) || hintRevealsAnswer(hint.text, answers)) return false;
    seen.add(key);
    return true;
  });
  if (!safe.length) safe.push(...GENERIC_HINTS.map((value) => ({ text: value, source: 'generic' })));
  return safe.slice(0, MAX_HINTS);
};

/*
 * Which hints the student may see now.
 *   { allowed, available: count unlocked, nextUnlocksAfterAttempt }
 */
export const hintRelease = ({ hints = [], revealed = 0, attemptCount = 0, hintsAllowed = true, closed = false } = {}) => {
  if (!hintsAllowed || closed || !hints.length) return { allowed: false, available: 0, canRevealNext: false };
  const unlocked = Math.min(hints.length, 1 + Math.max(0, Number(attemptCount) || 0));
  return {
    allowed: true,
    available: unlocked,
    canRevealNext: revealed < unlocked,
    waitingForAttempt: revealed >= unlocked && revealed < hints.length,
  };
};
