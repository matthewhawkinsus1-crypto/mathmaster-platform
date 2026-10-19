/*
 * TARGETED RECOVERY PRACTICE: PRACTISE THE ERROR THE STUDENT ACTUALLY MADE.
 *
 * A student's stored, server-trusted misconception codes for one assignment
 * section (functions/shared/misconceptionCodes.mjs trustedMisconceptionFindings,
 * read from their attempt evidence events and their earlier Recovery /
 * Recovery Practice evidence records) steer two choices in Recovery Practice
 * (sectionRecoveryPlan.mjs buildRecoveryPracticeItem), and nothing else:
 *
 *   1. ORDER. The questions the student made a diagnosed error on come first
 *      in the Practice rotation. Every other ready question still follows in
 *      the same cycle, so the mastery gate's coverage is unchanged.
 *   2. WHICH VERSION. Within a question family whose server classifier models
 *      that error, the Practice item is the first unseen version (among a few
 *      allocations from the student's own seat) in which that error is
 *      VISIBLE: the wrong strategy gives an answer that differs from the right
 *      one and from every other modelled strategy. A slope question whose
 *      rise equals its run cannot show "run over rise"; a vertex at h = 0
 *      cannot show a sign error on h. When no such version is found, the
 *      untargeted version is dealt, exactly as before.
 *
 * What it never does:
 *   - It never deals a copy of the missed question. Every candidate goes
 *     through the same unseen-fingerprint walk as any Practice item, against
 *     the student's whole history (original deliveries, Practice, Recovery).
 *   - It never changes who may recover, how an item is graded, the pin a
 *     server accepts (practicePinIsOwn accepts any variant of the student's
 *     own seat), the mastery gate, or the Recovery assessment.
 *   - It never trusts a browser: only evidence that passes the one trust gate
 *     counts, and only the server reads it. The student is not shown a code.
 *
 * Pure: no Firestore, no clock. Light enough for the student bundle (no
 * classifier or grader is imported).
 */
import { isMisconceptionCode, trustedMisconceptionFindings } from './misconceptionCodes.mjs';

const clean = (value) => String(value ?? '').trim();
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const EPSILON = 1e-9;
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const ratio = (numerator, denominator) => (finite(numerator) && finite(denominator) && denominator !== 0 ? numerator / denominator : null);

/** How many allocations from the student's own seat are tried for a visible version. */
export const TARGETED_PRACTICE_CANDIDATES = 8;
/** Codes kept per question (most recent first). */
const MAX_CODES_PER_QUESTION = 5;

const storageIndexOf = (record) => {
  const source = record?.source || {};
  const raw = source.storageIndex ?? source.questionIndex;
  const value = Number(raw);
  return raw !== null && raw !== undefined && Number.isInteger(value) && value >= 0 ? value : null;
};

/**
 * The student's trusted codes for this section, by storage index:
 * `{ [storageIndex]: [code, …] }`, most recent first. `records` are evidence
 * events (attempt evidence) and Recovery misconception evidence records, as
 * stored; anything that is not trusted evidence of this assignment, or of a
 * question outside this section, is ignored.
 */
export const recoveryMisconceptionFocus = ({ records = [], assignmentId = '', section = '', sectionStorageIndices = [] } = {}) => {
  const inSection = new Set((Array.isArray(sectionStorageIndices) ? sectionStorageIndices : []).map(Number));
  const wanted = clean(assignmentId);
  if (!wanted || !inSection.size) return {};
  const dated = (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record === 'object' && clean(record?.source?.assignmentId) === wanted)
    // A Recovery record names its section; one of the other section is not this one's.
    .filter((record) => !clean(record?.source?.section) || clean(record.source.section) === clean(section))
    .map((record) => ({ record, at: Number(record.occurredAt) || 0 }))
    .sort((a, b) => b.at - a.at);
  const focus = {};
  for (const { record } of dated) {
    const storageIndex = storageIndexOf(record);
    if (storageIndex === null || !inSection.has(storageIndex)) continue;
    for (const finding of trustedMisconceptionFindings(record.performance)) {
      const codes = focus[storageIndex] || (focus[storageIndex] = []);
      if (!codes.includes(finding.code) && codes.length < MAX_CODES_PER_QUESTION) codes.push(finding.code);
    }
  }
  return focus;
};

/** A focus as given to the planner: only real codes, only integer indices. */
export const normalizeMisconceptionFocus = (focus) => {
  if (!focus || typeof focus !== 'object' || Array.isArray(focus)) return {};
  return Object.fromEntries(Object.entries(focus)
    .filter(([index]) => Number.isInteger(Number(index)) && Number(index) >= 0)
    .map(([index, codes]) => [Number(index), [...new Set((Array.isArray(codes) ? codes : []).map(clean).filter(isMisconceptionCode))]])
    .filter(([, codes]) => codes.length));
};

/**
 * Ready slots in Practice order: those with a diagnosed error first (in their
 * original order), then the rest. The same slots, so the same coverage.
 */
export const orderSlotsForFocus = (slots = [], focus = {}) => {
  const list = Array.isArray(slots) ? slots : [];
  const focused = (slot) => Array.isArray(focus?.[slot?.storageIndex]) && focus[slot.storageIndex].length > 0;
  return [...list.filter(focused), ...list.filter((slot) => !focused(slot))];
};

/** `value` is visible as the error: a number, not the answer, not any other strategy's value. */
const distinctFrom = (value, correct, others = []) => finite(value)
  && !near(value, correct)
  && others.filter(finite).every((other) => !near(value, other));

/*
 * WHEN AN ERROR IS VISIBLE IN A VERSION, per platform family classifier
 * (misconceptionClassifiers.mjs FAMILY_CLASSIFIERS, same version keys and the
 * same generated values). Each predicate mirrors that classifier's own rule
 * for when the code can be recorded at all; a code a family's classifier does
 * not model has no predicate here, and only the ordering applies.
 */
const VISIBILITY = {
  'linear.slopeFromPoints@1': {
    'slope-run-over-rise': ({ rise, run }) => {
      const slope = ratio(rise, run);
      return slope !== null && distinctFrom(ratio(run, rise), slope, [slope === 0 ? null : -slope, ratio(-run, rise)]);
    },
    'slope-sign-reversed': ({ rise, run }) => {
      const slope = ratio(rise, run);
      return slope !== null && slope !== 0 && distinctFrom(-slope, slope, [ratio(run, rise), ratio(-run, rise)]);
    },
  },
  'functions.identifyIntercepts@1': {
    'intercepts-swapped': ({ p, q }) => finite(p) && finite(q) && p !== 0 && q !== 0 && !near(p, q),
    'ordered-pair-reversed': ({ p, q }) => finite(p) && finite(q) && p !== 0 && q !== 0 && !near(p, q),
  },
  'linear.twoStepEquation@1': {
    'inverse-operation-sign': ({ a, b, c, x }) => distinctFrom(ratio(c + b, a), x, [finite(c / a) ? c / a - b : null, -x, c - b]),
    'partial-division': ({ a, b, c, x }) => distinctFrom(finite(c / a) ? c / a - b : null, x, [ratio(c + b, a), -x, c - b]),
  },
  'linear.multiStepEquation@1': {
    'inverse-operation-sign': ({ a, b, cc, d, x }) => distinctFrom(ratio(d + b, a - cc), x, [-x]),
  },
  'systems.substitution@1': {
    'substitution-partial-distribution': ({ m, k, a, b, c }) => {
      const partialX = ratio(c - k, a + b * m);
      const x = ratio(c - b * k, a + b * m);
      return partialX !== null && x !== null && !near(partialX, x);
    },
  },
  'absoluteValue.solveEquation@1': {
    // −t is not a solution for some solution t: the solutions are not opposites.
    'absolute-value-negated-solution': ({ low, high }) => finite(low) && finite(high) && !near(low, -high) && !near(low, high),
    // Two different solutions, so one case alone is visibly incomplete.
    'absolute-value-one-case-only': ({ low, high }) => finite(low) && finite(high) && !near(low, high),
  },
  'quadratics.identifyVertex@1': {
    'vertex-x-sign-reversed': ({ h, k, a }) => finite(h) && finite(k) && finite(a) && h !== 0,
    'ordered-pair-reversed': ({ h, k }) => finite(h) && finite(k) && !near(h, k),
  },
  'functions.identifyZeros@1': {
    'zeros-sign-reversed': ({ low, high }) => finite(low) && finite(high) && !near(-low, high) && !(near(low, 0) && near(high, 0)),
  },
  'linear.multipleRepresentations@1': {
    'slope-run-over-rise': ({ n, d }) => finite(n) && finite(d) && n !== 0 && d !== 0 && !near(Math.abs(n), Math.abs(d)),
    'slope-sign-reversed': ({ n, d }) => finite(n) && finite(d) && n !== 0 && d !== 0 && !near(Math.abs(n), Math.abs(d)),
    'intercepts-swapped': ({ b, zero }) => finite(b) && finite(zero) && !near(b, zero) && b !== 0 && zero !== 0,
    'ordered-pair-reversed': ({ b, zero }) => finite(b) && finite(zero) && !near(b, zero) && b !== 0 && zero !== 0,
    'initial-value-from-later-reading': (values) => finite(values.readAmount) && finite(values.readTime) && finite(values.rate),
  },
};

/** Is there a visibility rule for this family version and any of these codes? */
export const familyTargetsCodes = (familyKey, codes = []) => {
  const rules = VISIBILITY[clean(familyKey)];
  return Boolean(rules) && (Array.isArray(codes) ? codes : []).some((code) => typeof rules[code] === 'function');
};

/**
 * Does this generated version make one of `codes` visible? `familyKey` is
 * `${familyId}@${familyVersion}`; `values` the instance's generated values.
 * Never throws: an unreadable version is simply not a target.
 */
export const instanceExposesMisconception = ({ familyKey, values, codes = [] } = {}) => {
  const rules = VISIBILITY[clean(familyKey)];
  if (!rules || !values || typeof values !== 'object') return false;
  return (Array.isArray(codes) ? codes : []).some((code) => {
    try {
      return typeof rules[code] === 'function' && rules[code](values) === true;
    } catch {
      return false;
    }
  });
};

export const TARGETED_FAMILY_KEYS = Object.freeze(Object.keys(VISIBILITY));
