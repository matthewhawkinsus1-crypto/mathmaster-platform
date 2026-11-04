/*
 * ALGEBRA I · MODULE 3 · TOPIC 1 · LESSON 2 — LITERAL EQUATIONS, REGULAR AND
 * HONORS, AS A TEACHER IMPORTS THEM.
 *
 * teacher-import-jsons/algebra1-module3/T1_L2_Literal_Equations.json and its
 * Honors file, written by scripts/content/build-algebra1-m3-literal-equations.mjs:
 * each one 90-minute block in four sections (Warm-Up, Classwork, Practice,
 * DOL). The files are read the way the platform reads them — the teacher
 * import, Pre-Flight, the Question Family engine and the graders the browser
 * and the server run — and held to what a student needs from them:
 *
 *   - every formula is solved in the step-by-step workspace, where a finished,
 *     equivalent answer is right in any form (w = (P − 2l)/2 and w = P/2 − l)
 *     and the formula left as it was is not; the keys below are written here,
 *     by hand, and every generated version's key is re-derived from the
 *     numbers the student reads;
 *   - the Warm-Up and the DOL are Question Family slots, so Recovery is ready;
 *   - the Classwork is short enough to go over in 15–20 minutes and the
 *     Practice is long;
 *   - the Honors file is the same lesson (the same Classwork) at Honors depth,
 *     meets the Honors contract on its own, and is what Pre-Flight's Honors
 *     version keeps, with nothing replaced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { L2_LITERAL_EQUATIONS, L2_LITERAL_EQUATIONS_HONORS, expectedFileText } from '../../scripts/content/build-algebra1-m3-literal-equations.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { equationWorkspaceWork, workGraderForQuestion } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { HONORS_CCMR_STATUS, confirmHonorsCandidateForCreate } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import {
  VERSIONS,
  auditedItemFindings,
  backUpFindings,
  compiled,
  directionFindings,
  dolSupportFindings,
  honorsCandidateOf,
  keyFindings,
  preflightFindings,
  readRepoFile,
  reviewedModel,
  supportFindings,
  versionsOf,
} from './helpers/lessonFileChecks.mjs';

const load = (entry) => {
  const text = readRepoFile(entry.file);
  const lesson = JSON.parse(text);
  const { model, questions } = compiled(text);
  const byId = (id) => {
    const question = questions.find((candidate) => candidate.questionId === id);
    assert.ok(question, `${id} compiles`);
    return question;
  };
  const sectionOf = (role) => lesson.sections.find((section) => section.role === role);
  return { entry, name: lesson.assignment.title, text, lesson, model, questions, byId, sectionOf };
};
const REGULAR = load(L2_LITERAL_EQUATIONS);
const HONORS = load(L2_LITERAL_EQUATIONS_HONORS);

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
 * Each formula, solved by hand, by the equation the workspace opens and the
 * letter it asks for: [the key, another finished form of it].
 */
const SOLVED = {
  'P = 2l + 2w|w': ['(P - 2l)/2', 'P/2 - l'],
  'C = (5/9)(F - 32)|F': ['(9/5)C + 32', '1.8C + 32'],
  'A = (1/2)*h*(b_1 + b_2)|h': ['2A/(b_1 + b_2)', '(2A)/(b_2 + b_1)'],
  'A = l*w|l': ['A/w', 'A*w^(-1)'],
  'd = r*t|t': ['d/r', '(1/r)d'],
  'I = P*r*t|t': ['I/(P*r)', '(I/P)/r'],
  'C = 2*pi*r|r': ['C/(2*pi)', '(C/2)/pi'],
  'P = 2l + 2w|l': ['(P - 2w)/2', 'P/2 - w'],
  'y = m*x + b|x': ['(y - b)/m', 'y/m - b/m'],
  'A = (1/2)*b*h|h': ['2A/b', '(2/b)A'],
  'V = (1/3)*B*h|h': ['3V/B', '(3/B)V'],
  'S = 2*pi*r*h|r': ['S/(2*pi*h)', '(S/h)/(2*pi)'],
  'F = (9/5)*C + 32|C': ['(5/9)(F - 32)', '(5F - 160)/9'],
  'A = (1/2)*h*(b_1 + b_2)|b_1': ['2A/h - b_2', '(2A - b_2 h)/h'],
  // Products of capitals are written out: the parser reads D(…) as a function and DZ as one name.
  'Z = A/B + C/D|C': ['D*(Z - A/B)', 'D*Z - A*D/B'],
  // Honors
  'P = 2(l + w)|w': ['P/2 - l', '(P - 2l)/2'],
  'Z = A/B + C/D|D': ['C/(Z - A/B)', 'B*C/(B*Z - A)'],
  'A = x*B + x*C|x': ['A/(B + C)', 'A/(C + B)'],
};

/* Slope-intercept rewrites, by equation: [m, b, a finished but unsimplified form]. */
const REWRITTEN = {
  '8x - 2y = 12': [4, -6, '(12 - 8x)/(-2)'],
  '6x + 2y = 10': [-3, 5, '(10 - 6x)/2'],
  '4x - 3y = 12': ['4/3', -4, '(12 - 4x)/(-3)'],
  'y - 3 = 2(x + 4)': [2, 11, '2(x + 4) + 3'],
  'y + 1 = -(1/2)(x - 6)': ['-1/2', 2, '-(1/2)(x - 6) - 1'],
};

/*
 * Each generated formula's shape, and its solution from its own numbers: a
 * version is solved from the equation the student reads, never from its key.
 */
const GENERATED_SHAPES = [
  { pattern: /^(\d+)x \+ y = (-?\d+)$/, solve: ([a, c]) => `${c} - ${a}x` },
  { pattern: /^(\d*)x ([+-]) (\d+)y = (-?\d+)$/, solve: ([A, sign, B, C]) => `(${C} - ${A || 1}x)/(${sign === '-' ? -B : B})` },
  { pattern: /^T = (\d+) \+ (\d+)h$/, solve: ([f, r]) => `(T - ${f})/${r}` },
  { pattern: /^C = (\d+) \+ (\d+)v$/, solve: ([f, r]) => `(C - ${f})/${r}` },
  { pattern: /^C = (\d+) \+ (\d+)\(h - (\d+)\)$/, solve: ([f, r, k]) => `(C - ${f})/${r} + ${k}` },
];
const isGeneratedHere = (question) => question.questionFamily?.scope === 'assignment';

for (const L of [REGULAR, HONORS]) {
  const { entry, name, text, lesson, model, questions, sectionOf } = L;

  test(`${name}: the committed file is exactly what its builder writes`, () => {
    assert.equal(text, expectedFileText(entry), `run node scripts/content/build-algebra1-m3-literal-equations.mjs and commit ${entry.file}`);
  });

  test(`${name}: one 90-minute block — a 3-question Warm-Up, Classwork to go over in 15–20 minutes, a long Practice and a one-try, hint-free DOL`, () => {
    assert.match(lesson.assignment.title, /^[A-Z][A-Za-z ]+ \(M3 T1 L2\)$/);
    assert.equal(lesson.assignment.courseId, 'algebra1');
    assert.equal(/courseLevel|isHonors/.test(text), false, 'Honors placement comes from the destination class, never from the file');
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

  test(`${name}: Pre-Flight shows a teacher nothing to fix, and the Warm-Up and DOL back Recovery`, () => {
    assert.deepEqual(preflightFindings(text), []);
    ['hintAnswers', 'attemptFeedback'].forEach((group) => assert.deepEqual(model[group]?.warnings || [], [], group));
    const generation = reviewedModel(text).questionGeneration;
    assert.equal(generation.recoveryReadiness.fullyReady, true);
    assert.equal(generation.recovery.warmup.status, 'ready');
    assert.equal(generation.recovery.dol.status, 'ready');
  });

  test(`${name}: every Warm-Up and DOL question is a Recovery-eligible Question Family slot — a registered family or the lesson's own generator`, () => {
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

  test(`${name}: Practice counts toward DOL Recovery — it practises the DOL's own TEKS`, () => {
    const dolStandards = new Set(sectionOf('dol').questions.map((question) => question.standard));
    const practising = sectionOf('practice').questions.filter((question) => dolStandards.has(question.standard));
    assert.ok(practising.length >= 8, `${practising.length} Practice questions share a DOL standard`);
  });

  test(`${name}: every typed key in every version is accepted, and a wrong answer is refused`, () => {
    const { problems, versionsChecked } = keyFindings(questions);
    assert.deepEqual(problems, []);
    assert.ok(versionsChecked >= VERSIONS, `${versionsChecked} versions graded`);
  });

  test(`${name}: every formula is graded on the work, not the spelling — any finished, equivalent form is right; a wrong one, or the formula left unsolved, is not`, () => {
    const formulas = questions.filter((question) => question.type === 'stepAlgebra' && !question.questionFamily && !question.targetForm);
    assert.ok(formulas.length >= 10, `${formulas.length} formulas`);
    formulas.forEach((question) => {
      const equation = equationOf(question);
      const letter = question.solveFor;
      const solved = SOLVED[`${equation}|${letter}`];
      assert.ok(solved, `${question.questionId}: ${equation} for ${letter} is solved by hand above`);
      const [key, alternate] = solved;
      assert.equal(verdict(question, letter, key), true, `${question.questionId}: ${letter} = ${key}`);
      assert.equal(verdict(question, key, letter), true, `${question.questionId}: ${key} = ${letter}`);
      assert.equal(verdict(question, letter, alternate), true, `${question.questionId}: ${letter} = ${alternate}`);
      assert.equal(verdict(question, letter, `(${key}) + 1`), false, `${question.questionId}: a wrong expression`);
      assert.equal(verdict(question, letter, equation.split('=')[1]), false, `${question.questionId}: the formula left as it was`);
    });
  });

  test(`${name}: a slope-intercept rewrite is finished only as y = mx + b`, () => {
    const rewrites = questions.filter((question) => question.type === 'stepAlgebra' && question.targetForm === 'slopeIntercept');
    assert.ok(rewrites.length >= 3, `${rewrites.length} rewrites`);
    rewrites.forEach((question) => {
      const rewritten = REWRITTEN[equationOf(question)];
      assert.ok(rewritten, `${question.questionId}: ${equationOf(question)} is rewritten by hand above`);
      const [m, b, unsimplified] = rewritten;
      assert.equal(verdict(question, 'y', `(${m})x + (${b})`), true, `${question.questionId}: y = ${m}x + ${b}`);
      assert.equal(verdict(question, 'y', `(${m})x + (${b + 1})`), false, `${question.questionId}: a wrong intercept`);
      assert.equal(verdict(question, 'y', unsimplified), false, `${question.questionId}: y alone but not yet y = mx + b`);
    });
  });

  test(`${name}: every generated formula, in every version, is solved from the numbers the student reads`, () => {
    const generated = questions.filter((question) => question.type === 'stepAlgebra' && isGeneratedHere(question));
    assert.ok(generated.length >= 3, `${generated.length} generated formulas`);
    generated.forEach((question) => {
      const versions = versionsOf(question);
      assert.ok(versions.length >= VERSIONS, `${question.questionId}: ${versions.length} versions`);
      versions.forEach((version) => {
        assert.doesNotMatch(JSON.stringify(version), /\{\{/, `${question.questionId}: no placeholder is left`);
        const equation = equationOf(version);
        const shape = GENERATED_SHAPES.find(({ pattern }) => pattern.test(equation));
        assert.ok(shape, `${question.questionId}: ${equation} has a shape solved above`);
        assert.ok(version.prompt.includes(`$${equation}$`), `${question.questionId}: the student reads ${equation}`);
        const key = shape.solve(shape.pattern.exec(equation).slice(1));
        assert.equal(verdict(version, version.solveFor, key), true, `${question.questionId}: ${version.solveFor} = ${key}`);
        assert.equal(verdict(version, version.solveFor, `(${key}) + 1`), false, `${question.questionId}: a wrong expression`);
        assert.equal(verdict(version, version.solveFor, equation.split('=')[1]), false, `${question.questionId}: left unsolved`);
      });
    });
  });

  test(`${name}: accommodations — authored Break it down steps, hints, a back-up step and a worked solution everywhere but the DOL`, () => {
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
}

/* ------------------------------------------------------------- the numbers */

const near = (value) => String(Math.round(value * 1e9) / 1e9);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** Ax + By = C: integers, A > 0, no common factor, and the line through the given points with the given slope. */
const sameLine = (question, slope, points) => {
  const [A, B, C] = ['A', 'B', 'C'].map((name) => Number(question.answerFields.find((field) => field.id === name).answer));
  assert.ok(A > 0 && [A, B, C].every(Number.isInteger) && gcd(gcd(A, B), C) === 1, `${question.questionId}: ${A}x + ${B}y = ${C} is in standard form`);
  assert.equal(-A / B, slope, `${question.questionId}: slope`);
  points.forEach(([x0, y0]) => assert.equal(A * x0 + B * y0, C, `${question.questionId}: passes through (${x0}, ${y0})`));
};

test('Literal Equations: every number a student types is re-derived from the givens in its prompt, not read back from the key', () => {
  const field = (id, fieldId) => String(REGULAR.byId(id).answerFields.find((entry) => entry.id === fieldId).answer);
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
  sameLine(REGULAR.byId('m3t1l2-cw-4'), 0.5, [[1, -7]]); // y + 7 = 0.5(x − 1)
  sameLine(REGULAR.byId('m3t1l2-pr-15'), -4, [[0, 3]]); // y = −4x + 3
  sameLine(REGULAR.byId('m3t1l2-pr-16'), 0.5, [[-3, 5]]);
  sameLine(REGULAR.byId('m3t1l2-pr-17'), -4, [[2, 1]]);
});

test('Literal Equations: every generated trapezoid has a whole-number height, re-derived from the area and bases the student reads', () => {
  ['m3t1l2-pr-25', 'm3t1l2-dol-3'].forEach((id) => {
    versionsOf(REGULAR.byId(id)).forEach((version) => {
      const area = Number(/area of (\d+) square/.exec(version.prompt)?.[1]);
      const [b1, b2] = (/(?:bases of|feet and) (\d+) (?:cm|feet) and (\d+)/.exec(version.prompt) || /are (\d+) feet and (\d+) feet/.exec(version.prompt) || []).slice(1).map(Number);
      assert.ok(area && b1 && b2, `${id}: reads its numbers (${version.prompt})`);
      const height = (2 * area) / (b1 + b2);
      assert.ok(Number.isInteger(height), `${id}: ${height}`);
      assert.equal(String(version.answerFields.find((field) => field.id === 'height').answer), String(height), `${id}: area ${area}, bases ${b1} and ${b2}`);
    });
  });
});

/* ------------------------------------------------------------------ Honors */

const deepCount = (questions) => questions.filter((question) => ['classwork', 'practice'].includes(question.sectionId) && Number(question.dok) >= 3).length;

test('Literal Equations Honors: the same lesson as the regular file — same folder and Classwork — with more DOK 3 reasoning', () => {
  assert.equal(HONORS.lesson.assignment.title, REGULAR.lesson.assignment.title.replace(/ \(M3 /, ' Honors (M3 '));
  assert.equal(HONORS.lesson.assignment.folder, REGULAR.lesson.assignment.folder);
  const prompts = (L) => L.sectionOf('classwork').questions.map((question) => question.prompt);
  assert.deepEqual(prompts(HONORS), prompts(REGULAR), 'both classes are taught the same lesson from the same slides');
  const honorsDeep = deepCount(reviewedModel(HONORS.text).questions);
  const regularDeep = deepCount(reviewedModel(REGULAR.text).questions);
  assert.ok(honorsDeep > regularDeep && honorsDeep >= 4, `DOK 3+ in Classwork and Practice: Honors ${honorsDeep}, regular ${regularDeep}`);
  assert.equal(REGULAR.sectionOf('practice').questions.some((question) => question.ccmrSource), false, 'the regular file authors no CCMR items');
});

test('Literal Equations Honors: the file meets the Honors contract itself, with audited CCMR items equal to the bank\'s', () => {
  const model = reviewedModel(HONORS.text);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const report = inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: true });
  assert.deepEqual(report.missing, []);
  assert.equal(report.depthCount, 4);
  assert.equal(report.fullContractReady, true);
  assert.deepEqual(auditedItemFindings(HONORS.lesson), []);
  // Pre-Flight sources about 15% of a full Practice from the bank
  // (ccmrAssignmentBank.ensureAuditedCcmrPractice): authoring that many keeps
  // every one of the lesson's own Practice questions.
  const practice = HONORS.sectionOf('practice').questions;
  assert.equal(practice.filter((question) => question.ccmrSource).length, Math.max(1, Math.round(practice.length * 0.15)));
});

test('Literal Equations Honors: the Honors version Pre-Flight builds is READY, replaces nothing, keeps the Warm-Up and DOL, and is what Create accepts', () => {
  const model = reviewedModel(HONORS.text);
  const candidate = honorsCandidateOf(model.assignmentV5);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.sourced.length, 0, 'the file already holds its CCMR Practice: nothing is swapped in');
  assert.ok(candidate.targetCount >= 1);
  assert.equal(candidate.sourcedCount, candidate.targetCount);
  ['warmup', 'dol'].forEach((role) => {
    const of = (assignment) => assignment.sections.filter((section) => section.role === role).flatMap((section) => section.questions);
    assert.deepEqual(of(candidate.assignmentV5), of(model.assignmentV5), `the ${role} is the file's own`);
  });
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
      honorsSelected: true,
      honorsReport: candidate.honorsReport,
      honorsCcmr: { status: candidate.status, errors: candidate.errors },
    }),
    validationErrors: [],
    bundleIsValid: true,
  });
  assert.equal(readiness.canCreate, true);
  const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: model.assignmentV5, honorsEnrichmentQuestion: null });
  assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
});

test('Literal Equations Honors: every number a student types is re-derived from the givens, and a question shared with the regular file keeps its key', () => {
  const regularByPrompt = new Map(REGULAR.questions.map((question) => [question.prompt, question]));
  const shared = HONORS.questions.filter((question) => question.type === 'multiAnswer' && !question.questionFamily && regularByPrompt.has(question.prompt));
  assert.ok(shared.length >= 10, `${shared.length} shared questions`);
  shared.forEach((question) => assert.deepEqual(question.answerFields, regularByPrompt.get(question.prompt).answerFields, `${question.questionId} keeps the regular key`));
  const field = (id, fieldId) => String(HONORS.byId(id).answerFields.find((entry) => entry.id === fieldId).answer);
  // The line through (−2, 7) and (4, −2): slope −9/6.
  sameLine(HONORS.byId('m3t1l2h-pr-10'), (-2 - 7) / (4 - -2), [[-2, 7], [4, -2]]);
  // F = 3 + 2m + 0.5t with t = 18 and F = 26.
  assert.equal(field('m3t1l2h-pr-20', 'miles'), near((26 - 3 - 0.5 * 18) / 2));
  // h = 3V/B with V = 60 and B = 15.
  assert.equal(field('m3t1l2h-pr-21', 'height'), near((3 * 60) / 15));
  // x = (y − b)/m cannot divide by the slope 0.
  assert.equal(field('m3t1l2h-pr-22', 'm'), '0');
});

test('Literal Equations Honors: every generated trapezoid has a whole-number other base, re-derived from the area, height and base the student reads', () => {
  ['m3t1l2h-pr-19', 'm3t1l2h-dol-3'].forEach((id) => {
    const versions = versionsOf(HONORS.byId(id));
    assert.ok(versions.length >= VERSIONS, `${id}: ${versions.length} versions`);
    versions.forEach((version) => {
      const [area, height, base] = [/area of (\d+) square/, /height of (\d+)/, /one base of (\d+)/].map((pattern) => Number(pattern.exec(version.prompt)?.[1]));
      assert.ok(area && height && base, `${id}: reads its numbers (${version.prompt})`);
      const other = (2 * area) / height - base;
      assert.ok(Number.isInteger(other) && other > 0, `${id}: ${other}`);
      assert.equal(String(version.answerFields.find((field) => field.id === 'base').answer), String(other), `${id}: area ${area}, height ${height}, base ${base}`);
    });
  });
});
