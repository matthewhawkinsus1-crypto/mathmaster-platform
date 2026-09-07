import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

/*
 * STEP 7C: INCREMENTAL VALIDATION, DECIDED BY MEASUREMENT.
 *
 * The Repair Center revalidates the whole assignment after every repair. The
 * open question was whether that is too slow, and whether validation should be
 * made incremental — revalidate the question that changed, reuse the previous
 * result for the rest.
 *
 * It is not too slow. The numbers below are the measurement, and they say the
 * cache would buy single-digit milliseconds. What it would cost is correctness:
 * preflight does not only judge questions one at a time. Duplicate question
 * numbers, duplicate choice ids, section role coverage, alignment spread and
 * worksheet pagination are all properties of the assignment as a whole, so
 * editing question 3 can create or clear a finding on question 17 or on a
 * section. A per-question cache would keep serving the stale one, and the
 * failure mode is silent: the teacher sees a clean Repair Center and ships an
 * assignment that cannot be stored or scored.
 *
 * So there is no cache, and these two tests are what keeps that decision from
 * quietly rotting — one holds the cost down, the other holds the cache out.
 */

const question = (n) => ({
  id: `q-${n}`,
  questionNumber: n,
  type: 'multiple-choice',
  prompt: '',
  choices: [{ id: 'a', text: '' }, { id: 'a', text: '' }],
  correctAnswer: 'z',
  points: 0,
  // An array directly inside an array is illegal in Firestore, and one of these
  // is not on the coordinate-list whitelist, so the persistence source has
  // something to say about every question too.
  graph: { points: [[1, 2], [3, 4]], overlays: [[[5, 6]]] },
});

const assignmentOf = (questionCount) => {
  const roles = ['warmup', 'classwork', 'practice', 'dol'];
  const perSection = Math.ceil(questionCount / roles.length);
  return {
    schemaVersion: 5,
    title: '',
    sections: roles.map((role, index) => ({
      id: `s-${role}`,
      role,
      questions: Array.from({ length: perSection }, (_, i) => question(index * 1000 + i + 1)),
    })),
  };
};

/*
 * The budget is deliberately loose. Measured on the development container, 160
 * questions in which every single one is broken several ways at once — four
 * times the size of a real assignment, and a diagnostic load no real one comes
 * near — revalidates in about 11ms. The 400ms ceiling is roughly forty times that, so
 * this test does not fail because CI was busy; it fails when someone makes
 * preflight quadratic in question count, or has it reach for the network.
 *
 * If this test ever does start failing honestly, the fix is to make preflight
 * itself cheaper. It is not to reintroduce the cache: see above for why the
 * milliseconds were never the expensive part.
 */
test('revalidating an entire assignment is cheap enough that caching is not worth its risk', () => {
  const assignment = assignmentOf(160);
  const questionCount = assignment.sections.reduce((n, s) => n + s.questions.length, 0);
  assert.ok(questionCount >= 160, `fixture should be large: ${questionCount}`);

  // A clean assignment of this size still produces roughly one diagnostic per
  // question, so "more diagnostics than questions" would not prove anything.
  // Every question here is broken several ways at once, which lands near four
  // per question; three is the floor that a fixture quietly repaired into a
  // cheap early-exit path could not clear.
  const warm = buildAssignmentV5PreflightModel(assignment);
  assert.ok(
    warm.diagnostics.length >= questionCount * 3,
    `fixture should be diagnostic-heavy, not a clean assignment on a cheap path: ${warm.diagnostics.length} diagnostics for ${questionCount} questions`,
  );

  const runs = 10;
  const started = process.hrtime.bigint();
  for (let i = 0; i < runs; i += 1) buildAssignmentV5PreflightModel(assignment);
  const perRun = Number(process.hrtime.bigint() - started) / 1e6 / runs;

  assert.ok(
    perRun < 400,
    `full revalidation of ${questionCount} questions took ${perRun.toFixed(1)}ms, which is slow enough that someone will be tempted to cache it. Make preflight cheaper rather than caching per question.`,
  );
});

/*
 * The other half of the decision, and the one that actually protects students.
 *
 * A cache does not have to be called a cache. Narrowing the preflight memo's
 * dependencies to the focused question id is the same thing with none of the
 * ceremony: React keeps the previous model, and every assignment-level and
 * section-level finding freezes at whatever it was before the repair. That is
 * a two-character edit to a dependency array, so it needs a contract.
 */
const source = readFileSync(
  new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url),
  'utf8',
);

test('the Repair Center recomputes preflight from the whole assignment, not from the focused question', () => {
  const start = source.indexOf('const preflightModel = useMemo(');
  assert.notEqual(start, -1, 'the Repair Center must derive its preflight model through a memo');
  const end = source.indexOf('const repairCenterModel', start);
  assert.notEqual(end, -1, 'could not find the end of the preflight memo');
  const memo = source.slice(start, end);

  assert.match(
    memo,
    /buildAssignmentV5PreflightModel\(\s*assignmentV5\s*,/,
    'preflight must be built from the whole assignmentV5. Passing a single question or a section would hide every cross-question finding — duplicate numbers, duplicate choice ids, section coverage, alignment spread.',
  );

  const deps = memo.slice(memo.lastIndexOf('['), memo.lastIndexOf(']') + 1);
  assert.match(
    deps,
    /assignmentV5/,
    `the preflight memo must depend on assignmentV5 so a repair anywhere recomputes findings everywhere; dependencies were ${deps}`,
  );
  assert.match(
    deps,
    /teacherReviewContext/,
    `the preflight memo must depend on teacherReviewContext, or recording an override leaves the displayed findings unchanged; dependencies were ${deps}`,
  );
  assert.doesNotMatch(
    deps,
    /focusedQuestionId|focusedRow|questionId/,
    `keying the preflight memo on the focused question is an incremental-validation cache by another name: assignment-level and section-level findings would stop updating when a question is repaired. Dependencies were ${deps}`,
  );
});
