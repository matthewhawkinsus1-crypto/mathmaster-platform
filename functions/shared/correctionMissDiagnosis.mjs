/*
 * WHY A CORRECTIONS ANSWER WAS PROBABLY MISSED — FOR THE STUDENT'S SCREEN ONLY.
 *
 *   diagnoseCorrectionMiss({ privateGrading, grading, raw }) → { source, code, message } | null
 *
 * QA pass 3, HELP-13: a Test Cycle Corrections miss answered "Not yet. Look
 * again at what the question is asking you to find…" whatever the student did.
 * Corrections items are Path items (an issued family instance with a
 * server-held `privateGrading`), graded by the Path tool contracts
 * (pathToolContracts.mjs) — a shape the platform classifiers
 * (misconceptionClassifiers.mjs), which read assignment questions, never see.
 * This reads the SAME definition the grader just used and names a canonical
 * registry code only where the work pins one down:
 *
 *   system              the typed point is the solution with x and y exchanged
 *                       (x ≠ y) → ordered-pair-reversed
 *   intervalNumberLine  the graph has the key's endpoints with an endpoint
 *                       included or excluded wrongly, or is the key's ray
 *                       pointing the other way — the classifier's own rule
 *                       (`intervalMistake`) → endpoint-inclusion-error /
 *                       inequality-direction-reversed
 *
 * Anything else says nothing, and the attempt keeps its authored feedback.
 *
 * THE MESSAGE IS FIXED TEXT. It comes from misconceptionStudentMessages.mjs,
 * where no value from the item can reach it: it names the error as a thing to
 * check and never states the answer. A choice part (the system's
 * classification) is never read.
 *
 * NEVER A GRADE, NEVER EVIDENCE. The attempt is graded and recorded before
 * this runs; nothing returned here is stored or read by the grade. Anything
 * that throws is null.
 */
import { intervalMistake } from './misconceptionClassifiers.mjs';
import { studentMisconceptionMessage } from './misconceptionStudentMessages.mjs';
import { normalizePathIntervals } from './pathToolContracts.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/−/g, '-');
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

/** (x, y) from [x, y], {x, y} or "(x, y)"; null otherwise. */
export const correctionPair = (value) => {
  let pair = null;
  if (Array.isArray(value) && value.length === 2) pair = value;
  else if (isObject(value) && 'x' in value && 'y' in value) pair = [value.x, value.y];
  else if (typeof value === 'string') {
    const parts = text(value).replace(/^[([]\s*/, '').replace(/\s*[)\]]$/, '').split(',');
    if (parts.length === 2) pair = parts;
  }
  if (!pair) return null;
  const [x, y] = pair.map(toNumber);
  return x === null || y === null ? null : [x, y];
};

const wrongPart = (grading, id) => list(grading?.parts).some((part) => text(part?.id) === id && part?.isCorrect !== true);

const DETECTORS = {
  system: ({ definition, grading, raw }) => {
    if (!wrongPart(grading, 'solution')) return null;
    const expected = correctionPair(definition?.solution);
    const given = toNumber(raw?.x) !== null && toNumber(raw?.y) !== null
      ? [toNumber(raw.x), toNumber(raw.y)]
      : correctionPair(raw?.value);
    if (!expected || !given) return null;
    const tolerance = Math.max(1e-9, Number(definition?.tolerance) || 1e-6);
    const close = (a, b) => Math.abs(a - b) <= tolerance;
    const [x0, y0] = expected;
    // With x = y the exchanged pair is the answer, which the grader marked
    // right, so the 'solution' part check above already rules it out.
    return close(given[0], y0) && close(given[1], x0) ? 'ordered-pair-reversed' : null;
  },
  intervalNumberLine: ({ definition, grading, raw }) => {
    if (!wrongPart(grading, 'graph') || !Array.isArray(raw?.intervals)) return null;
    const expected = normalizePathIntervals(definition?.intervals);
    const built = normalizePathIntervals(raw.intervals.filter(isObject));
    if (!expected.length || built.length !== raw.intervals.length) return null;
    return intervalMistake(built, expected);
  },
};

export const CORRECTION_MISS_DIAGNOSIS_TOOLS = Object.freeze(Object.keys(DETECTORS));

export const diagnoseCorrectionMiss = ({ privateGrading = null, grading = null, raw = null } = {}) => {
  try {
    if (!grading || grading.isCorrect === true || grading.rejected === true) return null;
    const detector = DETECTORS[text(privateGrading?.pathToolId)];
    if (!detector || !isObject(raw)) return null;
    const code = detector({ definition: privateGrading.definition || {}, grading, raw });
    const message = code ? studentMisconceptionMessage(code) : null;
    return message ? { source: 'classifier', code, message } : null;
  } catch {
    return null;
  }
};

export default diagnoseCorrectionMiss;
