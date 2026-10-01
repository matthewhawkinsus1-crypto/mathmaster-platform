/*
 * DOL VS INSTRUCTIONAL WORK — THE NUMBERS, SIDE BY SIDE.
 *
 * Warm-Up, Classwork, Practice, DOL and assessment items are pooled over the
 * selection (each question counted once — never an average of percentages,
 * which would invent a weighting) and compared:
 *
 *   final accuracy          mean credit of the attempted items
 *   first-attempt accuracy  share correct on the first attempt
 *
 * Standard (grade-level) and Modified work are compared separately, always.
 * A difference is "substantial" by one fixed rule — at least
 * SUBSTANTIAL_DIFFERENCE_POINTS percentage points, with at least
 * MIN_ATTEMPTED_FOR_COMPARISON attempted items on each side — and is printed as
 * two numbers. Why the numbers differ is not something the records show, and
 * this module never says.
 */
import { QUESTION_OUTCOME } from './attemptAnalysis.js';
import { accuracyOf, sectionGroupOf } from './skillAnalysis.js';

export const SUBSTANTIAL_DIFFERENCE_POINTS = 15;
export const MIN_ATTEMPTED_FOR_COMPARISON = 3;
export const MIN_ATTEMPTED_PER_ASSIGNMENT = 2;

export const SECTION_KEYS = Object.freeze(['warmup', 'classwork', 'practice', 'dol', 'assessment']);
export const SECTION_LABEL = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  instructional: 'Classwork + Practice',
  dol: 'DOL',
  assessment: 'Quiz / Test',
});

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const UNSCORED = new Set([QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED]);

const keyOf = (row) => {
  const group = sectionGroupOf(row.section);
  if (group === 'assessment') return 'assessment';
  return clean(row.section).toLowerCase();
};

const calculatorRecorded = (row) => list(row.attempts).some((attempt) => attempt?.calculatorUsed === true)
  || list(row.lastAttemptSupports).includes('Calculator');

const sectionFigures = (rows, key) => {
  const accuracy = accuracyOf(rows);
  const scored = rows.filter((row) => !UNSCORED.has(row.outcome));
  return {
    key,
    label: SECTION_LABEL[key] || key,
    ...accuracy,
    calculatorRecordedQuestions: scored.filter(calculatorRecorded).length,
    assignmentIds: [...new Set(rows.map((row) => row.assignmentId))],
  };
};

const sectionsFor = (rows) => SECTION_KEYS
  .map((key) => sectionFigures(rows.filter((row) => keyOf(row) === key), key))
  .filter((entry) => entry.questions > 0);

const PAIRS = Object.freeze([
  ['instructional', 'dol'],
  ['classwork', 'dol'],
  ['practice', 'dol'],
  ['warmup', 'dol'],
  ['instructional', 'assessment'],
]);

const figuresFor = (rows, key) => (key === 'instructional'
  ? sectionFigures(rows.filter((row) => ['classwork', 'practice'].includes(keyOf(row))), 'instructional')
  : sectionFigures(rows.filter((row) => keyOf(row) === key), key));

const comparePair = (rows, from, to, condition) => {
  const a = figuresFor(rows, from);
  const b = figuresFor(rows, to);
  if (!a.attempted || !b.attempted) return null;
  const difference = a.finalCreditAverage - b.finalCreditAverage;
  return {
    from,
    to,
    condition,
    fromLabel: SECTION_LABEL[from],
    toLabel: SECTION_LABEL[to],
    fromValue: a.finalCreditAverage,
    toValue: b.finalCreditAverage,
    fromAttempted: a.attempted,
    toAttempted: b.attempted,
    fromFirstAttempt: a.firstAttemptAccuracy,
    toFirstAttempt: b.firstAttemptAccuracy,
    difference,
    substantial: a.attempted >= MIN_ATTEMPTED_FOR_COMPARISON
      && b.attempted >= MIN_ATTEMPTED_FOR_COMPARISON
      && Math.abs(difference) >= SUBSTANTIAL_DIFFERENCE_POINTS,
  };
};

/**
 * `questions`: rows from attemptAnalysis, each with its assignment's
 * `condition` ('standard' | 'modified'). `assignmentRows`: the case's
 * assignment rows (for assessment grades such as a Test Cycle's recorded
 * grade, which has no question rows here).
 */
export const compareSections = ({ questions = [], assignmentRows = [] } = {}) => {
  const rows = list(questions);
  const standard = rows.filter((row) => row.condition !== 'modified');
  const modified = rows.filter((row) => row.condition === 'modified');

  const comparisons = [
    ...PAIRS.map(([from, to]) => comparePair(standard, from, to, 'standard')),
    ...PAIRS.map(([from, to]) => comparePair(modified, from, to, 'modified')),
  ].filter(Boolean);

  // Per assignment: DOL against the same lesson's Classwork + Practice.
  const byAssignment = new Map();
  rows.forEach((row) => {
    if (!byAssignment.has(row.assignmentId)) byAssignment.set(row.assignmentId, []);
    byAssignment.get(row.assignmentId).push(row);
  });
  const titleOf = (id) => clean(list(assignmentRows).find((entry) => entry.assignmentId === id)?.title) || id;
  const conditionOf = (id) => list(assignmentRows).find((entry) => entry.assignmentId === id)?.condition?.value || 'standard';
  const assignmentsWithDolGap = [...byAssignment.entries()].map(([assignmentId, assignmentQuestions]) => {
    const instructional = figuresFor(assignmentQuestions, 'instructional');
    const dol = figuresFor(assignmentQuestions, 'dol');
    if (instructional.attempted < MIN_ATTEMPTED_PER_ASSIGNMENT || dol.attempted < MIN_ATTEMPTED_PER_ASSIGNMENT) return null;
    const difference = instructional.finalCreditAverage - dol.finalCreditAverage;
    if (difference < SUBSTANTIAL_DIFFERENCE_POINTS) return null;
    return {
      assignmentId,
      title: titleOf(assignmentId),
      condition: conditionOf(assignmentId),
      instructional: instructional.finalCreditAverage,
      instructionalAttempted: instructional.attempted,
      dol: dol.finalCreditAverage,
      dolAttempted: dol.attempted,
      difference,
    };
  }).filter(Boolean).sort((a, b) => b.difference - a.difference);

  // Per standard (grade-level work): DOL against instruction on the same TEKS.
  const byCode = new Map();
  standard.forEach((row) => {
    list(row?.standards?.primary).forEach((code) => {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(row);
    });
  });
  const standardsWithDolGap = [...byCode.entries()].map(([code, codeRows]) => {
    const instructional = figuresFor(codeRows, 'instructional');
    const dol = figuresFor(codeRows, 'dol');
    if (instructional.attempted < MIN_ATTEMPTED_FOR_COMPARISON || dol.attempted < MIN_ATTEMPTED_PER_ASSIGNMENT) return null;
    const difference = instructional.finalCreditAverage - dol.finalCreditAverage;
    if (difference < SUBSTANTIAL_DIFFERENCE_POINTS) return null;
    return { code, instructional: instructional.finalCreditAverage, instructionalAttempted: instructional.attempted, dol: dol.finalCreditAverage, dolAttempted: dol.attempted, difference };
  }).filter(Boolean).sort((a, b) => b.difference - a.difference);

  const assessments = list(assignmentRows)
    .filter((entry) => entry.isAssessment && Number.isFinite(entry.score))
    .map((entry) => ({ assignmentId: entry.assignmentId, title: clean(entry.title), score: entry.score, condition: entry.condition?.value || 'standard', status: entry.status || null }));

  return {
    byCondition: { standard: sectionsFor(standard), modified: sectionsFor(modified) },
    comparisons,
    assignmentsWithDolGap,
    standardsWithDolGap,
    assessments,
    rule: {
      substantialDifferencePoints: SUBSTANTIAL_DIFFERENCE_POINTS,
      minAttempted: MIN_ATTEMPTED_FOR_COMPARISON,
      minAttemptedPerAssignment: MIN_ATTEMPTED_PER_ASSIGNMENT,
    },
    note: 'Each question is counted once. Standard and Modified work are compared separately. Differences are shown as numbers; MathMaster does not determine why they differ.',
  };
};

/** The comparison as plain lines, in the brief's form ("DOL accuracy: 46%."). */
export const describeSectionComparison = (comparison) => {
  const lines = [];
  const add = (sections, suffix) => {
    list(sections).forEach((entry) => {
      if (!entry.attempted) return;
      const label = entry.key === 'dol' ? 'DOL accuracy' : `${entry.label} final accuracy`;
      lines.push(`${label}${suffix}: ${entry.finalCreditAverage}%.`);
    });
  };
  add(comparison?.byCondition?.standard, '');
  add(comparison?.byCondition?.modified, ' (Modified work)');
  list(comparison?.comparisons).filter((entry) => entry.substantial).forEach((entry) => {
    const direction = entry.difference > 0 ? 'above' : 'below';
    lines.push(`${entry.fromLabel} final accuracy (${entry.fromValue}%) is ${Math.abs(entry.difference)} points ${direction} ${entry.toLabel} accuracy (${entry.toValue}%)${entry.condition === 'modified' ? ' in Modified work' : ''}.`);
  });
  return lines;
};

export default compareSections;
