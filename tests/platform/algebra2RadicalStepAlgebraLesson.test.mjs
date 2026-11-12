import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { isHonorsImport, reviewImportForHonors } from '../../scripts/lib/honorsImportReview.mjs';
import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { reproduceFamilyQuestionFromPin, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
import { normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { relationSourceFromQuestion, resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { relationStepWork, verifyStepAlgebraStep } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { relationWorkspaceWork } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  parseRelationSource,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  parseRadicalEquation,
  radicalSidesAt,
  rationalToText,
  solveRadicalShape,
} from '../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import { RECOVERY_MINIMUM_CAPACITY } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { honestPath } from './helpers/radicalHonestPath.mjs';

/*
 * 5_Solving_Radical_Equations_Honors_Step_Algebra.json — THE LESSON AS IMPORTED, GENERATED AND GRADED.
 *
 * The teacher's own upload (5_Solving_Radical_Equations_Honors.json) solves its single-radical
 * equations in the Sign & Solution Analyzer. This is the same lesson with those nine items on the
 * Step Algebra relation workspace — the one students already use for absolute value and completing
 * the square. These tests hold it to what the teacher was promised:
 *
 *   - it is the source, with exactly the nine requested items converted and nothing else touched
 *     (the graph, the sort, the Honors extensions, every ID and every generator);
 *   - it passes Pre-Flight and the Honors review, and each converted item opens the relation workspace;
 *   - every one of the 53,496 versions its four families can generate is an equation the workspace
 *     verifies, with the answer key the generator promised, the same equation the prompt shows, and
 *     enough versions for Recovery;
 *   - the server holds each pinned version authoritatively, marks the honest solve right and each
 *     miss wrong, and accepts every step of the honest path.
 */

const DIR = 'teacher-import-jsons/algebra2-polynomials-radicals-honors/';
const SOURCE_FILE = `${DIR}5_Solving_Radical_Equations_Honors.json`;
const LESSON_FILE = `${DIR}5_Solving_Radical_Equations_Honors_Step_Algebra.json`;
const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const SOURCE = JSON.parse(read(SOURCE_FILE));
const LESSON = JSON.parse(read(LESSON_FILE));
const COMPILED = compileTeacherImport(read(LESSON_FILE));
const ORIGINAL = compileTeacherImport(read(SOURCE_FILE));

const CONVERTED = Object.freeze(['srh-cw-1', 'srh-cw-2', 'srh-cw-9', 'srh-p-1', 'srh-p-2', 'srh-p-3', 'srh-p-4', 'srh-dol-1', 'srh-dol-3']);
const FAMILIES = Object.freeze(['srh-p-1', 'srh-p-2', 'srh-dol-1', 'srh-dol-3']);
const questions = (lesson) => lesson.sections.flatMap((section) => section.questions);
const byId = (list) => Object.fromEntries(list.map((question) => [question.questionId, question]));
const compiledById = byId(COMPILED.questions);

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

test('it is the teacher\'s source with exactly the nine requested radical items converted', () => {
  assert.deepEqual(LESSON.sections.map((section) => [section.id, section.role, section.title, section.recommendedMinutes]),
    SOURCE.sections.map((section) => [section.id, section.role, section.title, section.recommendedMinutes]), 'the same four sections');
  assert.deepEqual(questions(LESSON).map((question) => question.questionId), questions(SOURCE).map((question) => question.questionId), 'the same problem IDs, in the same order');
  assert.deepEqual(['warmup', 'classwork', 'practice', 'dol'], LESSON.sections.map((section) => section.role));

  const source = byId(questions(SOURCE));
  const lesson = byId(questions(LESSON));
  for (const [id, question] of Object.entries(lesson)) {
    if (!CONVERTED.includes(id)) {
      assert.deepEqual(question, source[id], `${id} is untouched (graphs, the sort, the Honors extensions and the Warm-Up stay as the teacher wrote them)`);
      continue;
    }
    // A converted item differs from the source in its action, its equation and a worked solution
    // (the analyzer wrote the steps from its spec; here the item authors them, keeping the source's common error).
    const { equation, solveFor, studentActions, solutionReview, ...kept } = question;
    const { radicalEquation, studentActions: sourceActions, solutionReview: sourceReview, ...sourceKept } = source[id];
    assert.equal(solutionReview.commonError, sourceReview.commonError, `${id}: keeps the source's common error`);
    assert.ok(solutionReview.headline && solutionReview.answerSummary && solutionReview.reasoning.length >= 3, `${id}: a worked solution a student can read after their last try`);
    assert.deepEqual(studentActions, ['solveStepByStep'], `${id}: solveStepByStep is the authoring entry point`);
    assert.deepEqual(sourceActions, ['solveRadicalEquation']);
    assert.ok(radicalEquation, `${id}: the source authored a radicalEquation`);
    assert.equal(typeof equation, 'string');
    assert.ok(solveFor, `${id}: names the variable it solves for`);
    assert.deepEqual(kept, sourceKept, `${id}: prompt, hints, generator and family are the source's, field for field`);
  }
  // Variants stay stable: the generators are byte-for-byte the source's.
  for (const id of FAMILIES) {
    assert.equal(JSON.stringify(lesson[id].generator), JSON.stringify(source[id].generator), `${id}: same generator`);
    assert.deepEqual(lesson[id].questionFamily, source[id].questionFamily, `${id}: same family scope`);
  }
  const { title, teacherNotes, ...assignment } = LESSON.assignment;
  const { title: sourceTitle, teacherNotes: sourceNotes, ...sourceAssignment } = SOURCE.assignment;
  assert.deepEqual(assignment, sourceAssignment, 'only the title and the teacher notes differ');
  assert.notEqual(title, sourceTitle, 'a distinct title, so the two imports are told apart');
  assert.notEqual(teacherNotes, sourceNotes, 'the notes describe the Step Algebra workspace, not the analyzer');
  assert.match(title, /Step Algebra/);
  assert.match(teacherNotes, /Step Algebra workspace/);
  assert.doesNotMatch(teacherNotes, /staged solver/, 'the notes no longer describe the analyzer for these items');
  assert.deepEqual(LESSON.variantPolicy, SOURCE.variantPolicy);
});

test('Pre-Flight, the import check and the Honors review all pass', () => {
  assert.equal(COMPILED.model.isValid, true, COMPILED.model.errors.join('; '));
  assert.deepEqual(COMPILED.model.errors, []);
  assert.deepEqual(COMPILED.model.warnings || [], []);
  assert.deepEqual(COMPILED.semantic.errors, []);
  assert.deepEqual(COMPILED.semantic.warnings, []);
  assert.equal(isHonorsImport({ filePath: LESSON_FILE, title: COMPILED.model.assignmentV5?.assignment?.title }), true);
  const honors = reviewImportForHonors(COMPILED.model);
  assert.equal(honors.ready, true, [...honors.blockers, ...honors.hints].join('; '));
  assert.equal(honors.report.depthCount, honors.depthAreaCount, 'every Honors depth area is still supplied');
});

test('each converted item opens the relation workspace; every other item is the tool it was', () => {
  for (const id of CONVERTED) {
    const question = compiledById[id];
    assert.equal(question.type, 'stepAlgebra', id);
    assert.equal(question.relationWorkspace, true, `${id}: opens the relation workspace by default`);
    assert.equal(resolveStepAlgebraMode(question), 'relation', id);
    assert.ok(question.solveFor, id);
  }
  assert.equal(compiledById['srh-cw-9'].solveFor, 'h', 'the horizon item is solved for h');
  // The rest compile to the same tool as the source's own compile.
  const original = byId(ORIGINAL.questions);
  for (const id of Object.keys(compiledById).filter((candidate) => !CONVERTED.includes(candidate))) {
    assert.equal(compiledById[id].type, original[id].type, `${id}: same tool as the source`);
    assert.equal(compiledById[id].mode, original[id].mode, `${id}: same mode as the source`);
  }
  assert.equal(compiledById['srh-cw-3'].graph !== undefined, true, 'the graph item keeps its graph');
  assert.equal(compiledById['srh-cw-10'].type, 'openSortBoard', 'the sort item is still the sort board');
  assert.equal(compiledById['srh-p-7'].type, 'signSolutionAnalyzer', 'the inequality item is still the analyzer');
  // A DOL and a Warm-Up each still have their items (Recovery is built from them).
  assert.deepEqual(COMPILED.questions.filter((question) => question.activityRole === 'dol').map((question) => question.questionId), ['srh-dol-1', 'srh-dol-2', 'srh-dol-3']);
});

test('the original upload still imports as the Sign & Solution Analyzer: no migration, nothing re-routed', () => {
  const original = byId(ORIGINAL.questions);
  for (const id of CONVERTED) {
    assert.equal(original[id].type, 'signSolutionAnalyzer', `${id}: the analyzer's own question`);
    assert.equal(original[id].mode, 'radicalSolve', id);
    assert.ok(original[id].radicalEquation, `${id}: keeps its radicalEquation`);
    assert.equal(original[id].relationWorkspace, undefined, `${id}: not flagged for the relation workspace`);
  }
  assert.equal(ORIGINAL.model.isValid, true);
  assert.deepEqual(ORIGINAL.model.errors, []);
});

// ---------------------------------------------------------------------------
// Every generated version
// ---------------------------------------------------------------------------

/** Every version of a family, each as the question a student would be given. */
function* everyVersion(id) {
  const template = compiledById[id];
  const family = buildTemplateFamily(template, { slotKey: `a|${id}` });
  const values = resolveFamilyConstraints(family, {}).values;
  const { capacity, exact } = measureFamilyCapacity(family, values);
  assert.equal(exact, true, `${id}: its capacity is measured exactly`);
  const sequence = createFamilyInstanceSequence(family, values, 'radical-lesson');
  for (let index = 0; index < capacity; index += 1) {
    const instance = sequence.instanceAt(index);
    yield { index, instance, question: buildFamilyQuestion({ family, instance, constraintValues: values, authored: template }), capacity };
  }
}

const mathOf = (prompt) => String(prompt).match(/\$([^$]+)\$/)?.[1] ?? '';

test('every generated version is a verified equation with the answer the generator promises, and the prompt shows the same equation', () => {
  const totals = {};
  for (const id of FAMILIES) {
    let count = 0;
    const indices = new Set();
    for (const { instance, question } of everyVersion(id)) {
      count += 1;
      const source = relationSourceFromQuestion(question);
      assert.equal(question.relationWorkspace, true, `${id}: ${source} carries the route`);
      assert.equal(resolveStepAlgebraMode(question), 'relation', `${id}: ${source}`);
      const parsed = parseRadicalEquation(source, { variable: question.solveFor });
      assert.equal(parsed.ok, true, `${id}: ${source} (${parsed.reason})`);
      const solved = solveRadicalShape(parsed.shape);
      assert.equal(solved.ok, true, `${id}: ${source} (${solved.reason})`);
      indices.add(parsed.shape.index);
      const { params } = instance;

      if (id === 'srh-p-1' || id === 'srh-dol-1') {
        // sqrt(mx + b) + k = x + c + k: squaring gives (x - p)(x - q); p is genuine, q is extraneous.
        // The solver lists candidates from least to greatest.
        assert.deepEqual(solved.candidates.map(rationalToText), [params.p, params.q].sort((a, b) => a - b).map(String), `${id}: ${source} candidates are p and q`);
        assert.deepEqual(solved.genuine.map(rationalToText), [String(params.p)], `${id}: ${source}: only p = ${params.p} satisfies it`);
        assert.deepEqual(solved.extraneous.map(rationalToText), [String(params.q)], `${id}: ${source}: q = ${params.q} is extraneous`);
        assert.equal(parsed.shape.index, 2);
        // The worked solution says what the exact model says, for this very version.
        const review = question.solutionReview;
        assert.equal(review.answerSummary, `x = ${params.p} (x = ${params.q} is extraneous)`, `${id}: ${source}: the summary names the genuine and the extraneous value`);
        assert.ok(review.reasoning[1].includes(`x = ${params.p} or x = ${params.q}`), `${id}: ${source}: the quadratic's solutions`);
        assert.ok(review.reasoning[2].includes(`x = ${params.p} works`) && review.reasoning[2].includes(`x = ${params.q} does not`), `${id}: ${source}: the check`);
      } else {
        // a·ⁿ√(mx + b) + c = d: one candidate, x = (s^n - b)/m, and it is genuine.
        const expected = (params.s ** params.n - params.b) / params.m;
        assert.equal(Number.isInteger(expected), true, `${id}: ${source}: an integer answer`);
        assert.deepEqual(solved.candidates.map(rationalToText), [String(expected)], `${id}: ${source}`);
        assert.deepEqual(solved.genuine.map(rationalToText), [String(expected)], `${id}: ${source}`);
        assert.equal(parsed.shape.index, params.n, `${id}: the root index is the family's n`);
        assert.equal(solved.outcome, 'hasSolutions');
        const review = question.solutionReview;
        assert.ok(review.reasoning[0].includes(`the root equals ${params.s}.`), `${id}: ${source}: the isolated root is s = ${params.s}`);
        assert.ok(review.reasoning[1].includes(`= (${params.s})^${params.n}.`), `${id}: ${source}: raised to the power n = ${params.n}`);
        assert.ok(review.answerSummary.endsWith(`= (${params.s})^${params.n}, then solve for x`), `${id}: ${source}`);
      }
      // No placeholder is left for a student to read as written.
      assert.doesNotMatch(JSON.stringify(question.solutionReview), /\{\{|\}\}/, `${id}: ${source}: the worked solution is fully filled`);

      // The equation the workspace opens IS the equation the prompt shows.
      const shown = parseRadicalEquation(mathOf(question.prompt), { variable: question.solveFor });
      assert.equal(shown.ok, true, `${id}: the prompt's ${mathOf(question.prompt)} reads (${shown.reason})`);
      const sameShape = (a, b) => JSON.stringify([a.index, a.radicand, a.alpha, a.isolated, a.radicalSide]) === JSON.stringify([b.index, b.radicand, b.alpha, b.isolated, b.radicalSide]);
      assert.equal(sameShape(shown.shape, parsed.shape), true, `${id}: prompt "${mathOf(question.prompt)}" vs equation "${source}"`);
    }
    totals[id] = count;
    assert.ok(count >= RECOVERY_MINIMUM_CAPACITY, `${id}: ${count} versions, far more than Recovery's minimum of ${RECOVERY_MINIMUM_CAPACITY}`);
    if (id === 'srh-p-2') assert.deepEqual([...indices].sort(), [4, 5], 'Practice 2 deals 4th and 5th roots');
    if (id === 'srh-dol-3') assert.deepEqual([...indices].sort(), [3, 4, 5], 'DOL 3 deals cube, 4th and 5th roots');
  }
  assert.deepEqual(totals, { 'srh-p-1': 5148, 'srh-p-2': 16200, 'srh-dol-1': 5148, 'srh-dol-3': 27000 }, 'the whole generated space, checked');
});

// ---------------------------------------------------------------------------
// Graded by the server, from the pinned version
// ---------------------------------------------------------------------------

const ASSIGNMENT_ID = 'asg-radical-lesson';
const STORAGE_INDEX = { 'srh-p-1': 16, 'srh-p-2': 17, 'srh-dol-1': 27, 'srh-dol-3': 29 };

/** A student's version, held the way the server holds it: reproduced from its pin, then the delivered question. */
const pinnedVersion = (id, seat) => {
  const template = compiledById[id];
  const resolved = resolveFamilyQuestionInstance({
    question: template,
    assignmentId: ASSIGNMENT_ID,
    storageIndex: STORAGE_INDEX[id],
    allocation: { seat, variant: 0, stride: 1, index: seat, basis: 'preview' },
  });
  assert.ok(!resolved.error, resolved.error);
  const reproduced = reproduceFamilyQuestionFromPin({ question: template, assignmentId: ASSIGNMENT_ID, storageIndex: STORAGE_INDEX[id], pin: resolved.delivery });
  assert.ok(!reproduced.error, reproduced.error);
  assert.equal(relationSourceFromQuestion(reproduced.question), relationSourceFromQuestion(resolved.question), 'the pin reproduces the same equation');
  return deliveredQuestionForGrading(reproduced.question);
};

const finishedWork = (question, { decide = null, set = null, skip = null } = {}) => {
  const parsed = parseRadicalEquation(relationSourceFromQuestion(question), { variable: question.solveFor });
  const expected = solveRadicalShape(parsed.shape);
  const variable = question.solveFor;
  const checks = {};
  expected.candidates.forEach((candidate) => {
    if (skip && skip(candidate)) return;
    const sides = radicalSidesAt(parsed.shape, candidate);
    const truth = expected.genuine.some((genuine) => genuine.n === candidate.n && genuine.d === candidate.d) ? 'valid' : 'extraneous';
    checks[rationalToText(candidate)] = { choice: decide ? decide(candidate, truth) : truth, left: rationalToText(sides.left), right: rationalToText(sides.right) };
  });
  return relationWorkspaceWork({
    relationState: {
      ...parseRelationSource(relationSourceFromQuestion(question), variable),
      branches: expected.candidates.map((candidate) => ({ expressions: [variable, rationalToText(candidate)], relations: ['='] })),
      connective: expected.candidates.length > 1 ? 'OR' : null,
    },
    candidateChecks: checks,
    solutionSet: set || (expected.genuine.length ? { none: false, values: expected.genuine.map(rationalToText) } : { none: true }),
  });
};
const grade = (question, work) => gradeServerResponse({ question, response: buildToolResponse({ question, toolId: 'stepAlgebra', work }) });

test('the server holds every pinned version authoritatively on the relation surface and marks the honest solve right, each miss wrong', () => {
  for (const id of FAMILIES) {
    // Seats spread across the family: the walk lands on different parameters at each.
    for (let seat = 0; seat < 24; seat += 1) {
      const question = pinnedVersion(id, seat * 37);
      const support = serverResponseGradingSupport(question);
      assert.equal(support.supported, true, `${id}/${seat}: ${support.reason}`);
      assert.equal(support.surfaceId, 'stepAlgebra', `${id}/${seat}`);
      assert.equal(support.mode, 'relation', `${id}/${seat}`);
      assert.equal(support.authority, 'shared-server-authoritative', `${id}/${seat}: marked by the server, not left to the device`);

      const honest = grade(question, finishedWork(question));
      assert.equal(honest.graded, true, `${id}/${seat}: ${honest.reason}`);
      assert.equal(honest.isCorrect, true, `${id}/${seat}: ${relationSourceFromQuestion(question)}`);
      assert.equal(honest.score, 1);

      const solved = solveRadicalShape(parseRadicalEquation(relationSourceFromQuestion(question), { variable: question.solveFor }).shape);
      // No check made for the first candidate: unfinished, never right.
      const skipped = grade(question, finishedWork(question, { skip: (candidate) => rationalToText(candidate) === rationalToText(solved.candidates[0]) }));
      assert.equal(skipped.isComplete, false, `${id}/${seat}: a missing check`);
      assert.equal(skipped.isCorrect, false);
      // "No real solution" where a solution exists.
      const falseNone = grade(question, finishedWork(question, { set: { none: true } }));
      assert.equal(falseNone.isCorrect, false, `${id}/${seat}: a false no-solution claim`);
      assert.equal(falseNone.isComplete, true);
      // Every candidate called valid.
      if (solved.extraneous.length) {
        const keptAll = grade(question, finishedWork(question, { decide: () => 'valid', set: { none: false, values: solved.candidates.map(rationalToText) } }));
        assert.equal(keptAll.isCorrect, false, `${id}/${seat}: the extraneous candidate kept`);
        assert.equal(keptAll.parts.find((part) => part.id === 'relation-work').isCorrect, true, 'the algebra itself was right');
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The honest path is accepted, step by step
// ---------------------------------------------------------------------------

test('the honest solve of generated versions of every family is accepted, step by step, by the workspace\'s validator AND the server\'s step verifier', () => {
  for (const id of FAMILIES) {
    for (let seat = 0; seat < 30; seat += 1) {
      const question = pinnedVersion(id, seat * 53 + 5);
      const source = relationSourceFromQuestion(question);
      const path = honestPath(source, question.solveFor);
      assert.ok(path.steps.length >= 2, `${id}/${seat}: ${source} has steps`);
      let record = emptyQuestionRecord();
      path.steps.forEach((entry, index) => {
        const where = `${id}/${seat} ${source}: step ${index + 1} "${entry.label}"`;
        assert.equal(validateRelationTransition(entry.before, entry.after, entry.transition).valid, true, `${where}: the workspace accepts it`);
        const stepWork = JSON.parse(JSON.stringify(normalizeStepWork(relationStepWork({ kind: entry.kind, label: entry.label, before: entry.before, after: entry.after, transition: entry.transition }))));
        const outcome = verifyStepAlgebraStep({ question, record, stepWork });
        assert.equal(outcome.eligible, true, `${where}: ${outcome.reason}`);
        assert.equal(outcome.verified, true, `${where}: ${outcome.reason}`);
        assert.equal(outcome.stepGrade.earned, 1, where);
        record = recordQuestionStep({
          record, stepGrade: outcome.stepGrade, countsAttempt: outcome.countsAttempt, statePatch: outcome.statePatch, maximumAttempts: 3, occurredAt: Date.parse('2026-11-12T15:00:00Z'),
        }).record;
      });
      // The path ends on the candidates, and they are the exact solution's.
      const ended = path.final.branches.map((branch) => branch.expressions[1]);
      assert.deepEqual(ended.map(String).sort(), path.expected.candidates.map(rationalToText).sort(), `${id}/${seat}: ${source} ends on its candidates`);
    }
  }
});

test('the lesson\'s own worked examples, end to end on the server: the candidates, the rejection, the answer', () => {
  const expectations = {
    'srh-cw-1': { equation: 'sqrt(x + 4) + 2 = x', candidates: ['0', '5'], genuine: ['5'] },
    'srh-cw-2': { equation: 'sqrt(5x - 1) = 2x - 1', candidates: ['1/4', '2'], genuine: ['2'] },
    'srh-cw-9': { equation: 'sqrt(1.5h) = 6', candidates: ['24'], genuine: ['24'] },
    'srh-p-3': { equation: 'sqrt(3x + 1) + 1 = x', candidates: ['0', '5'], genuine: ['5'] },
    'srh-p-4': { equation: 'sqrt(2x + 2) = 3x - 1', candidates: ['-1/9', '1'], genuine: ['1'] },
  };
  for (const [id, expected] of Object.entries(expectations)) {
    const question = deliveredQuestionForGrading(compiledById[id]);
    assert.equal(relationSourceFromQuestion(question).replace(/\s+/g, ' '), expected.equation.replace(/\s+/g, ' '), id);
    const solved = solveRadicalShape(parseRadicalEquation(relationSourceFromQuestion(question), { variable: question.solveFor }).shape);
    assert.deepEqual(solved.candidates.map(rationalToText), expected.candidates, `${id}: candidates`);
    assert.deepEqual(solved.genuine.map(rationalToText), expected.genuine, `${id}: genuine`);
    assert.equal(grade(question, finishedWork(question)).isCorrect, true, `${id}: the honest solve`);
    assert.equal(serverResponseGradingSupport(question).authority, 'shared-server-authoritative', id);
    // The path a student takes.
    const path = honestPath(relationSourceFromQuestion(question), question.solveFor);
    path.steps.forEach((entry) => assert.equal(validateRelationTransition(entry.before, entry.after, entry.transition).valid, true, `${id}: ${entry.label}`));
  }
});

test('the worked solutions of the five single-equation items state exactly what the exact model computes', () => {
  const sayings = {
    'srh-cw-1': { sides: { 0: ['4', '0'], 5: ['5', '5'] }, text: ['x = 0: √4 + 2 = 4, but the right side is 0', 'x = 5: √9 + 2 = 5, and the right side is 5'] },
    'srh-cw-2': { sides: { '1/4': ['1/2', '-1/2'], 2: ['3', '3'] }, text: ['√(5/4 − 1) = √(1/4) = 1/2, but 2(1/4) − 1 = −1/2', '√9 = 3, and 2(2) − 1 = 3'] },
    'srh-p-3': { sides: { 0: ['2', '0'], 5: ['5', '5'] }, text: ['x = 0: √1 + 1 = 2, but the right side is 0', 'x = 5: √16 + 1 = 5, and the right side is 5'] },
    'srh-p-4': { sides: { '-1/9': ['4/3', '-4/3'], 1: ['2', '2'] }, text: ['√(16/9) = 4/3, but 3(−1/9) − 1 = −4/3', '√4 = 2, and 3(1) − 1 = 2'] },
  };
  for (const [id, saying] of Object.entries(sayings)) {
    const question = compiledById[id];
    const parsed = parseRadicalEquation(relationSourceFromQuestion(question), { variable: question.solveFor });
    for (const [candidate, [left, right]] of Object.entries(saying.sides)) {
      const [n, d = '1'] = candidate.split('/');
      const at = radicalSidesAt(parsed.shape, { n: Number(n), d: Number(d) });
      assert.deepEqual([rationalToText(at.left), rationalToText(at.right)], [left, right], `${id}: at ${candidate}`);
    }
    const reasoning = question.solutionReview.reasoning.join(' ');
    saying.text.forEach((fragment) => assert.ok(reasoning.includes(fragment), `${id}: the worked solution says "${fragment}"`));
  }
  assert.match(compiledById['srh-cw-9'].solutionReview.reasoning.join(' '), /1\.5h = 36[\s\S]*h = 24[\s\S]*√36 = 6/);
  assert.equal(compiledById['srh-cw-9'].solutionReview.answerSummary, 'h = 24: the lookout must be 24 feet high');
});
