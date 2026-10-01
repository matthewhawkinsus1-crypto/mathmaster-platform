/*
 * STUDENT-SPECIFIC GENERATION — UNIQUENESS, STABILITY, AND THE LEGACY PATH.
 *
 * The audit behind this suite found students getting the same question for
 * reasons that had nothing to do with chance alone: shared-mode defaults,
 * hash collisions across a small variant list, "New Question" re-serving the
 * same static item, and generated questions the server could never rebuild.
 * Each test pins one of the guarantees that replaced those behaviours:
 *
 *   - classmates get different questions (seat allocation over a bijection),
 *   - the same student gets the SAME question back on reload, on another
 *     device, and after their seat map changes (delivery pins),
 *   - "New Question" moves to a question nobody in the class has had,
 *   - Recovery and its Practice never show a question the student has seen,
 *   - nothing about a legacy assignment changed — byte for byte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { generateQuestion, isPersonalizedBlueprint } from '../../src/problemGenerator.js';
import {
  ALLOCATION_BASIS,
  learnerToken,
  normalizeDeliveryPin,
  planSeatAdditions,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../functions/shared/questionGenerationIdentity.mjs';
import {
  FAMILY_RESOLUTION_ERROR,
  reproduceFamilyQuestionFromPin,
  resolveFamilyQuestionInstance,
} from '../../functions/shared/questionFamilyInstance.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyQuestionForGrading, gradeFamilyInstanceResponse } from '../../functions/shared/questionFamilyGrading.mjs';
import { describeQuestionVariability, VARIABILITY } from '../../functions/shared/questionVariability.mjs';
import { buildStudentFamilyContext, writeLocalDeliveryPin } from '../../src/platform/generation/familyDelivery.js';
import { planGenerationSeatWrites } from '../../src/platform/generation/generationSeatReconciler.js';

const CLASS = 'class-A';
const STUDENTS = Array.from({ length: 28 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

const SLOTS = [
  { questionId: 'q-two-step', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
  { questionId: 'q-intercepts', type: 'multiAnswer', prompt: 'Find both intercepts.', questionFamily: { id: 'functions.identifyIntercepts' } },
  { questionId: 'q-zeros', type: 'multiAnswer', prompt: 'Find the zeros.', questionFamily: { id: 'functions.identifyZeros' } },
  { questionId: 'q-system', type: 'system', prompt: 'Solve the system.', questionFamily: { id: 'systems.elimination' } },
  {
    questionId: 'q-local',
    type: 'multiAnswer',
    prompt: 'A garden is {{w}} m wide and {{l}} m long. What is its area in square meters?',
    generator: { parameters: { w: { type: 'int', min: 3, max: 12 }, l: { type: 'int', min: 4, max: 15 } }, derived: { area: 'w*l' }, constraints: ['w!=l'] },
    answerFields: [{ id: 'area', label: 'Area', inputProfile: 'number', answer: '{{area}}' }],
    questionFamily: { scope: 'assignment' },
  },
];

const seatedAssignment = (students = STUDENTS, id = 'asg-unique') => {
  const assignment = { id, generationSeats: { byClassId: {} } };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: students });
  return assignment;
};

const deliver = ({ assignment, slot, studentId, variant = 0, storageIndex = 4, sectionMode = 'personalized' }) => {
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: CLASS });
  const result = resolveFamilyQuestionInstance({
    question: slot,
    assignmentId: assignment.id,
    storageIndex,
    allocation: resolveGenerationAllocation({ sectionMode, seatInfo, variant }),
  });
  assert.equal(result.error, null, `${slot.questionId} for ${studentId}: ${result.error}`);
  return result;
};

test('classmates get different questions: every seated student in a class of 28 has a distinct instance', () => {
  const assignment = seatedAssignment();
  for (const slot of SLOTS) {
    const fingerprints = STUDENTS.map((studentId) => deliver({ assignment, slot, studentId }).delivery.fingerprint);
    assert.equal(new Set(fingerprints).size, STUDENTS.length, `${slot.questionId} repeated a question inside the class`);
  }
});

test('"New Question" moves to a question nobody in the class was given', () => {
  const assignment = seatedAssignment();
  for (const slot of SLOTS) {
    const firsts = new Set(STUDENTS.map((studentId) => deliver({ assignment, slot, studentId }).delivery.fingerprint));
    STUDENTS.forEach((studentId) => {
      const second = deliver({ assignment, slot, studentId, variant: 1 });
      assert.equal(second.delivery.variant, 1);
      assert.ok(!firsts.has(second.delivery.fingerprint), `${slot.questionId}: ${studentId}'s replacement was a classmate's first question`);
    });
  }
});

test('the same student gets the same question back: reload, remount and a second device all agree', () => {
  const assignment = seatedAssignment();
  for (const slot of SLOTS) {
    const first = deliver({ assignment, slot, studentId: 'student-07' });
    const again = deliver({ assignment, slot, studentId: 'student-07' });
    assert.deepEqual(again.question, first.question, `${slot.questionId} changed on remount`);
    // A second device only has the canonical record's pin.
    const replay = reproduceFamilyQuestionFromPin({ question: slot, assignmentId: assignment.id, storageIndex: 4, pin: first.delivery });
    assert.ok(!replay.error, `${slot.questionId}: ${replay.error}`);
    assert.deepEqual(replay.question, first.question, `${slot.questionId} changed on another device`);
  }
});

test('a pin keeps a provisional student on the question they saw after the teacher app seats them', () => {
  const slot = SLOTS[0];
  const before = { id: 'asg-late-join', generationSeats: { byClassId: { [CLASS]: planSeatAdditions({ assignment: { id: 'asg-late-join' }, classId: CLASS, studentIds: STUDENTS.slice(0, 10) }) } } };
  const provisionalSeat = resolveLearnerSeat({ assignment: before, studentId: 'late-student', classId: CLASS });
  assert.equal(provisionalSeat.basis, ALLOCATION_BASIS.PROVISIONAL);
  const shown = deliver({ assignment: before, slot, studentId: 'late-student' });

  const after = structuredClone(before);
  Object.assign(after.generationSeats.byClassId[CLASS], planSeatAdditions({ assignment: before, classId: CLASS, studentIds: ['late-student'] }));
  assert.equal(resolveLearnerSeat({ assignment: after, studentId: 'late-student', classId: CLASS }).basis, ALLOCATION_BASIS.SEATED);

  const context = buildStudentFamilyContext({
    assignment: after,
    question: slot,
    storageIndex: 4,
    studentId: 'late-student',
    classId: CLASS,
    record: { status: 'attempted', attemptCount: 1, variantIndex: 0, familyDelivery: shown.delivery },
  });
  assert.equal(context.pinSource, 'canonical');
  const rendered = generateQuestion(slot, `asg-late-join|late-student|4|variant:0`, null, null, context);
  assert.equal(rendered.familyDelivery.fingerprint, shown.delivery.fingerprint, 'seating the student must not change the question they already saw');
});

test('a device pin is honoured before the first attempt reaches the server, and never across variants', () => {
  const slot = SLOTS[1];
  const assignment = seatedAssignment();
  const memory = new Map();
  const store = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
  const shown = deliver({ assignment, slot, studentId: 'student-03' });
  writeLocalDeliveryPin({ studentId: 'student-03', delivery: shown.delivery, store });
  const sameVariant = buildStudentFamilyContext({ assignment, question: slot, storageIndex: 4, studentId: 'student-03', classId: CLASS, record: null, store });
  assert.equal(sameVariant.pinSource, 'device');
  const nextVariant = buildStudentFamilyContext({ assignment, question: slot, storageIndex: 4, studentId: 'student-03', classId: CLASS, record: { variantIndex: 1, status: 'unattempted' }, store });
  assert.equal(nextVariant.pin, null, 'a pin for variant 0 must not pin the replacement');
});

test('seats are opaque, append-only, and identical whichever teacher tab computes them', () => {
  const assignment = seatedAssignment(STUDENTS.slice(0, 5), 'asg-seat');
  const seats = assignment.generationSeats.byClassId[CLASS];
  Object.keys(seats).forEach((token) => {
    assert.match(token, /^lt[0-9a-f]{16}$/, 'a seat key must not be a student id');
    assert.ok(!STUDENTS.some((studentId) => token.includes(studentId)));
  });
  assert.equal(learnerToken('asg-seat', 'student-00'), learnerToken('asg-seat', 'student-00'));
  assert.notEqual(learnerToken('asg-seat', 'student-00'), learnerToken('asg-other', 'student-00'), 'tokens differ per assignment, so they cannot be joined across assignments');
  // Re-planning with a reordered roster adds only the new student, never moves anyone.
  const additions = planSeatAdditions({ assignment, classId: CLASS, studentIds: STUDENTS.slice(0, 6).reverse() });
  assert.deepEqual(Object.keys(additions), [learnerToken('asg-seat', 'student-05')]);
  assert.ok(!Object.values(seats).includes(Object.values(additions)[0]));
});

test('the teacher-app reconciler only plans writes for family-backed assignments with unseated students', () => {
  const roster = [{ id: 'student-00', classId: CLASS }, { id: 'student-01', classId: CLASS }, { id: 'other-class', classId: 'class-B' }];
  const legacy = { id: 'asg-legacy', schemaVersion: 5, assignedClassIds: [CLASS], sections: [{ id: 'dol', role: 'dol', questions: [{ questionId: 'q1', type: 'multiAnswer', prompt: 'What is 2+2?', answerFields: [{ id: 'a', answer: '4' }] }] }] };
  assert.deepEqual(planGenerationSeatWrites({ assignment: legacy, students: roster }), [], 'a legacy assignment is never written to');
  const familyBacked = { ...legacy, id: 'asg-family', sections: [{ id: 'dol', role: 'dol', questions: [SLOTS[0]] }] };
  const writes = planGenerationSeatWrites({ assignment: familyBacked, students: roster });
  assert.deepEqual(writes.map((write) => write.classId), [CLASS, CLASS], 'only students in an assigned class are seated');
  writes.forEach((write) => assert.match(write.token, /^lt[0-9a-f]{16}$/));
  const seated = { ...familyBacked, generationSeats: { byClassId: { [CLASS]: Object.fromEntries(writes.map((write) => [write.token, write.seat])) } } };
  assert.deepEqual(planGenerationSeatWrites({ assignment: seated, students: roster }), [], 'once seated, nothing more is written');
});

test('shared mode is deliberate: everyone gets the same question, and that is labelled', () => {
  const assignment = seatedAssignment();
  const slot = SLOTS[0];
  const fingerprints = new Set(STUDENTS.slice(0, 6).map((studentId) => deliver({ assignment, slot, studentId, sectionMode: 'shared' }).delivery.fingerprint));
  assert.equal(fingerprints.size, 1);
  assert.equal(deliver({ assignment, slot, studentId: 'student-01', sectionMode: 'shared' }).delivery.basis, ALLOCATION_BASIS.SHARED);
});

test('a class larger than the family can serve repeats openly (wrapped), never silently', () => {
  const tiny = {
    questionId: 'q-tiny',
    type: 'multiAnswer',
    prompt: 'What is {{a}} + 1?',
    generator: { parameters: { a: { type: 'int', min: 1, max: 3 } }, derived: { ans: 'a+1' } },
    answerFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', answer: '{{ans}}' }],
    questionFamily: { scope: 'assignment' },
  };
  const assignment = seatedAssignment(STUDENTS.slice(0, 6), 'asg-tiny');
  const deliveries = STUDENTS.slice(0, 6).map((studentId) => deliver({ assignment, slot: tiny, studentId }).delivery);
  assert.equal(new Set(deliveries.map((delivery) => delivery.fingerprint)).size, 3, 'only three distinct questions exist');
  assert.ok(deliveries.some((delivery) => delivery.wrapped === true), 'the repeat must be reported on the delivery for Pre-Flight and audit');
});

test('excluding seen questions walks deterministically to an unseen one', () => {
  const assignment = seatedAssignment();
  const slot = SLOTS[2];
  const seen = STUDENTS.slice(0, 5).map((studentId) => deliver({ assignment, slot, studentId }).delivery.fingerprint);
  const seatInfo = resolveLearnerSeat({ assignment, studentId: 'student-00', classId: CLASS });
  const pick = () => resolveFamilyQuestionInstance({
    question: slot,
    assignmentId: assignment.id,
    storageIndex: 4,
    allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }),
    excludeFingerprints: seen,
  });
  const first = pick();
  assert.equal(first.error, null);
  assert.ok(!seen.includes(first.delivery.fingerprint));
  assert.equal(pick().delivery.fingerprint, first.delivery.fingerprint, 'a reload lands on the same unseen question');
  // A one-question family: once its only question is seen, nothing is left.
  const single = { ...SLOTS[4], questionId: 'q-exhaust', generator: { parameters: { w: { type: 'int', min: 3, max: 4 }, l: { type: 'int', min: 4, max: 4 } }, derived: { area: 'w*l' }, constraints: ['w!=l'] } };
  const only = resolveFamilyQuestionInstance({ question: single, assignmentId: assignment.id, storageIndex: 9, allocation: { seat: 0, variant: 0, stride: 1 } });
  assert.equal(only.error, null);
  const exhausted = resolveFamilyQuestionInstance({
    question: single,
    assignmentId: assignment.id,
    storageIndex: 9,
    allocation: { seat: 0, variant: 0, stride: 1 },
    excludeFingerprints: [only.delivery.fingerprint],
  });
  assert.equal(exhausted.error, FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED, 'when nothing unseen is left the caller is told, not handed a repeat');
});

test('choice order and equation order are presentation: they never make a "different" question', () => {
  const family = getPlatformQuestionFamily('systems.elimination');
  const base = { a1: 2, b1: 1, c1: 5, a2: 1, b2: -1, c2: 1 };
  const swapped = { a1: 1, b1: -1, c1: 1, a2: 2, b2: 1, c2: 5 };
  const scaled = { a1: -4, b1: -2, c1: -10, a2: 1, b2: -1, c2: 1 };
  assert.equal(family.fingerprint(swapped), family.fingerprint(base));
  assert.equal(family.fingerprint(scaled), family.fingerprint(base), 'a multiple of the same equation is the same equation');
});

test('the server rebuilds a family question from its pin, refuses a stale pin, and marks the raw answer itself', () => {
  const assignment = seatedAssignment();
  const slot = SLOTS[0];
  const shown = deliver({ assignment, slot, studentId: 'student-02' });
  const resolved = resolveFamilyQuestionForGrading({
    assignment,
    question: slot,
    questionIndex: 4,
    variantIndex: 0,
    claimedDelivery: shown.delivery,
    studentId: 'student-02',
    classId: CLASS,
  });
  assert.equal(resolved.reason, null);
  assert.equal(resolved.verification, 'seat-verified');
  const answer = Number(resolved.question.generatedAnswer);
  assert.equal(gradeFamilyInstanceResponse({ question: resolved.question, response: { kind: 'opaque', type: 'stepAlgebra', value: `x=${answer}` } }).isCorrect, true);
  assert.equal(gradeFamilyInstanceResponse({ question: resolved.question, response: { kind: 'opaque', type: 'stepAlgebra', value: `x=${answer + 1}` } }).isCorrect, false);

  // After "New Question" the old pin is not the question being answered.
  const afterReplacement = resolveFamilyQuestionForGrading({ assignment, question: slot, questionIndex: 4, variantIndex: 1, claimedDelivery: shown.delivery });
  assert.equal(afterReplacement.reason, 'family-delivery-missing');

  // A pin whose instance no longer matches is reported, never silently swapped.
  const tampered = { ...normalizeDeliveryPin(shown.delivery), fingerprint: 'linear.twoStepEquation:9|9|9' };
  const refused = resolveFamilyQuestionForGrading({ assignment, question: slot, questionIndex: 4, variantIndex: 0, claimedDelivery: tampered });
  assert.equal(refused.question, null);
  assert.match(refused.reason, /pin_mismatch/);
});

test('a Recovery item that cannot replay its pin is an error, never a substitute question', () => {
  const slot = SLOTS[0];
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, slot, studentId: 'student-04' });
  const broken = { ...normalizeDeliveryPin(shown.delivery), fingerprint: 'linear.twoStepEquation:1|1|1' };
  const strict = generateQuestion(slot, 'asg-unique|recovery|4|variant:0', null, null, { assignmentId: assignment.id, storageIndex: 4, variant: 0, pin: broken, requirePin: true });
  assert.equal(strict.type, 'platformQuestionError');
  assert.equal(strict.platformError.reason, 'pin-replay-failed');
  // The ordinary player keeps its old behaviour: a stale pin falls back to the allocation.
  const lenient = generateQuestion(slot, 'asg-unique|student-04|4|variant:0', null, null, { assignmentId: assignment.id, storageIndex: 4, variant: 0, pin: broken });
  assert.notEqual(lenient.type, 'platformQuestionError');
});

test('a family reference that cannot resolve is reported as broken, never served as a static question', () => {
  const broken = { questionId: 'q-broken', type: 'stepAlgebra', prompt: 'Solve.', questionFamily: { id: 'linear.doesNotExist' } };
  assert.equal(describeQuestionVariability(broken).mode, VARIABILITY.FAMILY_BROKEN);
  assert.equal(isPersonalizedBlueprint(broken), false);
  const rendered = generateQuestion(broken, 'asg|student|0|variant:0');
  assert.equal(rendered.type, 'platformQuestionError');
});

/*
 * LEGACY ASSIGNMENTS ARE BYTE-IDENTICAL.
 *
 * These hashes were produced by running the same blueprints and keys through
 * src/problemGenerator.js on `main` (616aa7c, before the family engine
 * existed) — regenerate them from main, never from this branch, if a main
 * change legitimately moves a legacy output. A
 * question without a `questionFamily` block must keep producing exactly what
 * it produced then, or every in-flight legacy assignment would change under
 * the students answering it. (The three "variants" keys that share a hash are
 * the old birthday collision the audit describes — preserved on purpose for
 * legacy questions, and the reason families exist.)
 */
const LEGACY_BLUEPRINTS = [
  { questionId: 'legacy-step', type: 'stepAlgebra', prompt: 'Practice: Solve the generated equation for x.', mode: 'rigorous', objective: { kind: 'isolate', variable: 'x', simplifyRequired: true, label: 'Isolate x and simplify' }, generator: { kind: 'stepLinearEquation', solutionRange: [-10, 10], coefficientRange: [2, 9], constantRange: [-15, 15] } },
  { questionId: 'legacy-system', type: 'system', prompt: 'Practice: Solve the system and enter the intersection as an ordered pair.', showEquations: true, showGraph: true, generator: { kind: 'linearSystem', xRange: [-7, 7], yRange: [-7, 7], slopeChoices: [-4, -3, -2, -1, 1, 2, 3, 4] } },
  { questionId: 'legacy-table', type: 'table', prompt: 'Practice: Complete every missing output in the quadratic table.', showRule: true, generator: { kind: 'functionTable', ruleType: 'quadratic', rowCount: 6, blankCount: 4, coefficientRange: [-3, 3], interceptRange: [-8, 8] } },
  { questionId: 'legacy-template', type: 'multiAnswer', prompt: 'A rectangle is {{w}} cm wide and {{l}} cm long. What is its area?', generator: { parameters: { w: { type: 'int', min: 2, max: 9 }, l: { type: 'int', min: 3, max: 12 } }, derived: { area: 'w*l' } }, answerFields: [{ id: 'area', label: 'Area', inputProfile: 'number', answer: '{{area}}' }] },
  { questionId: 'legacy-self', type: 'algebra', prompt: 'Solve for x.' },
  { questionId: 'legacy-variants', type: 'literal', prompt: 'Solve for y.', variants: [{ equation: 'y + 2 = x', answer: 'x-2' }, { equation: 'y - 5 = x', answer: 'x+5' }, { equation: '3y = x', answer: 'x/3' }] },
  { questionId: 'legacy-static', type: 'multiAnswer', prompt: 'What is 7 times 8?', answerFields: [{ id: 'product', label: 'Product', inputProfile: 'number', answer: '56' }] },
];
const LEGACY_KEYS = ['asg-legacy|student-a|3|variant:0', 'asg-legacy|student-a|3|variant:1', 'asg-legacy|student-b|3|variant:0', 'asg-legacy|shared|5|variant:2'];
const LEGACY_GOLDEN = {
  'legacy-step': ['00c96ec997ce0e2048b135f7', 'f8ca15e6a502b102205c39ed', '08f896f4100d26b4305fa9cb', 'b082a9a1a55454e0e3c31c78'],
  'legacy-system': ['1e6cd62b8c0deb532f98fb24', 'c40e43f708ca7eb9ffe5c516', '3debc528f8e3eee2ada5ad7f', 'b9f77e0415207abc066e459b'],
  'legacy-table': ['0f08a1539b46ee76ef3ef147', '5ad1d9c2c5e36a070a2b2e8e', 'e8283c02e16778124e400c80', '19ff6e007399d0fdf86ad0c7'],
  'legacy-template': ['94fa2d130b518ee2d2d071ca', '95a82883f28d4c14ccc969ea', '508df5c3b2e0121eea39e5a8', '547f93e00a1637400a94f64a'],
  'legacy-self': ['305adc74981a2ca66837de64', '5138f2f699521a70a3063a4e', 'f7226e6bf860b8c228b839de', '3dc3ef1bc599fb1980be8d90'],
  'legacy-variants': ['cd161d3516f0f0b05247fe85', '2ccd35a18d32767f3a76e5df', '2ccd35a18d32767f3a76e5df', '2ccd35a18d32767f3a76e5df'],
  'legacy-static': ['8deb6af1a16ef6a22500d440', '8deb6af1a16ef6a22500d440', '8deb6af1a16ef6a22500d440', '8deb6af1a16ef6a22500d440'],
};

test('legacy questions generate exactly what they generated before the family engine', () => {
  for (const blueprint of LEGACY_BLUEPRINTS) {
    const hashes = LEGACY_KEYS.map((key) => createHash('sha256').update(JSON.stringify(generateQuestion(blueprint, key))).digest('hex').slice(0, 24));
    assert.deepEqual(hashes, LEGACY_GOLDEN[blueprint.questionId], `${blueprint.questionId} changed for a legacy assignment`);
  }
});

test('"New Question" is only offered where a genuinely different question exists', () => {
  const byId = Object.fromEntries(LEGACY_BLUEPRINTS.map((blueprint) => [blueprint.questionId, blueprint]));
  assert.equal(isPersonalizedBlueprint(byId['legacy-static']), false, 'a static question has no different question to offer');
  assert.equal(isPersonalizedBlueprint(byId['legacy-step']), true);
  assert.equal(isPersonalizedBlueprint(SLOTS[0]), true);
  assert.equal(isPersonalizedBlueprint({ type: 'multiAnswer', prompt: 'x', generator: { kind: 'notARealGenerator' } }), false, 'an unknown generator is shown to every student unchanged');
});

test('a family template is never marked against its own fields — only the instance rebuilt from the pin is', async () => {
  const { serverGradingSupport } = await import('../../functions/shared/ordinaryResponseGrading.mjs');
  const { familyInstanceServerGradable } = await import('../../functions/shared/questionFamilyGrading.mjs');
  // A template that still carries a static key from before it was converted.
  const template = { ...SLOTS[1], answerFields: [{ id: 'stale', label: 'Answer', answer: '(1, 0)' }] };
  assert.deepEqual(serverGradingSupport(template), { supported: false, reason: 'family-template' }, 'no deadline checkpoint may grade against the template');
  const assignment = seatedAssignment();
  const built = deliver({ assignment, slot: template, studentId: 'student-05' }).question;
  assert.equal(built.questionFamily, undefined);
  assert.equal(familyInstanceServerGradable(built), true, 'the built instance is gradable on the server');
});
