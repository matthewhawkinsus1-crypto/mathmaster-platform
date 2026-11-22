/*
 * SHOW THE STEP: THE SHAPE OF A CHECKPOINT (SP-4). Import-free, so the answer
 * boxes can ask "does this part have a step?" without loading any tool's
 * engine. The engine itself is checkpointEngine.js, loaded with the step.
 */
export const CHECKPOINT_KIND = Object.freeze({
  PICK_POINTS: 'pickPoints',
  STEP_MOVES: 'stepMoves',
  FACTOR_PAIR: 'factorPair',
  TABLE_ROW: 'tableRow',
});

const KINDS = Object.freeze(Object.values(CHECKPOINT_KIND));
const KINDS_WITH_COUNT = Object.freeze([CHECKPOINT_KIND.PICK_POINTS, CHECKPOINT_KIND.TABLE_ROW]);
const DEFAULT_COUNT = Object.freeze({ [CHECKPOINT_KIND.PICK_POINTS]: 2, [CHECKPOINT_KIND.TABLE_ROW]: 1 });

// How much of a student's work is kept: enough for any step an author can
// ask for, and small enough to store beside every attempt.
export const CHECKPOINT_LIMITS = Object.freeze({
  count: 6,
  points: 6,
  rows: 6,
  steps: 40,
  sideLength: 240,
  descriptionLength: 160,
  numberLength: 16,
  // One answer box's worth of text (typedEntryGuard.mjs MAX_TYPED_ANSWER_LENGTH;
  // functions/shared/showTheStepFields.mjs MAX_STEP_LINE_LENGTH).
  workLength: 240,
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * A part's checkpoint as { kind, count, of }, or null when it has none (or
 * one that is not a checkpoint: the compiler refuses those).
 */
export const checkpointOf = (part) => {
  const value = part?.checkpoint;
  if (!isObject(value) || !KINDS.includes(value.kind)) return null;
  const counted = KINDS_WITH_COUNT.includes(value.kind);
  const count = counted
    ? Math.min(CHECKPOINT_LIMITS.count, Number.isInteger(value.count) && value.count >= 1 ? value.count : DEFAULT_COUNT[value.kind])
    : null;
  return { kind: value.kind, count, of: typeof value.of === 'string' ? value.of.trim() : '' };
};

export const hasCheckpoint = (parts) => Array.isArray(parts) && parts.some((part) => checkpointOf(part) !== null);

// Where a part's step is kept among the question's answers: beside the part's
// own answer, under a name no part id can take (`slope::step`). How the line
// is written and read is checkpointLine.js, loaded with the step.
// The name is the one the submitted response carries the step under
// (functions/shared/showTheStepFields.mjs stepFieldId; a test holds the two
// together). Written out here so the answer boxes load nothing for it.
export const checkpointWorkKey = (partId) => `${partId}::step`;
