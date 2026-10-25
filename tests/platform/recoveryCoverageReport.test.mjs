/*
 * RECOVERY COVERAGE, LESSON BY LESSON — PINNED (RC01).
 *
 * scripts/recovery-coverage-report.mjs runs the one Recovery planner
 * (recoveryContentPlan.mjs, with the server's full answer-key check) over
 * every lesson file in teacher-import-jsons/ and docs/assignments/. This
 * pins what it measures: for each lesson's Warm-Up and DOL, how many
 * questions have Recovery with nothing prepared (Question Family slots), how
 * many once Recovery is prepared (a certified family recognizes the static
 * question), how many there are, and the section's status once prepared.
 *
 * A change in which questions have Recovery — a new family, a lesson edited
 * so its family no longer recognizes it, a family that stops certifying — is
 * a reviewed change to this table, never a silent one. Update the table from
 * `node scripts/recovery-coverage-report.mjs` and say why in the commit.
 *
 * The counts are of the lesson FILES, not of the live copies in Firestore
 * (which a teacher may have edited, turned Recovery off for, or prepared).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  lessonAssignmentForCoverage,
  measureLessonRecovery,
  measureRecoveryCoverage,
  renderRecoveryCoverageText,
} from '../../scripts/recovery-coverage-report.mjs';
import { recoveryCandidateFamilies } from '../../functions/shared/recoveryContentPlan.mjs';

// "now/prepared/questions status" for the Warm-Up, then the DOL. Measured on
// 2026-10-25 with intervals.graphAndWrite (RC01) registered.
const PINNED = Object.freeze({
  'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json': ['2/2/2 ready', '1/1/1 ready'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/algebra1-linear-multiple-representations-final-v5.json': ['0/0/2 unavailable', '0/0/1 unavailable'],
  'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json': ['0/0/4 unavailable', '0/0/8 unavailable'],
  'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review_Honors.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json': ['4/4/4 ready', '7/7/7 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json': ['0/0/3 unavailable', '0/0/2 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json': ['0/3/3 ready', '0/1/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json': ['0/1/3 ready', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json': ['0/0/3 unavailable', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json': ['0/0/3 unavailable', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json': ['0/0/3 unavailable', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json': ['0/0/3 unavailable', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/1_Factoring_Polynomials_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/2_Remainder_and_Factor_Theorems_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/1_Factoring_Polynomials.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/3_Radical_Expressions.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/4_Rational_Exponents.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/5_Solving_Radical_Equations.json': ['3/3/3 ready', '2/2/2 ready'],
});

const TOTALS = Object.freeze({
  warmup: { questions: 111, now: 60, prepared: 82, lessonsWithSection: 38, lessonsReady: 28 },
  dol: { questions: 102, now: 49, prepared: 68, lessonsWithSection: 38, lessonsReady: 26 },
});

// What is left: [shape, questions, lessons], most first. A typed-and-chosen
// board (multiAnswer) holds a different hand-written task in each question.
const WITHOUT_RECOVERY_BY_SHAPE = Object.freeze([
  ['multiAnswer', 31, 9],
  ['graphAnalysis · domain + range', 3, 3],
  ['systemsWorkspace/spatial', 3, 3],
  ['functionCharacteristics · domain + range', 3, 1],
  ['systemsWorkspace/algebraic', 3, 1],
  ['relationMapping · mapping + domain + range + isFunction', 2, 2],
  ['figureMatch', 2, 1],
  ['relationMapping · mapping + isFunction', 2, 1],
  ['representationMatch/linearConnections', 2, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + yInterceptExists + yIntercept + yInterceptValue + asymptote + behavior', 1, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + zeros + yInterceptExists + yIntercept + yInterceptValue + behavior', 1, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + zeros + yInterceptExists + yIntercept + yInterceptValue + extremeKind + extremePoint + extremeValue + axisOfSymmetry + behavior', 1, 1],
  ['graphAnalysis · domain + range + decreasing', 1, 1],
  ['graphAnalysis · increasing + decreasing', 1, 1],
  ['graphAnalysis · increasing + decreasing + positive + negative', 1, 1],
  ['graphChoicePreview', 1, 1],
  ['relationMapping · mapping + domain + range', 1, 1],
  ['representationBridge/linearMultipleRepresentations', 1, 1],
  ['transformationsLab/identify', 1, 1],
  ['transformationsLab/match', 1, 1],
  ['transformationsLab/pointMap', 1, 1],
]);

const DAY_ONE = 'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json';
const DAY_TWO = 'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json';

const REPORT = measureRecoveryCoverage();
const row = (section) => `${section.now}/${section.prepared}/${section.questions} ${section.status}`;
const rowsOf = (report) => Object.fromEntries(report.lessons.map((lesson) => [lesson.file, [row(lesson.warmup), row(lesson.dol)]]));

test('every lesson file in teacher-import-jsons/ and docs/assignments/ is measured and read', () => {
  assert.deepEqual(REPORT.lessons.filter((lesson) => lesson.error).map((lesson) => `${lesson.file}: ${lesson.error}`), []);
  // A new lesson file, or one that went missing, changes this list: add it
  // to the table above (or remove it) with its counts.
  assert.deepEqual(REPORT.lessons.map((lesson) => lesson.file), Object.keys(PINNED).sort());
});

test('lesson by lesson, the Warm-Up and DOL questions with Recovery are exactly the pinned counts', () => {
  const measured = rowsOf(REPORT);
  Object.entries(PINNED).forEach(([file, expected]) => assert.deepEqual(measured[file], expected, file));
});

test('the totals, and the pinned table adds up to them', () => {
  assert.deepEqual(REPORT.totals, TOTALS);
  const sum = (index, part) => Object.values(PINNED).reduce((total, rows) => total + Number(rows[index].split(' ')[0].split('/')[part]), 0);
  assert.deepEqual([sum(0, 0), sum(0, 1), sum(0, 2)], [TOTALS.warmup.now, TOTALS.warmup.prepared, TOTALS.warmup.questions]);
  assert.deepEqual([sum(1, 0), sum(1, 1), sum(1, 2)], [TOTALS.dol.now, TOTALS.dol.prepared, TOTALS.dol.questions]);
  assert.equal(Object.values(PINNED).filter((rows) => rows[0].endsWith(' ready')).length, TOTALS.warmup.lessonsReady);
  assert.equal(Object.values(PINNED).filter((rows) => rows[1].endsWith(' ready')).length, TOTALS.dol.lessonsReady);
});

test('what is still without Recovery, by shape', () => {
  assert.deepEqual(REPORT.withoutRecoveryByShape.map((entry) => [entry.shape, entry.questions, entry.lessons]), WITHOUT_RECOVERY_BY_SHAPE);
  const unready = REPORT.lessons.reduce((total, lesson) => total + lesson.withoutRecovery.length, 0);
  assert.equal(unready, (TOTALS.warmup.questions - TOTALS.warmup.prepared) + (TOTALS.dol.questions - TOTALS.dol.prepared));
});

test('the interval family is what changed: without it the five number-line questions have no Recovery, both Warm-Ups go back, and nothing else moves', () => {
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => family.id !== 'intervals.graphAndWrite');
  assert.equal(without.length, families.length - 1, 'the family is a Recovery candidate');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  const moved = Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file]));
  assert.deepEqual(moved, [DAY_ONE, DAY_TWO]);
  assert.deepEqual(beforeRows[DAY_ONE], ['0/0/3 unavailable', '0/0/3 unavailable']);
  assert.deepEqual(beforeRows[DAY_TWO], ['0/0/3 unavailable', '0/0/3 unavailable']);
  const intervalShape = 'intervalNumberLine · graph + interval';
  assert.deepEqual(
    before.lessons.flatMap((lesson) => lesson.withoutRecovery.filter((question) => question.shape === intervalShape).map((question) => `${lesson.file.split('/').pop()} ${question.label} ${question.questionId}`)),
    [
      'L1_Day1_Interval_Domain_Range.json Warm-Up Q1 q_warmup-1_1_1',
      'L1_Day1_Interval_Domain_Range.json Warm-Up Q2 q_warmup-1_1_2',
      'L1_Day1_Interval_Domain_Range.json Warm-Up Q3 q_warmup-1_1_3',
      'L1_Day1_Interval_Domain_Range.json DOL Q1 q_dol-4_4_1',
      'L1_Day2_Function_Attributes_Relations.json Warm-Up Q2 q_warmup-1_1_2',
    ],
  );
  // Before it, the number line was the most common shape outside the
  // typed-and-chosen boards: the reason it was built first.
  assert.deepEqual(before.withoutRecoveryByShape.slice(0, 2).map((entry) => [entry.shape, entry.questions, entry.lessons]), [['multiAnswer', 31, 9], [intervalShape, 5, 2]]);
  assert.ok(!REPORT.withoutRecoveryByShape.some((entry) => entry.shape === intervalShape), 'none is left');
  assert.deepEqual([before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared], [78, 26, 67]);
});

test('the import\'s parse, which the report reads, plans exactly as Pre-Flight\'s model does for the lessons this changed', () => {
  [DAY_ONE, DAY_TWO].forEach((file) => {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const parsed = measureLessonRecovery({ file, assignment: lessonAssignmentForCoverage(text) });
    const preflight = measureLessonRecovery({ file, assignment: lessonAssignmentForCoverage(text, { preflight: true }) });
    assert.deepEqual(preflight, parsed, file);
  });
});

test('the printed report says the same', () => {
  const text = renderRecoveryCoverageText(REPORT);
  assert.match(text, /^teacher-import-jsons\/algebra2-honors-module1\/L1_Day1_Interval_Domain_Range\.json +Warm-Up 3\/3 ready +DOL 1\/3 unavailable$/m);
  assert.match(text, /^Warm-Up: 82 of 111 questions have Recovery once prepared \(60 with nothing prepared\); 28 of 38 lessons ready\.$/m);
  assert.match(text, /^DOL: 68 of 102 questions have Recovery once prepared \(49 with nothing prepared\); 26 of 38 lessons ready\.$/m);
  assert.match(text, /^ +31 {2}multiAnswer {2}\(9 lessons\)$/m);
  assert.match(text, /L1_Day1_Interval_Domain_Range\.json {2}DOL Q2 {2}graphAnalysis · domain \+ range {2}no-certified-family/);
});
