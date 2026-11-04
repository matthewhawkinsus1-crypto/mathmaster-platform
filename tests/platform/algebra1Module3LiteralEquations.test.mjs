/*
 * ALGEBRA I · MODULE 3 · TOPIC 1 · LESSON 2 — LITERAL EQUATIONS, AS A TEACHER
 * IMPORTS IT.
 *
 * teacher-import-jsons/algebra1-module3/T1_L2_Literal_Equations.json, written
 * by scripts/content/build-algebra1-m3-literal-equations.mjs: one 90-minute
 * block in four sections (Warm-Up, Classwork, Practice, DOL). The file is read
 * the way the platform reads it — the teacher import, Pre-Flight, the Question
 * Family engine and the graders the browser and the server run — and held to
 * what a student needs from it:
 *
 *   - every formula is solved in the step-by-step workspace, where a finished,
 *     equivalent answer is right in any form (w = (P − 2l)/2 and w = P/2 − l)
 *     and the formula left as it was is not; the keys below are written here,
 *     by hand, and every generated version's key is re-derived from the
 *     numbers the student reads;
 *   - the Warm-Up and the DOL are Question Family slots, so Recovery is ready;
 *   - the Classwork is short enough to go over in 15–20 minutes and the
 *     Practice is long.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { L2_LITERAL_EQUATIONS, expectedFileText } from '../../scripts/content/build-algebra1-m3-literal-equations.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { equationWorkspaceWork, workGraderForQuestion } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  VERSIONS,
  backUpFindings,
  compiled,
  directionFindings,
  dolSupportFindings,
  keyFindings,
  preflightFindings,
  readRepoFile,
  reviewedModel,
  supportFindings,
  versionsOf,
} from './helpers/lessonFileChecks.mjs';

const text = readRepoFile(L2_LITERAL_EQUATIONS.file);
const lesson = JSON.parse(text);
const { model, questions } = compiled(text);
const byId = (id) => {
  const question = questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} compiles`);
  return question;
};
const sectionOf = (role) => lesson.sections.find((section) => section.role === role);
/** The equation the workspace opens (a generated version carries it as equationLatex). */
const equationOf = (question) => String(question.equation ?? question.equationLatex ?? '');

/** The workspace's verdict on a finished equation `left = right`, from the browser grader and from the server on the stored question. */
const verdict = (question, left, right) => {
  const browser = gradeToolCheck(workGraderForQuestion(question), question, equationWorkspaceWork({ equation: { left, right } }));
  assert.ok(browser.toolResponse, `${question.questionId}: the workspace reports its work`);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, `${question.questionId}: the server agrees with the browser on ${left} = ${right}`);
  return browser.isCorrect;
};

/*
 * Each formula, solved by hand: [question, letter, the key, another finished
 * form of it, the formula's own right side (not solved)].
 */
const FORMULAS = [
  ['m3t1l2-cw-1', 'w', '(P - 2l)/2', 'P/2 - l', '2l + 2w'],
  ['m3t1l2-cw-5', 'F', '(9/5)C + 32', '1.8C + 32', '(5/9)(F - 32)'],
  ['m3t1l2-cw-8', 'h', '2A/(b_1 + b_2)', '(2A)/(b_2 + b_1)', '(1/2)h(b_1 + b_2)'],
  ['m3t1l2-pr-1', 'l', 'A/w', 'A*w^(-1)', 'l*w'],
  ['m3t1l2-pr-2', 't', 'd/r', '(1/r)d', 'r*t'],
  ['m3t1l2-pr-3', 't', 'I/(P*r)', '(I/P)/r', 'P*r*t'],
  ['m3t1l2-pr-4', 'r', 'C/(2*pi)', '(C/2)/pi', '2*pi*r'],
  ['m3t1l2-pr-5', 'l', '(P - 2w)/2', 'P/2 - w', '2l + 2w'],
  ['m3t1l2-pr-6', 'x', '(y - b)/m', 'y/m - b/m', 'm*x + b'],
  ['m3t1l2-pr-7', 'h', '2A/b', '(2/b)A', '(1/2)*b*h'],
  ['m3t1l2-pr-8', 'h', '3V/B', '(3/B)V', '(1/3)*B*h'],
  ['m3t1l2-pr-9', 'r', 'S/(2*pi*h)', '(S/h)/(2*pi)', '2*pi*r*h'],
  ['m3t1l2-pr-18', 'C', '(5/9)(F - 32)', '(5F - 160)/9', '(9/5)*C + 32'],
  ['m3t1l2-pr-19', 'b_1', '2A/h - b_2', '(2A - b_2 h)/h', '(1/2)*h*(b_1 + b_2)'],
  // Products of capitals are written out: the parser reads D(…) as a function and DZ as one name.
  ['m3t1l2-pr-20', 'C', 'D*(Z - A/B)', 'D*Z - A*D/B', 'A/B + C/D'],
];

/* Slope-intercept rewrites: [question, m, b, a finished but unsimplified form]. */
const REWRITES = [
  ['m3t1l2-cw-3', 4, -6, '(12 - 8x)/(-2)'],
  ['m3t1l2-pr-10', -3, 5, '(10 - 6x)/2'],
  ['m3t1l2-pr-11', '4/3', -4, '(12 - 4x)/(-3)'],
  ['m3t1l2-pr-12', 2, 11, '2(x + 4) + 3'],
  ['m3t1l2-pr-13', '-1/2', 2, '-(1/2)(x - 6) - 1'],
];

/*
 * Each generated formula, solved from the equation the student reads: the
 * pattern of its equation and the solution it has, from its own numbers.
 */
const GENERATED = {
  'm3t1l2-wu-3': { pattern: /^(\d+)x \+ y = (-?\d+)$/, solve: ([a, c]) => `${c} - ${a}x` },
  'm3t1l2-pr-14': { pattern: /^(\d+)x ([+-]) (\d+)y = (-?\d+)$/, solve: ([A, sign, B, C]) => `(${C} - ${A}x)/(${sign === '-' ? -B : B})` },
  'm3t1l2-pr-24': { pattern: /^T = (\d+) \+ (\d+)h$/, solve: ([f, r]) => `(T - ${f})/${r}` },
  'm3t1l2-dol-1': { pattern: /^(\d+)x ([+-]) (\d+)y = (-?\d+)$/, solve: ([A, sign, B, C]) => `(${C} - ${A}x)/(${sign === '-' ? -B : B})` },
  'm3t1l2-dol-2': { pattern: /^C = (\d+) \+ (\d+)v$/, solve: ([f, r]) => `(C - ${f})/${r}` },
};

test('the committed file is exactly what its builder writes', () => {
  assert.equal(text, expectedFileText(), `run node scripts/content/build-algebra1-m3-literal-equations.mjs and commit ${L2_LITERAL_EQUATIONS.file}`);
});

test('one 90-minute block: a 3-question Warm-Up, Classwork to go over in 15–20 minutes, a long Practice and a one-try, hint-free DOL', () => {
  assert.match(lesson.assignment.title, /^[A-Z][A-Za-z ]+ \(M3 T1 L2\)$/);
  assert.equal(lesson.assignment.courseId, 'algebra1');
  assert.deepEqual(lesson.sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.equal(lesson.sections.reduce((minutes, section) => minutes + section.recommendedMinutes, 0), 90);
  assert.ok(sectionOf('classwork').recommendedMinutes <= 20);
  const counts = Object.fromEntries(lesson.sections.map((section) => [section.role, section.questions.length]));
  assert.equal(counts.warmup, 3);
  assert.ok(counts.classwork <= 10, `Classwork has ${counts.classwork} questions`);
  assert.ok(counts.practice >= 2 * counts.classwork, `Practice (${counts.practice}) is the long section`);
  assert.equal(counts.dol, 3);
  const dol = sectionOf('dol');
  assert.deepEqual([dol.attemptsAllowed, dol.hintsAllowed, dol.feedbackMode], [1, false, 'afterAssignmentSubmit']);
  assert.equal(questions.length, lesson.sections.reduce((total, section) => total + section.questions.length, 0), 'every question survives the import');
});

test('Pre-Flight shows a teacher nothing to fix, and the Warm-Up and DOL back Recovery', () => {
  assert.deepEqual(preflightFindings(text), []);
  ['hintAnswers', 'attemptFeedback'].forEach((group) => assert.deepEqual(model[group]?.warnings || [], [], group));
  const generation = reviewedModel(text).questionGeneration;
  assert.equal(generation.recoveryReadiness.fullyReady, true);
  assert.equal(generation.recovery.warmup.status, 'ready');
  assert.equal(generation.recovery.dol.status, 'ready');
});

test('every Warm-Up and DOL question is a Recovery-eligible Question Family slot: a registered family or the lesson\'s own generator', () => {
  ['warmup', 'dol'].forEach((role) => sectionOf(role).questions.forEach((question) => {
    const reference = question.questionFamily;
    assert.ok(reference, `${question.questionId} is generated per student`);
    if (reference.scope === 'assignment') {
      assert.ok(Object.keys(question.generator?.parameters || {}).length, `${question.questionId} has its own generator`);
      return;
    }
    const family = getPlatformQuestionFamily(reference.id, reference.version);
    assert.ok(family, `${reference.id} is registered`);
    assert.equal(family.recovery?.eligible, true, `${reference.id} may serve Recovery`);
  }));
});

test('Practice counts toward DOL Recovery: it practises the DOL\'s own TEKS', () => {
  const dolStandards = new Set(sectionOf('dol').questions.map((question) => question.standard));
  const practising = sectionOf('practice').questions.filter((question) => dolStandards.has(question.standard));
  assert.ok(practising.length >= 8, `${practising.length} Practice questions share a DOL standard`);
});

test('every typed key in every version is accepted, and a wrong answer is refused', () => {
  const { problems, versionsChecked } = keyFindings(questions);
  assert.deepEqual(problems, []);
  assert.ok(versionsChecked >= VERSIONS, `${versionsChecked} versions graded`);
});

test('every formula is graded on the work, not the spelling: any finished, equivalent form is right; a wrong one, or the formula left unsolved, is not', () => {
  FORMULAS.forEach(([id, letter, key, alternate, unsolved]) => {
    const question = byId(id);
    assert.equal(question.type, 'stepAlgebra', `${id} opens the step-by-step workspace`);
    assert.equal(question.solveFor, letter, `${id} asks for ${letter}`);
    assert.equal(verdict(question, letter, key), true, `${id}: ${letter} = ${key}`);
    assert.equal(verdict(question, key, letter), true, `${id}: ${key} = ${letter}`);
    assert.equal(verdict(question, letter, alternate), true, `${id}: ${letter} = ${alternate}`);
    assert.equal(verdict(question, letter, `(${key}) + 1`), false, `${id}: a wrong expression`);
    assert.equal(verdict(question, letter, unsolved), false, `${id}: the formula left as it was`);
  });
  // Every workspace formula in the file is in the table above or generated.
  const covered = new Set([...FORMULAS.map(([id]) => id), ...REWRITES.map(([id]) => id), ...Object.keys(GENERATED), 'm3t1l2-wu-1']);
  questions.filter((question) => question.type === 'stepAlgebra').forEach((question) => assert.ok(covered.has(question.questionId), `${question.questionId} is checked`));
});

test('a slope-intercept rewrite is finished only as y = mx + b', () => {
  REWRITES.forEach(([id, m, b, unsimplified]) => {
    const question = byId(id);
    assert.equal(question.targetForm, 'slopeIntercept', id);
    assert.equal(verdict(question, 'y', `(${m})x + (${b})`), true, `${id}: y = ${m}x + ${b}`);
    assert.equal(verdict(question, 'y', `(${m})x + (${b + 1})`), false, `${id}: a wrong intercept`);
    assert.equal(verdict(question, 'y', unsimplified), false, `${id}: y alone but not yet y = mx + b`);
  });
});

test('every generated formula, in every version, is solved from the numbers the student reads', () => {
  Object.entries(GENERATED).forEach(([id, { pattern, solve }]) => {
    const versions = versionsOf(byId(id));
    assert.ok(versions.length >= VERSIONS, `${id}: ${versions.length} versions`);
    versions.forEach((version) => {
      assert.doesNotMatch(JSON.stringify(version), /\{\{/, `${id}: no placeholder is left`);
      const equation = equationOf(version);
      const match = pattern.exec(equation);
      assert.ok(match, `${id}: ${equation} is the equation the prompt names`);
      assert.ok(version.prompt.includes(`$${equation}$`), `${id}: the student reads ${equation}`);
      const key = solve(match.slice(1));
      assert.equal(verdict(version, version.solveFor, key), true, `${id}: ${version.solveFor} = ${key}`);
      assert.equal(verdict(version, version.solveFor, `(${key}) + 1`), false, `${id}: a wrong expression`);
      assert.equal(verdict(version, version.solveFor, equation.split('=')[1]), false, `${id}: left unsolved`);
    });
  });
});

test('every number a student types is re-derived from the givens in its prompt, not read back from the key', () => {
  const field = (id, fieldId) => String(byId(id).answerFields.find((entry) => entry.id === fieldId).answer);
  const near = (value) => String(Math.round(value * 1e9) / 1e9);
  const toC = (F) => (5 / 9) * (F - 32);
  const toF = (C) => (9 / 5) * C + 32;
  assert.equal(field('m3t1l2-cw-6', 'jaydenC'), near(toC(77)));
  assert.equal(field('m3t1l2-cw-6', 'mateoF'), near(toF(30)));
  assert.ok(toF(30) > 77, 'Mateo is warmer');
  assert.equal(field('m3t1l2-cw-7', 'boiling'), near(toF(100)));
  // 3x − 2y = 8: slope −A/B, intercepts (C/A, 0) and (0, C/B).
  assert.equal(field('m3t1l2-cw-2', 'slope'), '3/2');
  assert.equal(field('m3t1l2-cw-2', 'xInt'), '(8/3, 0)');
  assert.equal(field('m3t1l2-cw-2', 'yInt'), `(0, ${8 / -2})`);
  const pi = 3.14;
  assert.equal(field('m3t1l2-cw-9', 'height'), near(37.68 / (2 * pi * 1.5)));
  assert.equal(field('m3t1l2-pr-21', 'height'), near(450 / 75));
  assert.equal(field('m3t1l2-pr-22', 'height'), near((2 * 24) / (9 + 7)));
  assert.equal(field('m3t1l2-pr-23', 'height'), near((51.81 - 2 * pi * 1.5 ** 2) / (2 * pi * 1.5)));
  // Leah's 4x + 2y = 10 is y = −2x + 5.
  assert.equal(field('m3t1l2-pr-26', 'slope'), String(-4 / 2));
  assert.equal(field('m3t1l2-pr-26', 'yIntercept'), String(10 / 2));
  // Standard form Ax + By = C: integers, A > 0, no common factor, and the same line as the givens.
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const standard = (id) => ['A', 'B', 'C'].map((name) => Number(field(id, name)));
  const sameLine = (id, slope, [x0, y0]) => {
    const [A, B, C] = standard(id);
    assert.ok(A > 0 && [A, B, C].every(Number.isInteger) && gcd(gcd(A, B), C) === 1, `${id}: ${A}x + ${B}y = ${C} is in standard form`);
    assert.equal(-A / B, slope, `${id}: slope`);
    assert.equal(A * x0 + B * y0, C, `${id}: passes through (${x0}, ${y0})`);
  };
  sameLine('m3t1l2-cw-4', 0.5, [1, -7]); // y + 7 = 0.5(x − 1)
  sameLine('m3t1l2-pr-15', -4, [0, 3]); // y = −4x + 3
  sameLine('m3t1l2-pr-16', 0.5, [-3, 5]);
  sameLine('m3t1l2-pr-17', -4, [2, 1]);
});

test('every generated trapezoid has a whole-number height, re-derived from the area and bases the student reads', () => {
  ['m3t1l2-pr-25', 'm3t1l2-dol-3'].forEach((id) => {
    versionsOf(byId(id)).forEach((version) => {
      const area = Number(/area of (\d+) square/.exec(version.prompt)?.[1]);
      const [b1, b2] = (/(?:bases of|feet and) (\d+) (?:cm|feet) and (\d+)/.exec(version.prompt) || /are (\d+) feet and (\d+) feet/.exec(version.prompt) || []).slice(1).map(Number);
      assert.ok(area && b1 && b2, `${id}: reads its numbers (${version.prompt})`);
      const height = (2 * area) / (b1 + b2);
      assert.ok(Number.isInteger(height), `${id}: ${height}`);
      assert.equal(String(version.answerFields.find((field) => field.id === 'height').answer), String(height), `${id}: area ${area}, bases ${b1} and ${b2}`);
    });
  });
});

test('accommodations: authored Break it down steps, hints, a back-up step and a worked solution everywhere but the DOL', () => {
  assert.deepEqual(directionFindings(questions), []);
  assert.deepEqual(supportFindings(lesson), []);
  assert.deepEqual(backUpFindings(questions), []);
  assert.deepEqual(dolSupportFindings(lesson), []);
  // The workspace writes no worked solution of its own, so each one is authored.
  questions.filter((question) => question.type === 'stepAlgebra').forEach((question) => {
    assert.ok(question.solutionReview?.reasoning?.length, `${question.questionId} has an authored worked solution`);
  });
  sectionOf('practice').questions.forEach((question) => assert.ok(question.attemptFeedback?.length, `${question.questionId} says what to check after a miss`));
});
