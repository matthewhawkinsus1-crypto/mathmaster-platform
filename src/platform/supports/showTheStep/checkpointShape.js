/*
 * SHOW THE STEP: THE SHAPE OF A CHECKPOINT (SP-4). Light, so the answer
 * boxes can ask "does this part have a step?" without loading any tool's
 * engine. The engine itself is checkpointEngine.js, loaded with the step.
 */
import { MAX_STEP_LINE_LENGTH, isStepFieldId, partIdOfStepField, stepFieldId } from '../../../../functions/shared/showTheStepFields.mjs';

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
  workLength: MAX_STEP_LINE_LENGTH,
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

/*
 * WHERE A STEP IS KEPT, AND HOW IT IS WRITTEN.
 *
 * The student's step is kept beside the part's own answer, under a name no
 * part id can take (`slope::step`), as one short line of text a teacher can
 * read as it stands:
 *
 *   pickPoints  (0, -2) (2, 4); rise 6; run 2
 *   stepMoves   4x + 7 = x - 8 ; 3x + 7 = -8 ; 3x = -15 ; x = -5
 *   factorPair  2 and 3
 *   tableRow    (1, 3) (2, 5)
 *   (any)       skipped; (0, -2) (2, 5); rise 1; run 9
 *
 * Text, because that is what an answer box's value is everywhere it travels:
 * the draft, Undo, the submitted response and the teacher's view of it carry
 * the line with no change to any of them, and no grader reads a name it does
 * not author. It holds the work only, never a verdict; the engine reads it
 * again wherever it is shown (checkpointEngine.js).
 */
export { stepFieldId as checkpointWorkKey, isStepFieldId as isCheckpointWorkKey, partIdOfStepField as partIdOfWorkKey };

// Left out of a run of moves too long for one line: the first line and the
// last ones are kept, and this stands for the lines between.
export const OMITTED_LINES = '...';

const entry = (value) => String(value ?? '').replace(/[;()]/g, '').trim().slice(0, CHECKPOINT_LIMITS.numberLength);
const pairText = ([a, b]) => `(${entry(a)}, ${entry(b)})`;
const equationText = (equation) => `${String(equation?.left ?? '').trim()} = ${String(equation?.right ?? '').trim()}`;

// A step the student chose to answer without (offered on Classwork and
// Practice after the engine has refused it twice): the line starts with this
// word, then whatever work they had done.
export const SKIPPED_STEP = 'skipped';

/** The step's line of text for the student's work, or '' when there is none. */
export const writeCheckpointWork = (kind, work) => {
  if (!isObject(work)) return '';
  if (work.skipped === true) {
    const done = writeWork(kind, work);
    return done ? `${SKIPPED_STEP}; ${done}`.slice(0, CHECKPOINT_LIMITS.workLength) : SKIPPED_STEP;
  }
  return writeWork(kind, work);
};

const writeWork = (kind, work) => {
  if (kind === CHECKPOINT_KIND.PICK_POINTS) {
    const points = (Array.isArray(work.points) ? work.points : []).slice(0, CHECKPOINT_LIMITS.points).map(pairText);
    const [rise, run] = [entry(work.rise), entry(work.run)];
    if (!points.length && !rise && !run) return '';
    return [points.join(' '), ...(rise || run ? [`rise ${rise}`, `run ${run}`] : [])].join('; ');
  }
  if (kind === CHECKPOINT_KIND.FACTOR_PAIR) {
    const pair = (Array.isArray(work.pair) ? work.pair : []).slice(0, 2).map(entry);
    return pair.some(Boolean) ? `${pair[0] || ''} and ${pair[1] || ''}` : '';
  }
  if (kind === CHECKPOINT_KIND.TABLE_ROW) {
    const rows = (Array.isArray(work.rows) ? work.rows : []).slice(0, CHECKPOINT_LIMITS.rows).map((row) => (Array.isArray(row) ? row : ['', '']));
    return rows.some((row) => row.some((value) => entry(value))) ? rows.map(pairText).join(' ') : '';
  }
  if (kind === CHECKPOINT_KIND.STEP_MOVES) {
    const lines = (Array.isArray(work.lines) ? work.lines : []).map(equationText).filter((line) => line.length > 3 && !line.includes(';'));
    if (lines.length < 2) return '';
    const whole = lines.join(' ; ');
    if (whole.length <= CHECKPOINT_LIMITS.workLength) return whole;
    // Too long for one line: the equation it opened on, then as many of the
    // last lines as fit.
    const kept = [];
    let length = lines[0].length + OMITTED_LINES.length + 6;
    for (let index = lines.length - 1; index > 0; index -= 1) {
      if (length + lines[index].length + 3 > CHECKPOINT_LIMITS.workLength) break;
      kept.unshift(lines[index]);
      length += lines[index].length + 3;
    }
    return kept.length ? [lines[0], OMITTED_LINES, ...kept].join(' ; ') : '';
  }
  return '';
};

const PAIR = /\(([^,()]*),([^()]*)\)/g;
const pairsIn = (text) => [...text.matchAll(PAIR)].map((match) => [match[1].trim(), match[2].trim()]);
const sidesOf = (line) => {
  const at = line.indexOf('=');
  if (at < 1) return null;
  const [left, right] = [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  return left && right && !right.includes('=') ? { left, right } : null;
};

/** The student's work read back from a step's line of text, or null. */
export const readCheckpointWork = (kind, value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > CHECKPOINT_LIMITS.workLength + 1) return null;
  const line = value.trim();
  if (line === SKIPPED_STEP || line.startsWith(`${SKIPPED_STEP};`)) {
    return { ...(readWork(kind, line.slice(SKIPPED_STEP.length + 1)) || {}), skipped: true };
  }
  return readWork(kind, line);
};

const readWork = (kind, value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (kind === CHECKPOINT_KIND.PICK_POINTS) {
    const [pointsText = '', ...rest] = text.split(';');
    const named = (name) => (rest.map((piece) => piece.trim()).find((piece) => piece.startsWith(`${name} `) || piece === name) || '').slice(name.length).trim();
    const points = pairsIn(pointsText).map((pair) => pair.map(Number)).filter((pair) => pair.every(Number.isFinite));
    return { points, rise: named('rise'), run: named('run') };
  }
  if (kind === CHECKPOINT_KIND.FACTOR_PAIR) {
    const match = /^(.*?)\s*\band\b\s*(.*)$/.exec(text);
    return { pair: match ? [match[1].trim(), match[2].trim()] : [text, ''] };
  }
  if (kind === CHECKPOINT_KIND.TABLE_ROW) return { rows: pairsIn(text) };
  if (kind === CHECKPOINT_KIND.STEP_MOVES) {
    const pieces = text.split(';').map((piece) => piece.trim()).filter(Boolean);
    const omitted = pieces.includes(OMITTED_LINES);
    const lines = pieces.filter((piece) => piece !== OMITTED_LINES).map(sidesOf);
    return lines.length && lines.every(Boolean) ? { lines, omitted } : null;
  }
  return null;
};
