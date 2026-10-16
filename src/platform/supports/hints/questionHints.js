/*
 * THE PLATFORM HINT LADDER FOR ONE CLASSROOM QUESTION.
 *
 *   buildQuestionHints(question, { toolHints }) → [{ text, source }]
 *
 * In order: the AUTHORED hints (supportHints, hints, hint — a string or a
 * list), then the question family's hints built from this problem's own
 * numbers (../families), then the hints of the registry tool on screen
 * (`toolHints`, see below), then one generic fallback only when there is
 * nothing else, so every question type — multi-answer included — has at least
 * one hint.
 *
 * ONE LADDER PER QUESTION (student pass 3, HELP-10). A registry tool used to
 * carry a second ladder of its own ("Stuck? Show a hint", ToolShell HintPanel)
 * that a student could tap through to the end with no attempt — on Graphing 2
 * the last rung said "Plot (0, 3) and (2, 3)". A tool inside a question now
 * hands its rungs to this ladder instead (toolHintChannel.js), so they get the
 * release rule and the leak guard below like any other hint.
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

export const buildQuestionHints = (question = {}, { toolHints = [] } = {}) => {
  if (!question || typeof question !== 'object') return [];
  const authored = [...list(question.supportHints), ...list(question.hints), ...list(question.hint)]
    .map(hintText).filter(Boolean).map((value) => ({ text: value, source: 'authored' }));
  const family = familyHints(question).filter(Boolean).map((value) => ({ text: value, source: 'family' }));
  const tool = list(toolHints).map(hintText).filter(Boolean).map((value) => ({ text: value, source: 'tool' }));
  const answers = questionAnswerValues(question);
  const seen = new Set();
  const safe = [...authored, ...family, ...tool].filter((hint) => {
    const key = hint.text.toLowerCase();
    if (seen.has(key) || hintRevealsAnswer(hint.text, answers)) return false;
    seen.add(key);
    return true;
  });
  if (!safe.length) safe.push(...GENERIC_HINTS.map((value) => ({ text: value, source: 'generic' })));
  return safe.slice(0, MAX_HINTS);
};

/*
 * WHAT THE PANEL SHOWS, WHEN THE LADDER CAN CHANGE UNDER IT.
 *
 *   hintLadderView({ ladder, revealedTexts, revealedCount }) → { hints, revealed, next }
 *
 * A tool's rungs follow what is on screen (its mode, its stage), so the ladder
 * can change while the question is open. A hint the student read stays exactly
 * as they read it (`revealedTexts`, in order), and the next one is the first
 * rung of the CURRENT ladder they have not read — never the rest of a stage
 * they have left. `revealedCount` is the count the attempt records (and
 * supportUseMemory restores, without the texts): any hint counted but not
 * remembered is taken from the ladder in order, which is what was shown when
 * the ladder did not change. `hints` is what was read followed by what is left,
 * so hintRelease reads it unchanged.
 */
export const hintLadderView = ({ ladder = [], revealedTexts = [], revealedCount = 0 } = {}) => {
  const entries = list(ladder).filter((hint) => hint && text(hint.text));
  const key = (hint) => text(hint.text).toLowerCase();
  const shown = [];
  const seen = new Set();
  list(revealedTexts).forEach((hint) => {
    if (!hint || !text(hint.text) || seen.has(key(hint))) return;
    seen.add(key(hint));
    shown.push(hint);
  });
  const owed = Math.max(0, Math.floor(Number(revealedCount) || 0) - shown.length);
  entries.filter((hint) => !seen.has(key(hint))).slice(0, owed).forEach((hint) => {
    seen.add(key(hint));
    shown.push(hint);
  });
  const remaining = entries.filter((hint) => !seen.has(key(hint)));
  return { hints: [...shown, ...remaining], revealed: shown.length, next: remaining[0] || null };
};

/*
 * "WHAT MIGHT HAVE GONE WRONG?" — THE DIAGNOSIS AS A RUNG (student pass 3,
 * HELP-2, decision D2).
 *
 *   diagnosisHint({ question, diagnosis, alreadyShown }) → { text, code, source } | null
 *
 * While attempts are left the miss box names no move that yields the answer
 * (genericMissChecks.js, QA M1), so the specific message — "right size but the
 * opposite sign" — used to wait until the question had closed and could no
 * longer be fixed. The student may now ASK for it: it is a rung of the hint
 * ladder, opened only on request and recorded as help like any hint, and so
 * it exists only where hints do (never on a DOL, quiz or test). The leak guard
 * still reads it: the messages are fixed text, and one that ever carried an
 * answer would be dropped like any hint. Nothing is offered when the box below
 * already says the same words.
 */
export const diagnosisHint = ({ question = null, diagnosis = null, alreadyShown = '' } = {}) => {
  const message = text(diagnosis?.message);
  if (!question || !message) return null;
  if (message === text(alreadyShown)) return null;
  if (hintRevealsAnswer(message, questionAnswerValues(question))) return null;
  return { text: message, code: text(diagnosis.code) || null, source: text(diagnosis.source) || 'diagnosis' };
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
