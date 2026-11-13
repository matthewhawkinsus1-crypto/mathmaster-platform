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
// 2026-10-25 with intervals.graphAndWrite (RC01) registered, and on 2026-11-05
// with version 2 of linear.representationSort and linear.multipleRepresentations
// (RC01: the baseline Multiple Representations file) and the three
// parent-function transformation families (RC01: Algebra II Honors Module 1
// Lesson 2 Day 2's exit ticket) and relations.mappingDiagram (RC01: the
// Mapping Diagram questions of Lesson 1 and the District DOL 1 review) and
// functions.domainRangeFromGraph (RC01: Lesson 1's graphed domain and range)
// and the function-values families (RC01: Lesson 4's numeric Warm-Up), and on
// 2026-11-06 with the inverse families (RC01's next shapes: Lessons 3 and 4's
// inverse boards), Lesson 1 Day 2's graphed intervals and filling tank, the
// ALEKS bridge lesson's transformation families, the function-operation
// families (Lesson 4's exit ticket Q1 and Q2), and the graph-recognition
// families (the District DOL 1 review's Warm-Up Q2–Q4). The Algebra I
// Module 3 Topic 2 Lesson 4 and 5 files and the Algebra II Honors radicals
// lessons (added 2026-11-03) generate every Warm-Up and DOL question from an
// assignment Question Family, so each section is 3/3/3 ready with nothing
// prepared. The Algebra I Module 3 Topic 1 Assessment make-up and its Honors
// version (added 2026-11-13) have only a Test section, and the Algebra I
// DOL #4 review and its Honors file (added 2026-11-13) only a Practice
// section, so none of them has either row.
const PINNED = Object.freeze({
  'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json': ['2/2/2 ready', '1/1/1 ready'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json': ['0/0/2 unavailable', '0/0/2 unavailable'],
  'docs/assignments/algebra1-linear-multiple-representations-final-v5.json': ['0/2/2 ready', '0/1/1 ready'],
  'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json': ['0/4/4 ready', '0/0/8 unavailable'],
  'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review_Honors.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review_Honors.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra1-module3/M3_T1_Assessment_MakeUp.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-module3/M3_T1_Assessment_MakeUp_Honors.json': ['0/0/0 notPresent', '0/0/0 notPresent'],
  'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution_Honors.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json': ['4/4/4 ready', '7/7/7 ready'],
  'teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-radicals/L3_Rational_Exponents.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json': ['0/3/3 ready', '0/2/2 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json': ['0/0/3 unavailable', '0/0/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json': ['0/0/3 unavailable', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json': ['0/1/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json': ['0/3/3 ready', '0/2/3 unavailable'],
  'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json': ['0/3/3 ready', '0/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/1_Factoring_Polynomials_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/2_Remainder_and_Factor_Theorems_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors.json': ['3/3/3 ready', '3/3/3 ready'],
  // The Step Algebra version of the lesson above (2026-11-12): the same family slots, so its Warm-Up and DOL keep
  // exactly the Recovery the Sign & Solution Analyzer version has.
  'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json': ['3/3/3 ready', '3/3/3 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/1_Factoring_Polynomials.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/3_Radical_Expressions.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/4_Rational_Exponents.json': ['3/3/3 ready', '2/2/2 ready'],
  'teacher-import-jsons/algebra2-polynomials-radicals/5_Solving_Radical_Equations.json': ['3/3/3 ready', '2/2/2 ready'],
});

const TOTALS = Object.freeze({
  warmup: { questions: 135, now: 84, prepared: 121, lessonsWithSection: 46, lessonsReady: 41 },
  dol: { questions: 126, now: 73, prepared: 108, lessonsWithSection: 46, lessonsReady: 40 },
});

// What is left: [shape, questions, lessons], most first. A typed-and-chosen
// board (multiAnswer) holds a different hand-written task in each question.
const WITHOUT_RECOVERY_BY_SHAPE = Object.freeze([
  ['multiAnswer', 16, 7],
  ['systemsWorkspace/spatial', 3, 3],
  ['functionCharacteristics · domain + range', 3, 1],
  ['systemsWorkspace/algebraic', 3, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + yInterceptExists + yIntercept + yInterceptValue + asymptote + behavior', 1, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + zeros + yInterceptExists + yIntercept + yInterceptValue + behavior', 1, 1],
  ['functionCharacteristics · xInterceptExists + xIntercept + xInterceptValue + zeros + yInterceptExists + yIntercept + yInterceptValue + extremeKind + extremePoint + extremeValue + axisOfSymmetry + behavior', 1, 1],
  ['graphAnalysis · domain + range', 1, 1],
  ['graphAnalysis · domain + range + decreasing', 1, 1],
  ['graphAnalysis · increasing + decreasing', 1, 1],
  ['relationMapping · mapping + isFunction', 1, 1],
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
  // (Each lesson's Mapping Diagram and graph questions have their own families' Recovery, below.)
  assert.deepEqual(beforeRows[DAY_ONE], ['0/0/3 unavailable', '0/2/3 unavailable']);
  assert.deepEqual(beforeRows[DAY_TWO], ['0/2/3 ready', '0/3/3 ready']);
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
  // typed-and-chosen boards: the reason it was built first. (31 such boards
  // then; eight are now the transformation description board, Lesson 4's
  // two numeric Warm-Up questions, the five inverse boards, Day 2's filling
  // tank, the ALEKS bridge lesson's four boards and Lesson 4's two exit-ticket
  // boards, below.)
  assert.deepEqual(before.withoutRecoveryByShape.slice(0, 2).map((entry) => [entry.shape, entry.questions, entry.lessons]), [['multiAnswer', 16, 7], [intervalShape, 5, 2]]);
  assert.ok(!REPORT.withoutRecoveryByShape.some((entry) => entry.shape === intervalShape), 'none is left');
  // (78, 26 and 67 before the 2026-11-03 lessons, whose 21 + 21 questions and
  // 7 lessons never needed the interval family, and before the families
  // below: the baseline Multiple Representations file's 2 + 1 questions and
  // Warm-Up, Lesson 2 Day 2's 3 exit-ticket questions, the Mapping Diagram's
  // 2 + 2 questions and 2 Warm-Ups — Day 2's and the review's — the graphed
  // domain and range's 1 + 1, Lesson 4's 2 Warm-Up questions and Warm-Up, and
  // the inverse boards' 2 + 3 questions and Lesson 3's Warm-Up and exit ticket,
  // Day 2's graphed intervals and filling tank, 2 exit-ticket questions, the
  // ALEKS bridge lesson's 3 + 2 questions and Warm-Up, and Lesson 4's 2
  // exit-ticket questions, and the District review's Warm-Up Q2–Q4. The last
  // term of each sum is the Step Algebra radical lesson (2026-11-12): 3 + 3
  // family-slot questions and one lesson, which never needed the interval family.)
  assert.deepEqual([before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared], [78 + 21 + 2 + 2 + 1 + 2 + 2 + 3 + 3 + 3, 26 + 7 + 1 + 2 + 1 + 1 + 1 + 1, 67 + 21 + 1 + 3 + 2 + 1 + 3 + 2 + 2 + 2 + 3]);
});

const BASELINE_LMR = 'docs/assignments/algebra1-linear-multiple-representations-final-v5.json';

test('version 2 of the representation families is what changed next: without it the baseline Multiple Representations file\'s two sorts and its board have no Recovery, and nothing else moves', () => {
  const families = recoveryCandidateFamilies();
  const representation = new Set(['linear.representationSort', 'linear.multipleRepresentations']);
  const without = families.filter((family) => !representation.has(family.id));
  assert.deepEqual(families.filter((family) => representation.has(family.id)).map((family) => `${family.id}@${family.version}`), [
    'linear.multipleRepresentations@2',
    'linear.representationSort@2',
  ], 'each is a Recovery candidate at version 2, the first that recognizes');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  const moved = Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file]));
  assert.deepEqual(moved, [BASELINE_LMR]);
  assert.deepEqual(beforeRows[BASELINE_LMR], ['0/0/2 unavailable', '0/0/1 unavailable']);
  assert.deepEqual(afterRows[BASELINE_LMR], ['0/2/2 ready', '0/1/1 ready']);
  assert.deepEqual(
    before.lessons.find((lesson) => lesson.file === BASELINE_LMR).withoutRecovery.map((question) => `${question.label} ${question.questionId} ${question.shape}`),
    [
      'Warm-Up Q1 lmr-wu-1 representationMatch/linearConnections',
      'Warm-Up Q2 lmr-wu-2 representationMatch/linearConnections',
      'DOL Q1 lmr-dol-1 representationBridge/linearMultipleRepresentations',
    ],
  );
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared - 2, TOTALS.warmup.lessonsReady - 1, TOTALS.dol.prepared - 1, TOTALS.dol.lessonsReady - 1],
  );
});

const TRANSFORMATIONS_DAY_TWO = 'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json';

test('the parent-function transformation families are what changed next: without them Lesson 2 Day 2\'s three exit-ticket questions have no Recovery, and nothing else moves', () => {
  const ids = new Set(['transformations.identifyCubeRoot', 'transformations.describeEveryChange', 'transformations.mapExponentialPoint']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 3, 'each is a Recovery candidate');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  const moved = Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file]));
  assert.deepEqual(moved, [TRANSFORMATIONS_DAY_TWO]);
  assert.deepEqual(beforeRows[TRANSFORMATIONS_DAY_TWO], ['0/0/3 unavailable', '0/0/3 unavailable']);
  assert.deepEqual(afterRows[TRANSFORMATIONS_DAY_TWO], ['0/0/3 unavailable', '0/3/3 ready']);
  assert.deepEqual(
    before.lessons.find((lesson) => lesson.file === TRANSFORMATIONS_DAY_TWO).withoutRecovery.filter((question) => question.section === 'dol').map((question) => `${question.label} ${question.shape}`),
    ['DOL Q1 transformationsLab/identify', 'DOL Q2 multiAnswer', 'DOL Q3 transformationsLab/pointMap'],
  );
  // The Warm-Up's three parent-function reviews stay: every fresh version of
  // one would have the same answer (the owner's decision).
  assert.deepEqual(
    REPORT.lessons.find((lesson) => lesson.file === TRANSFORMATIONS_DAY_TWO).withoutRecovery.map((question) => `${question.label} ${question.prompt}`),
    ['Warm-Up Q1 Review the parent function f(x)=|x|.', 'Warm-Up Q2 Review the parent function f(x)=√x.', 'Warm-Up Q3 Review f(x)=2ˣ.'],
  );
  assert.deepEqual([before.totals.dol.prepared, before.totals.dol.lessonsReady], [TOTALS.dol.prepared - 3, TOTALS.dol.lessonsReady - 1]);
  assert.deepEqual(before.totals.warmup, TOTALS.warmup, 'the Warm-Ups did not move');
});

const DOL_ONE_REVIEW = 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';

test('relations.mappingDiagram is what changed next: without it the four Mapping Diagram questions have no Recovery and the review\'s Warm-Up loses its Q1; the review\'s DOL Q7 is refused for its rigor', () => {
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => family.id !== 'relations.mappingDiagram');
  assert.equal(without.length, families.length - 1, 'the family is a Recovery candidate');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  const moved = Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file]));
  assert.deepEqual(moved, [DOL_ONE_REVIEW, DAY_ONE, DAY_TWO]);
  // (The review's Warm-Up Q2–Q4 have the graph-recognition families' Recovery, below.)
  assert.deepEqual([beforeRows[DOL_ONE_REVIEW], afterRows[DOL_ONE_REVIEW]], [['0/3/4 ready', '0/0/8 unavailable'], ['0/4/4 ready', '0/0/8 unavailable']]);
  assert.deepEqual([beforeRows[DAY_ONE], afterRows[DAY_ONE]], [['0/3/3 ready', '0/2/3 unavailable'], ['0/3/3 ready', '0/3/3 ready']]);
  assert.deepEqual([beforeRows[DAY_TWO], afterRows[DAY_TWO]], [['0/2/3 ready', '0/2/3 unavailable'], ['0/3/3 ready', '0/3/3 ready']]);
  const relationRows = (report) => report.lessons.flatMap((lesson) => lesson.withoutRecovery
    .filter((question) => question.shape.startsWith('relationMapping'))
    .map((question) => `${lesson.file.split('/').pop()} ${question.label} ${question.reason}`));
  assert.deepEqual(relationRows(before), [
    'District_DOL1_Technology_Graph_Analysis_Review.json Warm-Up Q1 no-certified-family',
    'District_DOL1_Technology_Graph_Analysis_Review.json DOL Q7 no-certified-family',
    'L1_Day1_Interval_Domain_Range.json DOL Q3 no-certified-family',
    'L1_Day2_Function_Attributes_Relations.json Warm-Up Q3 no-certified-family',
    'L1_Day2_Function_Attributes_Relations.json DOL Q2 no-certified-family',
  ]);
  assert.deepEqual(relationRows(REPORT), ['District_DOL1_Technology_Graph_Analysis_Review.json DOL Q7 rigor-mismatch']);
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    // (Day 1's and Day 2's exit tickets each need their Mapping Diagram; the
    // review's Warm-Up stays ready on its Q2–Q4.)
    [TOTALS.warmup.prepared - 2, TOTALS.warmup.lessonsReady, TOTALS.dol.prepared - 2, TOTALS.dol.lessonsReady - 2],
  );
});

test('functions.domainRangeFromGraph is what changed next: without it Lesson 1 Day 1\'s exit ticket and Day 2\'s graph Warm-Up question go back, and nothing else moves', () => {
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => family.id !== 'functions.domainRangeFromGraph');
  assert.equal(without.length, families.length - 1, 'the family is a Recovery candidate');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  const moved = Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file]));
  assert.deepEqual(moved, [DAY_ONE, DAY_TWO]);
  assert.deepEqual([beforeRows[DAY_ONE], afterRows[DAY_ONE]], [['0/3/3 ready', '0/2/3 unavailable'], ['0/3/3 ready', '0/3/3 ready']]);
  assert.deepEqual([beforeRows[DAY_TWO], afterRows[DAY_TWO]], [['0/2/3 ready', '0/3/3 ready'], ['0/3/3 ready', '0/3/3 ready']]);
  // The parent |x| (Lesson 2 Day 1's review) is not this task: the same answer every time.
  assert.ok(REPORT.lessons.some((lesson) => lesson.withoutRecovery.some((question) => question.prompt === 'Use the graph of f(x) = |x|. State the domain and range.')));
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared - 1, TOTALS.warmup.lessonsReady, TOTALS.dol.prepared - 1, TOTALS.dol.lessonsReady - 1],
  );
});

const COMPOSITION_LESSON = 'teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json';

test('the function-values families are what changed next: without them Lesson 4\'s Warm-Up goes back, and nothing else moves', () => {
  const ids = new Set(['functions.pointwiseFromValues', 'functions.compositionFromValues']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 2, 'both are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [COMPOSITION_LESSON]);
  // (Lesson 4's Warm-Up stays ready without them: its inverse review, Q1, has the inverse family's Recovery.)
  assert.deepEqual([beforeRows[COMPOSITION_LESSON], afterRows[COMPOSITION_LESSON]], [['0/1/3 ready', '0/2/3 unavailable'], ['0/3/3 ready', '0/2/3 unavailable']]);
  assert.deepEqual([before.totals.warmup.prepared, before.totals.warmup.lessonsReady], [TOTALS.warmup.prepared - 2, TOTALS.warmup.lessonsReady]);
  assert.deepEqual(before.totals.dol, TOTALS.dol, 'the exit tickets did not move');
});

const INVERSE_LESSON = 'teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json';

test('the inverse families are what changed next: without them Lesson 3 has no Recovery and Lesson 4\'s Warm-Up review goes back, and nothing else moves', () => {
  const ids = new Set(['functions.swapPairAndEvaluate', 'relations.inverseOfSet', 'functions.inverseOfLinear', 'functions.inverseInContext']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 4, 'all four are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [INVERSE_LESSON, COMPOSITION_LESSON]);
  assert.deepEqual([beforeRows[INVERSE_LESSON], afterRows[INVERSE_LESSON]], [['0/0/3 unavailable', '0/0/3 unavailable'], ['0/1/3 ready', '0/3/3 ready']]);
  assert.deepEqual([beforeRows[COMPOSITION_LESSON], afterRows[COMPOSITION_LESSON]], [['0/2/3 ready', '0/2/3 unavailable'], ['0/3/3 ready', '0/2/3 unavailable']]);
  // Lesson 3's Warm-Up Q2 and Q3 and Lesson 4's exit ticket Q3 have the same
  // answer in every version (the owner's decision); Lesson 4's DOL Q1 and Q2
  // have the function-operation families' (below).
  assert.deepEqual(
    REPORT.lessons.filter((lesson) => [INVERSE_LESSON, COMPOSITION_LESSON].includes(lesson.file)).flatMap((lesson) => lesson.withoutRecovery.map((question) => `${lesson.file.split('/').pop()} ${question.label}`)),
    ['L3_Inverse_Linear_Functions.json Warm-Up Q2', 'L3_Inverse_Linear_Functions.json Warm-Up Q3', 'L4_Operations_on_Functions_Composition.json DOL Q3'],
  );
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared - 2, TOTALS.warmup.lessonsReady - 1, TOTALS.dol.prepared - 3, TOTALS.dol.lessonsReady - 1],
  );
});

test('the graphed-intervals and filling-tank families are what changed next: without them Lesson 1 Day 2\'s exit ticket goes back to its Mapping Diagram alone, and nothing else moves', () => {
  const ids = new Set(['functions.intervalsFromGraph', 'functions.fillingTankAttributes']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 2, 'both are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [DAY_TWO]);
  assert.deepEqual([beforeRows[DAY_TWO], afterRows[DAY_TWO]], [['0/3/3 ready', '0/1/3 unavailable'], ['0/3/3 ready', '0/3/3 ready']]);
  assert.deepEqual(
    before.lessons.find((lesson) => lesson.file === DAY_TWO).withoutRecovery.map((question) => `${question.label} ${question.shape}`),
    ['DOL Q1 graphAnalysis · increasing + decreasing + positive + negative', 'DOL Q3 multiAnswer'],
  );
  assert.deepEqual(REPORT.lessons.find((lesson) => lesson.file === DAY_TWO).withoutRecovery, [], 'every Warm-Up and exit-ticket question of Day 2 has Recovery');
  assert.deepEqual([before.totals.dol.prepared, before.totals.dol.lessonsReady], [TOTALS.dol.prepared - 2, TOTALS.dol.lessonsReady - 1]);
  assert.deepEqual(before.totals.warmup, TOTALS.warmup, 'the Warm-Ups did not move');
});

const ALEKS_BRIDGE = 'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json';

test('the ALEKS bridge lesson\'s transformation families are what changed next: without them the lesson has no Recovery, and nothing else moves', () => {
  const ids = new Set(['transformations.describeTranslations', 'transformations.describeScaleChange', 'absoluteValue.analyzeTransformed', 'transformations.matchAbsoluteValue']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 4, 'all four are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [ALEKS_BRIDGE]);
  assert.deepEqual([beforeRows[ALEKS_BRIDGE], afterRows[ALEKS_BRIDGE]], [['0/0/3 unavailable', '0/0/2 unavailable'], ['0/3/3 ready', '0/2/2 ready']]);
  assert.deepEqual(REPORT.lessons.find((lesson) => lesson.file === ALEKS_BRIDGE).withoutRecovery, [], 'every Warm-Up and exit-ticket question has Recovery');
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared - 3, TOTALS.warmup.lessonsReady - 1, TOTALS.dol.prepared - 2, TOTALS.dol.lessonsReady - 1],
  );
});

test('the function-operation families are what changed next: without them Lesson 4\'s exit ticket Q1 and Q2 go back, the ticket still waits on Q3, and nothing else moves', () => {
  const ids = new Set(['functions.composeQuadraticLinear', 'functions.conjugateProductQuotient']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 2, 'both are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [COMPOSITION_LESSON]);
  assert.deepEqual([beforeRows[COMPOSITION_LESSON], afterRows[COMPOSITION_LESSON]], [['0/3/3 ready', '0/0/3 unavailable'], ['0/3/3 ready', '0/2/3 unavailable']]);
  // "Are these inverses?" is always yes, so it has no family (handoff section 5).
  assert.deepEqual(REPORT.lessons.find((lesson) => lesson.file === COMPOSITION_LESSON).withoutRecovery.map((question) => question.label), ['DOL Q3']);
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared, TOTALS.warmup.lessonsReady, TOTALS.dol.prepared - 2, TOTALS.dol.lessonsReady],
  );
});

test('the graph-recognition families are what changed next: without them the review\'s Warm-Up goes back to its Mapping Diagram alone, and nothing else moves', () => {
  const ids = new Set(['functions.familySortFromGraphs', 'quadratics.vertexChoiceFromGraph', 'exponential.sortGrowthDecay']);
  const families = recoveryCandidateFamilies();
  const without = families.filter((family) => !ids.has(family.id));
  assert.equal(without.length, families.length - 3, 'all three are Recovery candidates');
  const before = measureRecoveryCoverage({ families: without });
  const beforeRows = rowsOf(before);
  const afterRows = rowsOf(REPORT);
  assert.deepEqual(Object.keys(afterRows).filter((file) => JSON.stringify(afterRows[file]) !== JSON.stringify(beforeRows[file])), [DOL_ONE_REVIEW]);
  assert.deepEqual([beforeRows[DOL_ONE_REVIEW], afterRows[DOL_ONE_REVIEW]], [['0/1/4 ready', '0/0/8 unavailable'], ['0/4/4 ready', '0/0/8 unavailable']]);
  // Every Warm-Up question has Recovery; the exit ticket waits on its DOL Q7 (the owner's) and its boards.
  assert.ok(!REPORT.lessons.find((lesson) => lesson.file === DOL_ONE_REVIEW).withoutRecovery.some((question) => question.label.startsWith('Warm-Up')));
  assert.deepEqual(
    [before.totals.warmup.prepared, before.totals.warmup.lessonsReady, before.totals.dol.prepared, before.totals.dol.lessonsReady],
    [TOTALS.warmup.prepared - 3, TOTALS.warmup.lessonsReady, TOTALS.dol.prepared, TOTALS.dol.lessonsReady],
  );
});

test('the import\'s parse, which the report reads, plans exactly as Pre-Flight\'s model does for the lessons this changed', () => {
  [DAY_ONE, DAY_TWO, BASELINE_LMR, TRANSFORMATIONS_DAY_TWO, DOL_ONE_REVIEW, COMPOSITION_LESSON, INVERSE_LESSON, ALEKS_BRIDGE].forEach((file) => {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const parsed = measureLessonRecovery({ file, assignment: lessonAssignmentForCoverage(text) });
    const preflight = measureLessonRecovery({ file, assignment: lessonAssignmentForCoverage(text, { preflight: true }) });
    assert.deepEqual(preflight, parsed, file);
  });
});

test('the printed report says the same', () => {
  const text = renderRecoveryCoverageText(REPORT);
  assert.match(text, /^teacher-import-jsons\/algebra2-honors-module1\/L1_Day1_Interval_Domain_Range\.json +Warm-Up 3\/3 ready +DOL 3\/3 ready$/m);
  assert.match(text, /^Warm-Up: 121 of 135 questions have Recovery once prepared \(84 with nothing prepared\); 41 of 46 lessons ready\.$/m);
  assert.match(text, /^DOL: 108 of 126 questions have Recovery once prepared \(73 with nothing prepared\); 40 of 46 lessons ready\.$/m);
  assert.match(text, /^docs\/assignments\/algebra1-linear-multiple-representations-final-v5\.json +Warm-Up 2\/2 ready +DOL 1\/1 ready$/m);
  assert.match(text, /^ +16 {2}multiAnswer {2}\(7 lessons\)$/m);
  assert.match(text, /L2_Day1_Parent_Functions_Key_Attributes\.json {2}Warm-Up Q2 {2}graphAnalysis · increasing \+ decreasing {2}no-certified-family/);
});
