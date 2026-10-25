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
 * THE LEAK GUARD. Every hint is checked against the answers this module can
 * read for the question (the family's expectedValues, the plain keys and a
 * table's answer cells); a hint that states one is dropped, whoever wrote it.
 * A hint is never a smaller answer. A NUMBER answer that the hint only writes
 * inside the problem's own expression or point, quoted whole ("solve
 * 0 = 3x − 8" when the slope is 3), is not stated (HELP-16, hintLeakGuard.js);
 * a point, an expression or a word answer always is. questionHintAudit lists
 * every hint with the reason it was dropped, for Pre-Flight.
 *
 * FALLBACKS THAT FIT (HELP-23). Where nothing else is left, the fallback is
 * chosen by what the student does — solve a system, work a matrix, sort cards,
 * read or build a graph, build representations, pick a choice — and names no
 * method step the item measures. The panel then points to Ask my teacher.
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
import { authoredHintTranslations } from '../../language/authoredSupportText.js';
import { hintAnswerLeak } from './hintLeakGuard.js';

const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const text = (value) => String(value ?? '').trim();
const MAX_HINTS = 6;

const hintText = (entry) => {
  if (typeof entry === 'string') return text(entry);
  if (entry && typeof entry === 'object') return text(entry.text || entry.hint || entry.message || entry.instruction);
  return '';
};

/**
 * The teacher-written hints of a question, in the order the ladder reads them
 * (supportHints, hints, hint), empty ones left out. Hint N here is hint N on
 * the student's screen and line N of `translations.<language>.hints`, so the
 * ladder, Pre-Flight and the Spanish a teacher wrote all count the same way.
 */
export const authoredHintTexts = (question = {}) => [...list(question.supportHints), ...list(question.hints), ...list(question.hint)]
  .map(hintText).filter(Boolean);

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
    // A table's answer cells: "(4/5)(−2) = −8/5" filled the first row.
    const tableAnswers = question.table?.answers;
    if (tableAnswers && typeof tableAnswers === 'object' && !Array.isArray(tableAnswers)) Object.values(tableAnswers).forEach(push);
    const family = familyFor(question);
    if (family) list(family.expectedValues(question)).forEach(push);
  } catch { /* the guard reads what it can */ }
  return [...new Set(values)];
};

/*
 * What the student already reads: the prompt and the field labels (never a
 * choice's options — the right one is an answer). A number the hint only
 * quotes from here is not one the hint states (hintLeakGuard.js).
 */
export const questionVisibleText = (question = {}) => [
  question.prompt,
  question.stem,
  question.question,
  ...list(question.answerFields).map((field) => field?.label),
].filter((value) => typeof value === 'string' && value.trim()).join('\n');

// The fallbacks, by what the student does. Each is about reading and checking
// the student's own work, never a method step the item measures.
export const FALLBACK_HINTS = Object.freeze({
  systems: Object.freeze([
    'Read every equation before you start. A solution has to make all of them true at the same time.',
    'When you find a value, check it in an equation you have not used yet. If it does not fit, look back at your last step.',
  ]),
  matrix: Object.freeze([
    'Say what each row and each column of the matrix stands for before you change anything.',
    'When you have an answer, put it back into the original equations to check it.',
  ]),
  sort: Object.freeze([
    'Look at one card at a time. Say one thing you can read from it before you place it.',
    'If two cards look alike, find one thing that is different about them.',
  ]),
  graphChoice: Object.freeze([
    'Read the labels and the scale on each axis first: how much is one grid square worth?',
    'Rule out one choice that does not fit the graph, and say why.',
  ]),
  graph: Object.freeze([
    'Read the scale on each axis before you plot: how much is one grid square worth?',
    'After you place a point, read its coordinates back from the grid. Is it where you meant to put it?',
  ]),
  build: Object.freeze([
    'Start with what you are given and say in words what it tells you.',
    'Every representation you build describes the same relationship. Check that two of them agree before you go on.',
  ]),
  choice: Object.freeze([
    'Read each choice all the way through before you pick one.',
    'Rule out one choice you are sure is wrong, and say why.',
  ]),
  general: Object.freeze([
    'Underline what the question asks you to find, and list the numbers it gives you. Which of them do you need first?',
    'Write the first step of your work on the scratchpad, then check it before going on: does each step keep the two sides (or the quantities) equal?',
  ]),
});

const SORT_TYPES = new Set(['figureMatch', 'representationMatch', 'openSortBoard']);
const isChoiceField = (field) => /choice|select|dropdown/i.test(String(field?.type || field?.inputProfile || ''));

/** Which fallback fits: what the student does on this question. */
export const fallbackKind = (question = {}) => {
  const type = text(question.type || question.toolId);
  const tool = text(question.toolId);
  if (type === 'matrixLab' || tool === 'matrixLab') return 'matrix';
  if (type === 'systemsWorkspace' || tool === 'systemsWorkspace') return 'systems';
  if (SORT_TYPES.has(type) || SORT_TYPES.has(tool)) return 'sort';
  if (type === 'representationBridge' || tool === 'representationBridge') return 'build';
  if (type === 'graphChoicePreview') return 'graphChoice';
  if (/graph|plot|transformations|parabola|plane/i.test(type)) return 'graph';
  const fields = list(question.answerFields);
  if (type === 'multipleChoice' || (fields.length && fields.every(isChoiceField))) return 'choice';
  return 'general';
};

export const fallbackHints = (question = {}) => FALLBACK_HINTS[fallbackKind(question)] || FALLBACK_HINTS.general;

const familyHints = (question) => {
  try {
    const family = familyFor(question);
    return family ? list(family.hints(question)).map(hintText) : [];
  } catch {
    return [];
  }
};

/*
 * Every hint the question could offer, with the guard's verdict: shown, or
 * dropped with the reason (a repeat, or the answers it states). The ladder is
 * the shown ones; Pre-Flight lists the dropped ones for the author.
 */
export const questionHintAudit = (question = {}, { toolHints = [] } = {}) => {
  if (!question || typeof question !== 'object') return [];
  // The teacher's own wording in another language rides with the hint it
  // translates (authoredSupportText.js); a hint with none is exactly as before.
  const authored = authoredHintTexts(question).map((value, index) => {
    const translations = authoredHintTranslations(question, index);
    return Object.keys(translations).length
      ? { text: value, source: 'authored', translations }
      : { text: value, source: 'authored' };
  });
  const family = familyHints(question).filter(Boolean).map((value) => ({ text: value, source: 'family' }));
  const tool = list(toolHints).map((entry) => ({ value: hintText(entry), standing: entry?.standing === true }))
    .filter(({ value }) => value)
    .map(({ value, standing }) => (standing ? { text: value, source: 'tool', standing: true } : { text: value, source: 'tool' }));
  const options = { answers: questionAnswerValues(question), visibleText: questionVisibleText(question) };
  const seen = new Set();
  return [...authored, ...family, ...tool].map((hint) => {
    const key = hint.text.toLowerCase();
    if (seen.has(key)) return { ...hint, shown: false, repeat: true, reason: 'it repeats an earlier hint' };
    const leak = hintAnswerLeak(hint.text, options);
    if (leak) return { ...hint, shown: false, values: leak.values, reason: leak.reason };
    seen.add(key);
    return { ...hint, shown: true };
  });
};

export const buildQuestionHints = (question = {}, { toolHints = [] } = {}) => {
  if (!question || typeof question !== 'object') return [];
  const shown = questionHintAudit(question, { toolHints }).filter((hint) => hint.shown)
    .map(({ text: value, source, standing, translations }) => ({
      text: value,
      source,
      ...(standing ? { standing } : {}),
      ...(translations ? { translations } : {}),
    }));
  // A standing rung (the step solver's, TOOL-5) comes first and is released
  // from the start without taking another rung's place (hintRelease), so the
  // rungs after it open at the same try they did before it joined the ladder.
  const standing = shown.filter((hint) => hint.standing);
  const ladder = shown.filter((hint) => !hint.standing);
  // The fallbacks stay when the solver's rung is the only other one: it is a
  // standing extra, not a replacement for them.
  if (!ladder.length) ladder.push(...fallbackHints(question).map((value) => ({ text: value, source: 'generic' })));
  return [...standing, ...ladder.slice(0, MAX_HINTS)];
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
 *
 * One rung on request, then one more per try. A STANDING rung (TOOL-5: the
 * step solver's strategic hint, first in the ladder) is open from the start
 * and adds its own place, so it never holds back a rung after it: the k-th
 * other rung still opens after try k − 1.
 */
export const hintRelease = ({ hints = [], revealed = 0, attemptCount = 0, hintsAllowed = true, closed = false } = {}) => {
  if (!hintsAllowed || closed || !hints.length) return { allowed: false, available: 0, canRevealNext: false };
  const standing = hints.filter((hint) => hint?.standing === true).length;
  const unlocked = Math.min(hints.length, standing + 1 + Math.max(0, Number(attemptCount) || 0));
  return {
    allowed: true,
    available: unlocked,
    canRevealNext: revealed < unlocked,
    waitingForAttempt: revealed >= unlocked && revealed < hints.length,
  };
};
