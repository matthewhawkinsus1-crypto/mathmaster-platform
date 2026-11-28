/*
 * WHAT HELP A STUDENT HAS HAD ON ONE QUESTION — AND WHAT THAT MAKES THE NEXT
 * ATTEMPT.
 *
 *   attemptSupportUsageFrom(state)        → the supportUsage an attempt records
 *   restoredSupportUse({ draftKey, record, storage }) → the help already had
 *   rememberSupportUse(draftKey, use, storage)        → keep it across a remount
 *
 * Help on a question is sticky for that version of it: once a hint is
 * revealed, every later attempt on it is a supported attempt. That used to
 * live only in QuestionEngine state, so leaving the question and coming back
 * (App remounts it per question index) forgot it, and the next attempt was
 * recorded as an independent retry (PR #462 review B2). It is now kept per
 * draft key — which names the student, assignment, question and VARIANT, so
 * a replacement problem starts clean — and merged with what the record's last
 * attempt already says, so another device cannot forget it either.
 *
 * Memory only grows: booleans OR, the hint count takes the larger. Writing an
 * empty state never erases help already had.
 *
 * AN EXAMPLE THAT OPENED BY ITSELF IS NOT HELP ASKED FOR. On Classwork the
 * platform opens a worked example before the first question on a new skill.
 * That is recorded as `workedExampleShown: 'auto'`, apart from
 * `workedExampleUsed` (an example the student asked for, or reopened), and
 * leaves the attempt independent: nobody chose it.
 *
 * WHAT COUNTS AS HELP WITH THE MATHEMATICS (isMathematicallyIndependent):
 *   a hint, a worked example, a back-up step written for THIS problem
 *   (authored or from its question family — it names the first move), and a
 *   specific miss message shown after an earlier attempt (feedback-assisted).
 * What does not: the platform's generic back-up step ("what must you do to the
 * other side?"), true of every problem of the type; a context scaffold; the
 * calculator; asking the teacher.
 */

// `workedExampleShown`: Classwork opened an example by itself before a new
// skill (examplePlayer.js). Remembered so it opens once; it is NOT help the
// student asked for, and never makes an attempt a supported one.
// `spotTheMistakeUsed`: the student answered "Spot the mistake" after an
// example (WE-F; spotTheMistake.js). A fact for the teacher, the way
// `workedExampleUsed` is one: never a grade, never whether the choice was
// right, and it leaves independence to the example's own flags.
const FLAGS = Object.freeze(['hintUsed', 'workedExampleUsed', 'workedExampleShown', 'spotTheMistakeUsed', 'backUpStepUsed', 'scaffoldUsed', 'feedbackAssisted']);

/** What an attempt records for an example that opened by itself. */
export const WORKED_EXAMPLE_SHOWN_AUTO = 'auto';

const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);

export const emptySupportUse = () => ({
  hintUsed: false,
  hintsRevealed: 0,
  workedExampleUsed: false,
  workedExampleShown: false,
  spotTheMistakeUsed: false,
  backUpStepUsed: false,
  scaffoldUsed: false,
  feedbackAssisted: false,
});

export const mergeSupportUse = (...uses) => uses.reduce((merged, use) => {
  if (!use || typeof use !== 'object') return merged;
  const next = { ...merged };
  FLAGS.forEach((flag) => { next[flag] = Boolean(merged[flag] || use[flag] === true); });
  next.hintsRevealed = Math.max(merged.hintsRevealed, count(use.hintsRevealed));
  if (next.hintsRevealed > 0) next.hintUsed = true;
  return next;
}, emptySupportUse());

/** What the record's last attempt on this version already says. */
export const supportUseFromRecord = (record = {}) => {
  // A replacement version resets the attempt count but keeps the old
  // version's supportUsage: only a version with attempts speaks for itself.
  if (!(Number(record?.attemptCount) > 0)) return emptySupportUse();
  const usage = record?.supportUsage;
  if (!usage || typeof usage !== 'object') return emptySupportUse();
  return mergeSupportUse({
    hintUsed: usage.hintUsed === true,
    workedExampleUsed: usage.workedExampleUsed === true,
    workedExampleShown: usage.workedExampleShown === WORKED_EXAMPLE_SHOWN_AUTO,
    spotTheMistakeUsed: usage.spotTheMistakeUsed === true,
    backUpStepUsed: usage.backUpStepUsed === true,
    scaffoldUsed: usage.scaffoldUsed === true,
    feedbackAssisted: usage.feedbackAssisted === true,
  });
};

export const supportUseStorageKey = (draftKey) => (draftKey ? `mathmaster:support-use:${draftKey}` : null);

const defaultStorage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

export const readSupportUse = (draftKey, storage = defaultStorage()) => {
  const key = supportUseStorageKey(draftKey);
  if (!key || !storage) return emptySupportUse();
  try {
    return mergeSupportUse(JSON.parse(storage.getItem(key) || 'null'));
  } catch {
    return emptySupportUse();
  }
};

export const rememberSupportUse = (draftKey, use, storage = defaultStorage()) => {
  const key = supportUseStorageKey(draftKey);
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify(mergeSupportUse(readSupportUse(draftKey, storage), use)));
  } catch { /* storage full or blocked: the record still carries the last attempt's help */ }
};

export const restoredSupportUse = ({ draftKey = null, record = null, storage = defaultStorage() } = {}) => (
  mergeSupportUse(readSupportUse(draftKey, storage), supportUseFromRecord(record))
);

/** The supportUsage one attempt records. */
export const attemptSupportUsageFrom = ({
  supportUsage = {},
  hintUsed = false,
  workedExampleUsed = false,
  // Classwork opened an example by itself: recorded apart, as a fact for the
  // teacher. Only one the student asked for (workedExampleUsed) is help.
  workedExampleShown = false,
  // "Spot the mistake" answered (WE-F): a fact, kept only when true, so an
  // attempt without it records exactly what it did before.
  spotTheMistakeUsed = false,
  // A reference card was pinned beside the question (WE-H; ReferenceCards.jsx):
  // a fact, kept only when true. It is on the screen without being asked for,
  // so it is never help asked for and leaves independence as it was.
  referenceCardShown = false,
  backUpStepDone = false,
  backUpStepSource = 'platform',
  scaffoldUsed = false,
  feedbackAssisted = false,
  contextScaffoldUsed = false,
  calculatorUsed = false,
} = {}) => {
  // A back-up step written for this problem names its first move: help.
  const problemSpecificStep = Boolean(scaffoldUsed) || (Boolean(backUpStepDone) && backUpStepSource !== 'platform');
  return {
    ...supportUsage,
    hintUsed: Boolean(hintUsed),
    scaffoldUsed: problemSpecificStep,
    backUpStepUsed: Boolean(backUpStepDone),
    contextScaffoldUsed: Boolean(contextScaffoldUsed),
    workedExampleUsed: Boolean(workedExampleUsed),
    ...(workedExampleShown ? { workedExampleShown: WORKED_EXAMPLE_SHOWN_AUTO } : {}),
    ...(spotTheMistakeUsed ? { spotTheMistakeUsed: true } : {}),
    ...(referenceCardShown ? { referenceCardShown: true } : {}),
    feedbackAssisted: Boolean(feedbackAssisted),
    calculatorUsed: Boolean(calculatorUsed),
    // The host's own "not independent" (a teacher's help, a modification) stands.
    isMathematicallyIndependent: supportUsage?.isMathematicallyIndependent !== false
      && !hintUsed && !workedExampleUsed && !problemSpecificStep && !feedbackAssisted,
  };
};
