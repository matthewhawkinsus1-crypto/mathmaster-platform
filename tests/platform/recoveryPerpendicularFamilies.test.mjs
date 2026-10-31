/*
 * RECOVERY V2 — THE FAMILIES BEHIND ALGEBRA I MODULE 2 · TOPIC 2 · LESSON 3,
 * "SLOPES OF PERPENDICULAR LINES AND HORIZONTAL & VERTICAL LINES".
 *
 * The lesson went live with three static Warm-Up and three static DOL
 * questions and no family a Recovery could draw on, so Prepare Recovery said
 * "no certified family" for all six. Six new platform families
 * (functions/shared/questionFamiliesPerpendicular.mjs) stand in for them:
 *
 *   l3-wu-1   lines.rotationImages             B′, B″, B‴ after 90°, 180°, 270°
 *   l3-wu-2   lines.rotationSlopes             the slopes of AB and its rotations
 *   l3-wu-3   numbers.reciprocals              reciprocals and a negative reciprocal
 *   l3-dol-1  lines.perpendicularFromEquation  perpendicular to y = sx + b through a point
 *   l3-dol-2  lines.horizontalVertical         the horizontal and vertical line through a point
 *   l3-dol-3  lines.perpendicularFromPoints    perpendicular to the line through two points
 *
 * These tests hold each family to what a student is owed (every version is a
 * valid question its own key passes and a wrong answer fails, on the server;
 * versions are distinct and plentiful; the answer is re-derived here from the
 * prompt's givens, never read back from the family's own key), and hold the
 * lesson to what the teacher was promised: Prepare Recovery makes both
 * sections ready from these families, without touching a question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON_FILE = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const liveQuestion = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const BINDINGS = Object.freeze({
  'l3-wu-1': 'lines.rotationImages',
  'l3-wu-2': 'lines.rotationSlopes',
  'l3-wu-3': 'numbers.reciprocals',
  'l3-dol-1': 'lines.perpendicularFromEquation',
  'l3-dol-2': 'lines.horizontalVertical',
  'l3-dol-3': 'lines.perpendicularFromPoints',
});
const FAMILY_IDS = Object.values(BINDINGS);
// The rotation families draw B from an 18 × 18 grid minus its diagonals (288
// versions); horizontalVertical draws a point with h ≠ k (306). A student
// needs the original, a Practice window and the Recovery: 12 (the platform's
// RECOVERY_MINIMUM_FRESH_VERSIONS); these are the sizes the families really have.
const MINIMUM_VERSIONS = 250;

const instancesOf = (family, limit = 400) => {
  const sequence = createFamilyInstanceSequence(family, resolveFamilyConstraints(family, {}).values, 'recovery-perpendicular-family-test');
  const instances = [];
  for (let index = 0; index < limit; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    instances.push(instance);
  }
  return instances;
};
const build = (family, instance) => buildFamilyQuestion({
  family,
  instance,
  constraintValues: resolveFamilyConstraints(family, {}).values,
  authored: { questionId: 'recovery-perpendicular-test' },
  tool: family.defaultTool,
});

const respond = (question, answers) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: question.answerFields.map((field) => ({ id: field.id, value: String(answers[field.id] ?? ''), isComplete: true })),
});
const keyOf = (question) => Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer]));
const grade = (question, answers) => gradeServerResponse({ question, response: respond(question, answers) });

const number = (text) => Number(String(text).replace(/[−–]/g, '-'));
const numbersIn = (text) => (String(text).match(/[−-]?\d+/g) || []).map(number);
const ratio = (text) => {
  const [top, bottom = '1'] = String(text).split('/');
  return Number(top) / Number(bottom);
};

/* ---------------------------------------------------------------------------
 * The families themselves.
 * ------------------------------------------------------------------------- */

test('the six families are registered, recognize static questions, and are Recovery-eligible', () => {
  FAMILY_IDS.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(typeof family.recognize, 'function', `${id} can recognize a static question`);
    assert.equal(family.recovery?.eligible, true, `${id} may serve Recovery`);
    assert.ok(family.skill.alignments.some((code) => code === 'A.2F' || code === 'A.2G'), `${id} is aligned to the lesson's TEKS`);
  });
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesPerpendicular.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs'], 'no tool math, no grader, no browser module');
});

for (const id of FAMILY_IDS) {
  test(`${id}: every version (at least ${MINIMUM_VERSIONS}) builds, are valid, distinct, and are graded right and wrong by the server`, () => {
    const family = getPlatformQuestionFamily(id);
    const instances = instancesOf(family, 1000);
    assert.ok(instances.length >= MINIMUM_VERSIONS, `${id} has ${instances.length} versions`);
    const fingerprints = new Set();
    instances.forEach((instance) => {
      fingerprints.add(instance.fingerprint);
      const question = build(family, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: id }).errors, [], `${id} ${instance.fingerprint} is a valid question`);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${id} has a key response for its answer kind`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${id} ${instance.fingerprint}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong answer is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], `${id} ${instance.fingerprint}: certification's key check passes`);
    });
    assert.equal(fingerprints.size, instances.length, 'no two versions are the same problem');
  });

  test(`${id}: every wrong part is marked wrong, and each choice has exactly one right option`, () => {
    const family = getPlatformQuestionFamily(id);
    instancesOf(family, 80).forEach((instance) => {
      const question = build(family, instance);
      const key = keyOf(question);
      assert.equal(grade(question, key)?.isCorrect, true, `${id} ${instance.fingerprint}: the key is accepted`);
      question.answerFields.forEach((field) => {
        if (field.type === 'choice') {
          assert.equal(field.options.filter((option) => option === field.answer).length, 1, `${id} ${field.id}: one right option`);
          assert.equal(new Set(field.options).size, field.options.length, `${id} ${field.id}: no duplicate options`);
        }
        const wrongValue = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : '999';
        assert.notEqual(grade(question, { ...key, [field.id]: wrongValue })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong ${field.id} is not accepted`);
      });
    });
  });

  test(`${id}: a version never carries a hint, a step, a worked solution or its own answer in the prompt`, () => {
    const family = getPlatformQuestionFamily(id);
    instancesOf(family, 60).forEach((instance) => {
      const question = build(family, instance);
      ['hints', 'scaffold', 'steps', 'solution', 'workedSolution'].forEach((name) => assert.equal(question[name], undefined, `${id}: no ${name}`));
      question.answerFields.forEach((field) => {
        // A bare number such as 9 may legitimately also be a given (B(−9, 1));
        // a pair or an equation in the prompt would be the answer itself.
        if (!['orderedPair', 'equation'].includes(field.answerFormat)) return;
        assert.ok(!question.prompt.includes(field.answer), `${id} ${instance.fingerprint}: the prompt does not contain the key ${field.answer}`);
      });
    });
  });
}

/* ---------------------------------------------------------------------------
 * The mathematics, re-derived from each version's own PROMPT — never from the
 * family's key.
 * ------------------------------------------------------------------------- */

test('lines.rotationImages: each key is the rotation of the B in the prompt, and the graph shows that B', () => {
  const family = getPlatformQuestionFamily('lines.rotationImages');
  instancesOf(family, 200).forEach((instance) => {
    const question = build(family, instance);
    const [bx, by] = numbersIn(question.prompt.split('B(')[1] || question.prompt.split('B')[1]).slice(0, 2);
    const key = Object.fromEntries(Object.entries(keyOf(question)).map(([id, value]) => [id, numbersIn(value)]));
    assert.deepEqual(key.b90, [-by, bx], 'a quarter turn sends (x, y) to (−y, x)');
    assert.deepEqual(key.b180, [-bx, -by], 'a half turn sends (x, y) to (−x, −y)');
    assert.deepEqual(key.b270, [by, -bx], 'three quarter turns send (x, y) to (y, −x)');
    assert.deepEqual(question.graph.points.map((point) => point.coordinates), [[0, 0], [bx, by]], 'the graph plots A and the prompt\'s B');
    assert.ok(Math.abs(bx) <= 9 && Math.abs(by) <= 9, 'every image is on the 10 × 10 grid');
  });
});

test('lines.rotationSlopes: each slope key is the slope of the segment the prompt describes; 90° and 270° are the negative reciprocal', () => {
  const family = getPlatformQuestionFamily('lines.rotationSlopes');
  instancesOf(family, 200).forEach((instance) => {
    const question = build(family, instance);
    const [x, y] = numbersIn(question.prompt.split('B(')[1] || question.prompt.split('B')[1]).slice(0, 2);
    const key = keyOf(question);
    const slope = y / x;
    assert.ok(Math.abs(ratio(key.ab) - slope) < 1e-9, 'AB: rise over run');
    assert.ok(Math.abs(ratio(key.ab90) - (x / -y)) < 1e-9, 'A′B′ runs from the origin to (−y, x)');
    assert.ok(Math.abs(ratio(key.ab180) - slope) < 1e-9, 'a half turn keeps the slope');
    assert.ok(Math.abs(ratio(key.ab270) - (-x / y)) < 1e-9, 'A‴B‴ runs from the origin to (y, −x)');
    assert.ok(Math.abs(ratio(key.ab90) * ratio(key.ab) + 1) < 1e-9, 'perpendicular slopes multiply to −1');
    assert.equal(key.pattern90, 'the negative reciprocal');
    assert.equal(key.pattern180, 'the same');
    [key.ab, key.ab90, key.ab180, key.ab270].forEach((text) => assert.match(text, /^-?\d+(\/\d+)?$/, 'in lowest terms'));
  });
});

test('numbers.reciprocals: every key times its value is 1, and the negative reciprocal is the reciprocal with the sign changed', () => {
  const family = getPlatformQuestionFamily('numbers.reciprocals');
  instancesOf(family, 200).forEach((instance) => {
    const question = build(family, instance);
    const key = keyOf(question);
    const value = (id) => {
      const label = question.answerFields.find((field) => field.id === id).label.replace(/^(Negative reciprocal|Reciprocal) of /, '');
      return ratio(label.replace(/[−–]/g, '-'));
    };
    ['r1', 'r2', 'r3', 'r4'].forEach((id) => assert.ok(Math.abs(value(id) * ratio(key[id]) - 1) < 1e-9, `${id}: ${value(id)} × ${key[id]} = 1`));
    assert.ok(Math.abs(value('nr') * ratio(key.nr) + 1) < 1e-9, `nr: ${value('nr')} × ${key.nr} = −1`);
  });
});

test('lines.perpendicularFromEquation: the slope is the negative reciprocal of the prompt\'s, and the line passes through the prompt\'s point', () => {
  const family = getPlatformQuestionFamily('lines.perpendicularFromEquation');
  instancesOf(family, 300).forEach((instance) => {
    const question = build(family, instance);
    const [, given] = question.prompt.match(/y = (.*?) that passes through/);
    const slope = number(given.match(/^([−-]?\d*)x/)[1].replace(/^([−-]?)$/, '$11'));
    const [px, py] = numbersIn(question.prompt.split('passes through')[1]);
    const key = keyOf(question);
    assert.ok(Math.abs(ratio(key.m) * slope + 1) < 1e-9, `${key.m} is perpendicular to ${slope}`);
    const [, line, intercept = '0'] = key.eq.match(/^y=(-?\d+(?:\/\d+)?)x([+-]\d+)?$/);
    assert.ok(Math.abs(ratio(line) - ratio(key.m)) < 1e-9, 'the equation\'s slope is the slope field');
    assert.ok(Math.abs(ratio(line) * px + Number(intercept) - py) < 1e-9, `${key.eq} passes through (${px}, ${py})`);
    assert.ok(Math.abs(ratio(line)) !== 1, 'never a perpendicular slope of 1 or −1');
    assert.ok(Number.isInteger(Number(intercept)), 'a whole y-intercept');
  });
});

test('lines.horizontalVertical: y = k and x = h for the prompt\'s point, and the four choices are four different answers', () => {
  const family = getPlatformQuestionFamily('lines.horizontalVertical');
  instancesOf(family, 300).forEach((instance) => {
    const question = build(family, instance);
    const [h, k] = numbersIn(question.prompt.match(/\([^)]*\)/)[0]);
    const key = keyOf(question);
    assert.equal(key.h, `y=${k}`);
    assert.equal(key.v, `x=${h}`);
    assert.equal(key.slopeV, 'undefined');
    const options = question.answerFields.find((field) => field.id === 'slopeV').options;
    assert.deepEqual([...options].sort(), ['undefined', '0', String(h).replace('-', '−'), String(k).replace('-', '−')].sort());
  });
});

test('lines.perpendicularFromPoints: the given slope is rise over run between the prompt\'s points, and the line is perpendicular and passes through the second', () => {
  const family = getPlatformQuestionFamily('lines.perpendicularFromPoints');
  instancesOf(family, 300).forEach((instance) => {
    const question = build(family, instance);
    const [x1, y1, x2, y2] = numbersIn(question.prompt.split('Write')[0]);
    const key = keyOf(question);
    assert.ok(Math.abs(ratio(key.given) - (y2 - y1) / (x2 - x1)) < 1e-9, 'the given slope');
    const [, line, intercept = '0'] = key.eq.match(/^y=(-?\d+(?:\/\d+)?)x([+-]\d+)?$/);
    assert.ok(Math.abs(ratio(line) * ratio(key.given) + 1) < 1e-9, 'perpendicular');
    assert.ok(Math.abs(ratio(line) * x2 + Number(intercept) - y2) < 1e-9, `${key.eq} passes through (${x2}, ${y2})`);
    assert.ok(Math.abs(x1) <= 9 && Math.abs(y1) <= 9);
  });
});

/* ---------------------------------------------------------------------------
 * Each family recognizes the live question it stands in for.
 * ------------------------------------------------------------------------- */

for (const [questionId, familyId] of Object.entries(BINDINGS)) {
  test(`${questionId}: ${familyId} recognizes the live question with the same rigor and its own key, and leaves 12+ fresh versions`, () => {
    const question = liveQuestion(questionId);
    assert.ok(question, `${questionId} is in the lesson`);
    const family = getPlatformQuestionFamily(familyId);
    const recognized = family.recognize(question);
    assert.ok(recognized, `${familyId} recognizes ${questionId}`);

    const { values } = resolveFamilyConstraints(family, recognized.constraints);
    const rigor = familyDifficultyFor(family, values);
    assert.equal(Number(rigor.dok), Number(question.dok), `${questionId}: DOK`);
    assert.equal(Number(rigor.band), Number(question.difficultyBand), `${questionId}: difficulty band`);
    assert.ok(family.skill.alignments.includes(question.standard), `${questionId}: the family assesses its primary TEKS ${question.standard}`);

    // The live problem is one of the family's own versions, with the live key —
    // which is how Recovery knows never to hand it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${questionId} is a valid ${family.id} problem (${evaluated.issues})`);
    const rebuilt = build(family, evaluated.instance);
    assert.deepEqual(keyOf(rebuilt), keyOf(question), `${questionId}: the family's key for it is the live key`);
    assert.deepEqual(rebuilt.answerFields.map((field) => field.id), question.answerFields.map((field) => field.id), `${questionId}: the same fields`);
    assert.deepEqual(rebuilt.answerFields.map((field) => field.label), question.answerFields.map((field) => field.label), `${questionId}: the same labels`);

    const capacity = measureFamilyCapacity(family, values);
    assert.ok(capacity.capacity - 1 >= 12, `${questionId}: at least 12 fresh versions (capacity ${capacity.capacity})`);
  });
}

test('a Recovery version of the Warm-Up Q1 and Q2 states B in its own prompt: it cannot lean on a neighbouring question', () => {
  ['lines.rotationImages', 'lines.rotationSlopes'].forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    instancesOf(family, 20).forEach((instance) => {
      const question = build(family, instance);
      assert.match(question.prompt, /B\(\s*[−-]?\d+, [−-]?\d+\)/, `${id}: B is in the prompt`);
    });
  });
  const dolTwo = build(getPlatformQuestionFamily('lines.horizontalVertical'), instancesOf(getPlatformQuestionFamily('lines.horizontalVertical'), 1)[0]);
  assert.match(dolTwo.prompt, /point \([−-]?\d+, [−-]?\d+\)/, 'DOL Q2 names its point and says what to write');
  assert.match(dolTwo.prompt, /horizontal/);
});

test('a family recognizes only what it stands in for: the other Warm-Up and DOL questions, and unrelated mathematics, are refused', () => {
  const unrelated = [
    { questionId: 'quad', type: 'multiAnswer', prompt: 'Find the vertex of y = x² − 4x + 1.', answerFields: [{ id: 'vertex', type: 'text', answerFormat: 'orderedPair', answer: '(2, -3)' }] },
    { questionId: 'num', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] },
    { questionId: 'mx', type: 'matrixLab', mode: 'operate', operation: 'subtract', left: 'A', right: 'B', matrices: { A: { rows: [[1, 2], [3, 4]] }, B: { rows: [[0, 1], [1, 0]] } } },
    { questionId: 'empty', type: 'multiAnswer', prompt: '', answerFields: [] },
  ];
  FAMILY_IDS.forEach((familyId) => {
    const family = getPlatformQuestionFamily(familyId);
    unrelated.forEach((question) => assert.equal(family.recognize(question), null, `${familyId} does not recognize ${question.questionId}`));
    Object.entries(BINDINGS).forEach(([questionId, boundId]) => {
      if (boundId === familyId) return;
      assert.equal(family.recognize(liveQuestion(questionId)), null, `${familyId} does not recognize ${questionId}`);
    });
  });
});

test('a static question whose key disagrees with its own givens is refused, not recovered as a different problem', () => {
  const mutate = (questionId, fieldId, answer) => {
    const question = structuredClone(liveQuestion(questionId));
    question.answerFields.find((field) => field.id === fieldId).answer = answer;
    return question;
  };
  const cases = [
    ['l3-wu-1', 'b90', '(5, 8)'],
    ['l3-wu-2', 'ab90', '8/5'],
    ['l3-wu-3', 'nr', '3/2'],
    ['l3-dol-1', 'eq', 'y=1/2x+1'],
    ['l3-dol-2', 'h', 'y=3'],
    ['l3-dol-3', 'eq', 'y=-2x+7'],
  ];
  cases.forEach(([questionId, fieldId, answer]) => {
    const family = getPlatformQuestionFamily(BINDINGS[questionId]);
    assert.ok(family.recognize(liveQuestion(questionId)), `${questionId} is recognized as written`);
    assert.equal(family.recognize(mutate(questionId, fieldId, answer)), null, `${questionId}: a key of ${answer} on ${fieldId} is refused`);
  });
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on the live copy.
 * ------------------------------------------------------------------------- */

const liveCopy = () => ({
  ...structuredClone(LESSON.model.assignmentV5),
  id: 'live-perpendicular-lines',
  title: LESSON.model.assignmentV5.assignment.title,
  courseId: 'algebra1',
  assignedClassIds: ['class-a1'],
  assignmentRevision: 2,
});

test('Prepare Recovery on the live lesson: both sections become ready from the six families, and no question changes', () => {
  const assignment = liveCopy();
  const { report } = buildRecoveryUpgradePreview({
    assignment,
    manifest: null,
    gradeSample: serverRecoveryKeyCheck,
    trackers: [],
    at: '2026-10-22T15:00:00.000Z',
  });
  assert.equal(report.migrationId, null, 'no prepared migration: the platform proposes the bindings itself');
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
    'Warm-Up Q1:l3-wu-1:add:lines.rotationImages',
    'Warm-Up Q2:l3-wu-2:add:lines.rotationSlopes',
    'Warm-Up Q3:l3-wu-3:add:numbers.reciprocals',
    'DOL Q1:l3-dol-1:add:lines.perpendicularFromEquation',
    'DOL Q2:l3-dol-2:add:lines.horizontalVertical',
    'DOL Q3:l3-dol-3:add:lines.perpendicularFromPoints',
  ]);
  report.changes.forEach((change) => {
    assert.ok(change.freshVersions >= 12, `${change.label}: ${change.freshVersions} fresh versions`);
    assert.ok(change.rigor?.dok, `${change.label} reports its rigor`);
    assert.deepEqual(change.constraints, {}, `${change.label}: no setting needed`);
  });
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  assert.equal(report.fullyReadyAfter, true);
  assert.deepEqual(report.notReady, []);
  assert.deepEqual(report.recoveryContent, { versionBefore: 0, versionAfter: 1, bindingsBefore: 0, bindingsAfter: 6 });
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

// RC07 (Codex on #513): an author's own prompt with no {{tokens}} used to
// replace the generated givens, leaving a question nobody could answer. The
// givens now follow the author's words.
test('an authored prompt without tokens keeps each family\'s givens', () => {
  const givens = {
    'lines.rotationSlopes': (question) => /Segment AB has endpoints A\(0, 0\) and B\([−-]?\d+, [−-]?\d+\)\./.test(question.prompt),
    'lines.perpendicularFromEquation': (question) => /The given line is y = .+x.*, and the point is \([−-]?\d+, [−-]?\d+\)\./.test(question.prompt),
    'lines.perpendicularFromPoints': (question) => /The line passes through \([−-]?\d+, [−-]?\d+\) and \([−-]?\d+, [−-]?\d+\); the perpendicular line passes through \([−-]?\d+, [−-]?\d+\)\./.test(question.prompt),
  };
  for (const [familyId, readsGivens] of Object.entries(givens)) {
    const family = getPlatformQuestionFamily(familyId);
    const [instance] = instancesOf(family, 1);
    const authored = { questionId: 'rc07', prompt: 'Use what you know about perpendicular lines.' };
    const question = buildFamilyQuestion({ family, instance, constraintValues: resolveFamilyConstraints(family, {}).values, authored });
    assert.ok(question.prompt.startsWith('Use what you know about perpendicular lines. '), `${familyId}: the author's words lead`);
    assert.ok(readsGivens(question), `${familyId}: ${question.prompt}`);
    // The family's own wording, with no author prompt, is unchanged.
    const plain = buildFamilyQuestion({ family, instance, constraintValues: resolveFamilyConstraints(family, {}).values, authored: { questionId: 'rc07' } });
    assert.ok(!plain.prompt.startsWith('Use what you know'), familyId);
  }
});
