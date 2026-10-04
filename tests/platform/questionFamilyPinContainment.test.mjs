/*
 * A QUESTION FAMILY PIN THAT WILL NOT REPLAY IS ONE QUESTION'S PROBLEM.
 *
 * A delivery pin names the exact family instance a student was shown. When it
 * stops replaying — the slot moved to another family version, its constraints
 * were edited, the stored pin is truncated, or it names somebody else's
 * question — three things must hold:
 *
 *   1. the student is never silently handed a DIFFERENT question in place of
 *      an authoritative one (the canonical record pin, a Recovery pin). On
 *      `main` before this suite, the assignment player did exactly that: it
 *      fell back to a fresh allocation, reported the new instance as "what
 *      was shown", and the next submission overwrote the canonical pin — so
 *      a student's attempts moved to a question their history never saw;
 *   2. the failure is a QUESTION-LEVEL state with a classification, a
 *      recovery the screen can act on, and diagnostics that identify the slot
 *      without identifying the student or revealing the question;
 *   3. nothing is deleted or rewritten: the record, the device pin and the
 *      student's history are byte-identical afterwards, no attempt is spent
 *      and no grade is written.
 *
 * The one repair allowed without a person is rebuilding the SAME instance:
 * proved by equal family, version and fingerprint.
 *
 * The React side (the boundary around question resolution in QuestionEngine)
 * is asserted here against its source and exercised for real in
 * tests/browser/familyPinContainment.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateQuestion } from '../../src/problemGenerator.js';
import { resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import {
  ALLOCATION_BASIS,
  learnerToken,
  normalizeDeliveryPin,
  planSeatAdditions,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../functions/shared/questionGenerationIdentity.mjs';
import {
  reproduceFamilyQuestionFromPin,
  resolveFamilyQuestionInstance,
} from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { buildStudentFamilyContext, localDeliveryPinKey, writeLocalDeliveryPin } from '../../src/platform/generation/familyDelivery.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { RECOVERY_ACTION, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import {
  FAMILY_PIN_KIND,
  QUESTION_RESOLUTION_FAILURE,
  QUESTION_RESOLUTION_RECOVERY,
  fingerprintDigest,
  rebuildFamilyQuestionFromPin,
} from '../../src/platform/generation/familyPinReplay.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const CLASS = 'class-p2';
const STUDENTS = ['stu-ana', 'stu-ben', 'stu-cy', 'stu-dee'];
const ASSIGNMENT_ID = 'asg-pins';

const TWO_STEP = { questionId: 'q1-two-step', type: 'stepAlgebra', prompt: 'Solve for x.', activityRole: 'classwork', questionFamily: { id: 'linear.twoStepEquation' } };
const INTERCEPTS = { questionId: 'q2-intercepts', type: 'multiAnswer', prompt: 'Find both intercepts.', activityRole: 'classwork', questionFamily: { id: 'functions.identifyIntercepts' } };
const AREA = {
  questionId: 'q3-area',
  type: 'multiAnswer',
  prompt: 'A garden is {{w}} m wide and {{l}} m long. What is its area in square meters?',
  activityRole: 'classwork',
  generator: { parameters: { w: { type: 'int', min: 3, max: 12 }, l: { type: 'int', min: 4, max: 15 } }, derived: { area: 'w*l' }, constraints: ['w!=l'] },
  answerFields: [{ id: 'area', label: 'Area', inputProfile: 'number', answer: '{{area}}' }],
  questionFamily: { scope: 'assignment' },
};

const seatedAssignment = (students = STUDENTS, id = ASSIGNMENT_ID) => {
  const assignment = { id, schemaVersion: 5, generationSeats: { version: 1, byClassId: {} } };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: students });
  return assignment;
};

const deliver = ({ assignment, question, studentId, variant = 0, storageIndex = 0 }) => {
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: CLASS });
  const result = resolveFamilyQuestionInstance({
    question,
    assignmentId: assignment.id,
    storageIndex,
    allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant }),
  });
  assert.equal(result.error, null);
  return result;
};

const memoryStore = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    snapshot: () => JSON.stringify([...map.entries()].sort()),
  };
};

// The student player: App.jsx builds this context and hands it to QuestionEngine.
const playerQuestion = ({ assignment, question, storageIndex = 0, studentId, record = null, store = memoryStore() }) => {
  const context = buildStudentFamilyContext({ assignment, question, storageIndex, studentId, classId: CLASS, record, store });
  return { context, rendered: generateQuestion(question, `${assignment.id}|${studentId}|${storageIndex}|variant:${context?.variant ?? 0}`, null, null, context) };
};

const recordWith = (pin, extra = {}) => ({
  status: 'attempted',
  attemptCount: 2,
  totalAttempts: 2,
  variantIndex: 0,
  lastAttemptAt: '2026-10-01T15:00:00.000Z',
  lastResponseKey: 'x=4',
  familyDelivery: pin,
  ...extra,
});

const assertFailedClosed = (rendered, classification, recovery = QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR) => {
  assert.equal(rendered.type, 'platformQuestionError', `expected a question-level failure, got a ${rendered.type} question`);
  assert.equal(rendered.familyDelivery, undefined, 'a failure never reports a delivery, so nothing is pinned in its place');
  assert.equal(rendered.answerFields, undefined, 'never converted into a static or free-response question');
  assert.equal(rendered.generator, undefined);
  assert.equal(rendered.platformError.classification, classification);
  assert.equal(rendered.platformError.recovery, recovery);
};

/* ---------------------------------------------------------------- baseline */

test('1. a valid canonical pin renders exactly the instance it names, unchanged', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record: recordWith(normalizeDeliveryPin(shown.delivery)) });
  assert.equal(context.pinSource, FAMILY_PIN_KIND.CANONICAL);
  assert.equal(rendered.type, 'stepAlgebra');
  assert.equal(rendered.familyDelivery.fingerprint, shown.delivery.fingerprint);
  assert.equal(rendered.equation, shown.question.equation);
  assert.equal(rendered.familyDelivery.rebuiltFromPin, undefined, 'an ordinary replay is not a rebuild');
});

/* ------------------------------------------- the reproduced integrity defect */

test('REPRO: a canonical pin that cannot replay is never swapped for a different question', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  // The slot's family was re-tuned after Ben had answered twice: the
  // instance his record is graded against is no longer in the family.
  const stale = { ...normalizeDeliveryPin(shown.delivery), fingerprint: 'linear.twoStepEquation:1|1|1' };
  const record = recordWith(stale);
  const before = JSON.stringify(record);
  const { rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record });
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH);
  assert.equal(rendered.platformError.reason, 'pin-replay-failed');
  assert.equal(JSON.stringify(record), before, 'the record (attempts, history, pin) is untouched');
});

test('2/12. a Recovery pin that cannot replay is a classified question-level failure', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ana' });
  const broken = { ...normalizeDeliveryPin(shown.delivery), fingerprint: 'linear.twoStepEquation:1|1|1' };
  let rendered;
  assert.doesNotThrow(() => {
    rendered = generateQuestion(TWO_STEP, `${ASSIGNMENT_ID}|dol-recovery|0|variant:0`, null, null, { assignmentId: ASSIGNMENT_ID, storageIndex: 0, variant: 0, pin: broken, requirePin: true });
  });
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH);
  assert.equal(rendered.platformError.reason, 'pin-replay-failed', 'the umbrella reason older readers know is kept');
  assert.equal(rendered.platformError.diagnostics.pinKind, FAMILY_PIN_KIND.RECOVERY);
  // A Recovery item with no usable pin at all fails the same way.
  const truncated = generateQuestion(TWO_STEP, 'k', null, null, { assignmentId: ASSIGNMENT_ID, storageIndex: 0, variant: 0, pin: { familyId: 'linear.twoStepEquation' }, requirePin: true });
  assertFailedClosed(truncated, QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED, QUESTION_RESOLUTION_RECOVERY.LEGACY_UNSUPPORTED);
});

test('a device pin (nothing graded against it) still yields to a fresh allocation, and says so', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-cy' });
  const store = memoryStore();
  writeLocalDeliveryPin({ studentId: 'stu-cy', delivery: { ...shown.delivery, fingerprint: 'linear.twoStepEquation:1|1|1' }, store });
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-cy', store });
  assert.equal(context.pinSource, FAMILY_PIN_KIND.DEVICE);
  assert.equal(rendered.type, 'stepAlgebra');
  assert.equal(rendered.familyDelivery.fingerprint, shown.delivery.fingerprint, 'the fresh allocation is this student\'s own seat');
  assert.equal(rendered.familyPinNotice?.classification, QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH);
  assert.equal(rendered.familyPinNotice?.pinKind, FAMILY_PIN_KIND.DEVICE);
});

/* --------------------------------------------------------------- rebuild */

const SIX = {
  questionId: 'q-six',
  type: 'multiAnswer',
  prompt: 'What is {{a}} + 1?',
  generator: { parameters: { a: { type: 'int', min: 1, max: 6 } }, derived: { ans: 'a+1' } },
  answerFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', answer: '{{ans}}' }],
  questionFamily: { scope: 'assignment' },
};

// A wrapped delivery whose walk skipped past this student's earlier versions:
// its resolvedIndex is not where its allocated index lands on its own.
const skippedDelivery = () => {
  const students = STUDENTS.slice(0, 4);
  const assignment = seatedAssignment(students, 'asg-six');
  for (const studentId of students) {
    for (let variant = 1; variant < 12; variant += 1) {
      const result = deliver({ assignment, question: SIX, studentId, variant, storageIndex: 4 });
      if (result.delivery.skippedForExclusion > 0) return { assignment, studentId, variant, result };
    }
  }
  throw new Error('no skipped delivery found; the fixture no longer exercises the rebuild path');
};

test('6. a pin that can be deterministically reconstructed is rebuilt to the SAME fingerprint, and only then shown', () => {
  const { assignment, studentId, variant, result } = skippedDelivery();
  // A pin written before `resolvedIndex` existed (or with a damaged one):
  // exact replay lands on the allocated index, which is another instance.
  const { resolvedIndex: _dropped, ...legacy } = normalizeDeliveryPin(result.delivery);
  assert.notEqual(reproduceFamilyQuestionFromPin({ question: SIX, assignmentId: assignment.id, storageIndex: 4, pin: legacy }).error, null, 'exact replay really does fail');
  const rebuilt = rebuildFamilyQuestionFromPin({ question: SIX, assignmentId: assignment.id, storageIndex: 4, pin: legacy });
  assert.ok(rebuilt, 'the walk from the pin\'s own allocation finds it');
  assert.equal(rebuilt.instance.fingerprint, result.delivery.fingerprint);
  assert.equal(rebuilt.family.version, result.delivery.familyVersion);
  assert.equal(rebuilt.delivery.slot, result.delivery.slot);
  assert.equal(rebuilt.delivery.index, legacy.index, 'the pin\'s identity is kept');
  assert.equal(rebuilt.delivery.resolvedIndex, result.delivery.resolvedIndex, 'only the locator is corrected');
  // Through the player, as the canonical pin.
  const rendered = generateQuestion(SIX, `asg-six|${studentId}|4|variant:${variant}`, null, null, {
    assignmentId: assignment.id, storageIndex: 4, variant, pin: legacy, pinSource: 'canonical',
  });
  assert.equal(rendered.type, 'multiAnswer');
  assert.equal(rendered.familyDelivery.fingerprint, result.delivery.fingerprint);
  assert.equal(rendered.familyDelivery.rebuiltFromPin, true);
  assert.equal(rendered.prompt, result.question.prompt, 'the same question the student was shown');
  // The corrected pin is one the server accepts and grades against.
  const graded = resolveServerGradingQuestion({ assignment, question: SIX, questionIndex: 4, variantIndex: variant, claimedDelivery: rendered.familyDelivery, studentId, classId: CLASS });
  assert.equal(graded.reason, null);
  assert.equal(graded.question.prompt, result.question.prompt);
});

test('a rebuild never accepts a different instance: a pin naming a fingerprint its allocation does not reach is not rebuilt', () => {
  const assignment = seatedAssignment();
  const mine = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ana' });
  const theirs = deliver({ assignment, question: TWO_STEP, studentId: 'stu-dee' });
  const steered = { ...normalizeDeliveryPin(mine.delivery), resolvedIndex: 999, fingerprint: theirs.delivery.fingerprint };
  assert.equal(rebuildFamilyQuestionFromPin({ question: TWO_STEP, assignmentId: assignment.id, storageIndex: 0, pin: steered }), null);
});

/* ----------------------------------------------------- adversarial: client */

test('7. a mismatched fingerprint fails closed', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: INTERCEPTS, studentId: 'stu-ana', storageIndex: 1 });
  const wrong = { ...normalizeDeliveryPin(shown.delivery), fingerprint: `${shown.delivery.fingerprint}x` };
  const { rendered } = playerQuestion({ assignment, question: INTERCEPTS, storageIndex: 1, studentId: 'stu-ana', record: recordWith(wrong) });
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH);
});

test('8. another student\'s pin fails closed as a canonical pin, and is ignored as a device pin', () => {
  const assignment = seatedAssignment();
  const theirs = deliver({ assignment, question: TWO_STEP, studentId: 'stu-dee' });
  const mine = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ana' });
  assert.notEqual(theirs.delivery.fingerprint, mine.delivery.fingerprint);
  // It replays perfectly — it is a real instance — but not Ana's.
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ana', record: recordWith(normalizeDeliveryPin(theirs.delivery)) });
  assert.equal(context.pinRefusal, 'pin-seat-not-held');
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_NOT_ALLOCATED);
  // On this device only (e.g. a shared Chromebook's leftover): Ana gets her own.
  const store = memoryStore();
  store.setItem(localDeliveryPinKey({ studentId: 'stu-ana', slotKey: theirs.delivery.slot, variant: 0 }), JSON.stringify(normalizeDeliveryPin(theirs.delivery)));
  const device = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ana', store });
  assert.equal(device.context.pin, null, 'a refused device pin is not used');
  assert.equal(device.rendered.familyDelivery.fingerprint, mine.delivery.fingerprint);
  assert.equal(device.rendered.familyPinNotice?.classification, QUESTION_RESOLUTION_FAILURE.PIN_NOT_ALLOCATED);
});

test('9. another slot\'s pin fails closed', () => {
  const assignment = seatedAssignment();
  const twin = { ...TWO_STEP, questionId: 'q9-two-step-twin' };
  const other = deliver({ assignment, question: twin, studentId: 'stu-ben', storageIndex: 3 });
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record: recordWith(normalizeDeliveryPin(other.delivery)) });
  assert.equal(context.pinRefusal, 'pin-slot-mismatch');
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_SLOT_MISMATCH);
});

test('10. an unknown family version fails closed — and one newer than this build asks for the current build', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  const pin = normalizeDeliveryPin(shown.delivery);
  const future = playerQuestion({ assignment, question: { ...TWO_STEP, questionFamily: { id: 'linear.twoStepEquation', version: 99 } }, studentId: 'stu-ben', record: recordWith({ ...pin, familyVersion: 99 }) });
  assertFailedClosed(future.rendered, QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND, QUESTION_RESOLUTION_RECOVERY.RELOAD);
  // The slot still means v1, but the pin claims a version this build lacks.
  const claimed = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record: recordWith({ ...pin, familyVersion: 99 }) });
  assertFailedClosed(claimed.rendered, QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND, QUESTION_RESOLUTION_RECOVERY.RELOAD);
  // A migrated slot: the question now names a different family than the pin.
  const moved = playerQuestion({ assignment, question: { ...TWO_STEP, questionFamily: { id: 'linear.oneStepEquation' } }, studentId: 'stu-ben', record: recordWith(pin) });
  assert.equal(moved.rendered.type, 'platformQuestionError');
  assert.ok([QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_MISMATCH, QUESTION_RESOLUTION_FAILURE.FAMILY_UNKNOWN].includes(moved.rendered.platformError.classification));
});

test('a family that can no longer satisfy its constraints fails closed for a pinned student', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: AREA, studentId: 'stu-ben', storageIndex: 2 });
  const impossible = { ...AREA, generator: { ...AREA.generator, constraints: ['w!=l', 'w>100'] } };
  const { rendered } = playerQuestion({ assignment, question: impossible, storageIndex: 2, studentId: 'stu-ben', record: recordWith(normalizeDeliveryPin(shown.delivery)) });
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE);
});

test('11. a legacy malformed canonical pin fails closed and erases nothing', () => {
  const assignment = seatedAssignment();
  const store = memoryStore();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  writeLocalDeliveryPin({ studentId: 'stu-ben', delivery: shown.delivery, store });
  // Truncated in storage: no version, no seat, no basis.
  const record = recordWith({ familyId: 'linear.twoStepEquation', fingerprint: shown.delivery.fingerprint }, {
    stepGrades: [{ step: 1, ok: true }], attemptHistory: [{ at: '2026-10-01T15:00:00.000Z', isCorrect: false }],
  });
  const recordBefore = JSON.stringify(record);
  const storeBefore = store.snapshot();
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record, store });
  assert.equal(context.pinUnreadable, true);
  assertFailedClosed(rendered, QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED, QUESTION_RESOLUTION_RECOVERY.LEGACY_UNSUPPORTED);
  assert.equal(JSON.stringify(record), recordBefore, 'attempts, step grades, history and the stored pin are untouched');
  assert.equal(store.snapshot(), storeBefore, 'the device pin is untouched');
});

test('a record whose pin was cleared by a replacement (null) is not a malformed pin', () => {
  const assignment = seatedAssignment();
  const { context, rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record: recordWith(null, { variantIndex: 1 }) });
  assert.equal(context.pinUnreadable, false);
  assert.equal(rendered.type, 'stepAlgebra');
});

test('13. a teacher preview never reads a student pin and contains a broken family to its own question', () => {
  const assignment = seatedAssignment();
  const preview = buildStudentFamilyContext({ assignment, question: TWO_STEP, storageIndex: 0, studentId: null, preview: true, record: recordWith({ broken: true }) });
  assert.equal(preview.pin, null);
  assert.equal(preview.pinUnreadable, false, 'a preview has no student history to protect');
  assert.equal(generateQuestion(TWO_STEP, `${ASSIGNMENT_ID}|teacher-preview|0|variant:0`, null, null, preview).type, 'stepAlgebra');
  const broken = generateQuestion({ ...TWO_STEP, questionFamily: { id: 'linear.noSuchFamily' } }, 'p', null, null, preview);
  assertFailedClosed(broken, QUESTION_RESOLUTION_FAILURE.FAMILY_UNKNOWN);
});

/* --------------------------------------------------------- retry semantics */

test('5. an unexpected exception is classified retryable, and a retry succeeds once the condition clears', () => {
  let faulty = true;
  const question = { ...AREA, questionFamily: {} };
  Object.defineProperty(question.questionFamily, 'scope', { enumerable: true, get: () => { if (faulty) throw new TypeError('transient read failure'); return 'assignment'; } });
  const first = generateQuestion(question, `${ASSIGNMENT_ID}|stu-ana|2|variant:0`);
  assertFailedClosed(first, QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION, QUESTION_RESOLUTION_RECOVERY.RETRY);
  faulty = false;
  const second = generateQuestion(question, `${ASSIGNMENT_ID}|stu-ana|2|variant:0`);
  assert.equal(second.type, 'multiAnswer');
  assert.ok(second.familyDelivery?.fingerprint);
});

test('a deterministic template failure is not offered as a retry', () => {
  const broken = { ...AREA, questionFamily: undefined, generator: { parameters: { n: { type: 'int', min: 1, max: 1 } }, derived: { answer: 'unknownValue + n' } } };
  const rendered = generateQuestion(broken, 'k');
  assert.equal(rendered.platformError.classification, QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED);
  assert.equal(rendered.platformError.recovery, QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR);
});

/* ---------------------------------------------------------- diagnostics */

test('18. diagnostics identify the slot for repair but carry no student identity and no question content', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  const stale = { ...normalizeDeliveryPin(shown.delivery), fingerprint: 'linear.twoStepEquation:1|1|1' };
  const { rendered } = playerQuestion({ assignment, question: TWO_STEP, studentId: 'stu-ben', record: recordWith(stale) });
  const diagnostics = rendered.platformError.diagnostics;
  assert.deepEqual(
    { assignmentId: diagnostics.assignmentId, questionId: diagnostics.questionId, familyId: diagnostics.familyId, familyVersion: diagnostics.familyVersion, pinKind: diagnostics.pinKind, activityRole: diagnostics.activityRole, classification: diagnostics.classification },
    { assignmentId: ASSIGNMENT_ID, questionId: 'q1-two-step', familyId: 'linear.twoStepEquation', familyVersion: 1, pinKind: 'canonical', activityRole: 'classwork', classification: 'pin-fingerprint-mismatch' },
  );
  assert.equal(diagnostics.pinFingerprint, fingerprintDigest(stale.fingerprint), 'a digest, so two pins can be told apart');
  assert.equal(diagnostics.pinFamilyVersion, 1);
  const text = JSON.stringify(rendered);
  assert.doesNotMatch(text, /stu-ben/, 'no student id');
  assert.doesNotMatch(text, new RegExp(learnerToken(ASSIGNMENT_ID, 'stu-ben')), 'no learner token');
  assert.doesNotMatch(text, /1\|1\|1/, 'not the raw fingerprint (its generated values)');
  assert.doesNotMatch(text, new RegExp(shown.delivery.fingerprint.replace(/[|]/g, '\\|')), 'not the shown instance either');
  assert.equal(Object.hasOwn(diagnostics, 'seat'), false, 'no seat allocation');
  assert.doesNotMatch(text, /generatedAnswer|answerKey|"stack"/);
});

/* ----------------------------------------------- grade / attempt invariants */

const envelope = ({ question, familyDelivery, studentId = 'stu-ben', questionIndex = 0 }) => Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
  actionId: `act-${questionIndex}-${Math.round(Math.random() * 1e9)}`,
  kind: 'ordinarySubmission',
  studentId,
  assignmentId: ASSIGNMENT_ID,
  questionIndex,
  questionId: question.questionId,
  activityRole: 'classwork',
  capturedAt: Date.parse('2026-10-02T15:00:00Z'),
  previousTotalAttempts: 2,
  record: { status: 'correct', attemptCount: 3, totalAttempts: 3, partialCredit: 100, bestPartialCredit: 100 },
  response: { kind: 'opaque', type: question.type, value: 'x=4' },
  familyDelivery,
})), { studentId });

test('16/17. the server never grades a pin it cannot reproduce: no attempt is spent and no grade is written', () => {
  const assignment = seatedAssignment();
  const shown = deliver({ assignment, question: TWO_STEP, studentId: 'stu-ben' });
  const pin = normalizeDeliveryPin(shown.delivery);
  const canonical = recordWith(pin);
  const before = JSON.stringify(canonical);
  const ingest = (claimedDelivery, question = TWO_STEP, canonicalRecord = canonical) => buildIngestedAttempt({
    envelope: envelope({ question, familyDelivery: claimedDelivery }),
    assignment,
    question,
    canonicalRecord,
    ingestedAt: Date.parse('2026-10-02T15:00:01Z'),
  });
  const cases = {
    forged: { ...pin, fingerprint: 'linear.twoStepEquation:9|9|9' },
    classmate: normalizeDeliveryPin(deliver({ assignment, question: TWO_STEP, studentId: 'stu-dee' }).delivery),
    otherSlot: normalizeDeliveryPin(deliver({ assignment, question: { ...TWO_STEP, questionId: 'q-elsewhere' }, studentId: 'stu-ben', storageIndex: 5 }).delivery),
    wrongFingerprint: { ...pin, fingerprint: `${pin.fingerprint}0` },
    unknownVersion: { ...pin, familyVersion: 42 },
    previewBasis: { ...pin, basis: ALLOCATION_BASIS.PREVIEW },
  };
  for (const [name, claimed] of Object.entries(cases)) {
    // With no good canonical pin to fall back on, the work is held.
    const held = ingest(claimed, TWO_STEP, recordWith(claimed));
    assert.equal(held.blocked, true, `${name}: held for a teacher, never graded on the browser's word`);
    assert.equal(held.record, undefined, `${name}: no record is written`);
    assert.match(String(held.reason), /^family-/, name);
  }
  // A truncated pin is no pin: the server will not invent one.
  const truncated = ingest({ familyId: 'linear.twoStepEquation' }, TWO_STEP, recordWith(null));
  assert.equal(truncated.record?.familyDelivery ?? null, null, 'no pin is minted from a truncated claim');
  // The family can no longer satisfy its constraints, or the slot moved to a
  // version this build lacks: the canonical pin cannot be reproduced.
  for (const question of [
    { ...AREA, generator: { ...AREA.generator, constraints: ['w>100'] } },
    { ...TWO_STEP, questionFamily: { id: 'linear.twoStepEquation', version: 7 } },
  ]) {
    const areaPin = question.questionId === AREA.questionId ? normalizeDeliveryPin(deliver({ assignment, question: AREA, studentId: 'stu-ben', storageIndex: 0 }).delivery) : pin;
    const held = ingest(areaPin, question, recordWith(areaPin));
    assert.equal(held.blocked, true, `${question.questionId}: held, not graded`);
  }
  assert.equal(JSON.stringify(canonical), before, 'the canonical record is never mutated');
});

test('the server grades a runtime-repaired family slot against the instance QuestionEngine shows', () => {
  const assignment = seatedAssignment();
  // A stored legacy type the runtime repairs before it renders.
  const legacy = { ...TWO_STEP, type: 'stepAlgebra2' };
  const context = buildStudentFamilyContext({ assignment, question: legacy, storageIndex: 0, studentId: 'stu-ben', classId: CLASS, store: memoryStore() });
  const shown = generateQuestion(legacy, `${ASSIGNMENT_ID}|stu-ben|0|variant:0`, null, null, context);
  assert.notEqual(shown.type, 'platformQuestionError');
  const graded = resolveServerGradingQuestion({ assignment, question: legacy, questionIndex: 0, variantIndex: 0, claimedDelivery: shown.familyDelivery, studentId: 'stu-ben', classId: CLASS });
  assert.equal(graded.reason, null);
  assert.equal(graded.question.equation, shown.equation, 'same numbers on both sides');
});

/* ------------------------------- the word-problem layer, the next stage */

test('a damaged authored word-problem context no longer throws while the question is prepared — on either side', () => {
  const assignment = seatedAssignment();
  const damaged = { ...AREA, context: { scenario: 'A rectangular garden', quantities: [null, 'width', { id: 'area', name: 'Area' }] } };
  const context = buildStudentFamilyContext({ assignment, question: damaged, storageIndex: 2, studentId: 'stu-ben', classId: CLASS, store: memoryStore() });
  let shown;
  // QuestionEngine's resolution memo: generate, then the word-problem layer.
  assert.doesNotThrow(() => { shown = normalizeContextualQuestion(generateQuestion(damaged, `${ASSIGNMENT_ID}|stu-ben|2|variant:0`, null, null, context)); });
  assert.equal(shown.type, 'multiAnswer');
  assert.deepEqual(shown.context.quantities.map((quantity) => quantity.id), ['quantity-1', 'quantity-2', 'area'], 'positions and ids are kept');
  // The server rebuilds and normalizes the same instance to grade it.
  let graded;
  assert.doesNotThrow(() => { graded = resolveServerGradingQuestion({ assignment, question: damaged, questionIndex: 2, variantIndex: 0, claimedDelivery: shown.familyDelivery, studentId: 'stu-ben', classId: CLASS }); });
  assert.equal(graded.reason, null);
  assert.equal(graded.question.prompt, shown.prompt);
});

test('a local template WITH a word-problem context replays on the server and in Recovery grading — the pin the student was dealt', () => {
  const assignment = seatedAssignment();
  const withContext = { ...AREA, context: { scenario: 'A rectangular garden', quantities: [{ id: 'w', name: 'Width', unit: 'm' }] } };
  const context = buildStudentFamilyContext({ assignment, question: withContext, storageIndex: 2, studentId: 'stu-ben', classId: CLASS, store: memoryStore() });
  const shown = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(withContext), `${ASSIGNMENT_ID}|stu-ben|2|variant:0`, null, null, context));
  // Before: the server rebuilt the family from a context-NORMALIZED template,
  // hashed a different document, and held the work ('family-pin_mismatch').
  const graded = resolveServerGradingQuestion({ assignment, question: withContext, questionIndex: 2, variantIndex: 0, claimedDelivery: shown.familyDelivery, studentId: 'stu-ben', classId: CLASS });
  assert.equal(graded.reason, null);
  assert.equal(graded.question.prompt, shown.prompt);
  assert.deepEqual(graded.question.answerFields, shown.answerFields);
  assert.deepEqual(graded.question.context, shown.context, 'the server grades the normalized instance QuestionEngine renders');

  // Recovery: the plan deals pins from the stored template; Practice grading
  // must replay them from the same template.
  const recoveryAssignment = {
    id: 'asg-recovery-context',
    schemaVersion: 5,
    title: 'Garden areas',
    assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z',
    lateDueAt: '2026-10-10T23:00:00Z',
    dol: { instructionDate: '2026-09-01' },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: [{ ...withContext, questionId: 'd-area' }] }],
  };
  recoveryAssignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment: recoveryAssignment, classId: CLASS, studentIds: STUDENTS }) } };
  const questions = getStoredAssignmentQuestions(recoveryAssignment);
  const tracker = { 0: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 } };
  const recoveryContext = buildSectionRecoveryContext({
    assignment: recoveryAssignment,
    section: 'dol',
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })),
    questions,
    tracker,
    sectionOriginal: { score: 0, attempted: 1, total: 1 },
    record: null,
    studentId: 'stu-ben',
    classId: CLASS,
    classPeriod: '1',
    schedule: null,
    supportEvents: [],
    challengeCredit: null,
    sectionModeFor: () => 'personalized',
    nowValue: Date.parse('2026-10-01T15:00:00Z'),
  });
  const item = nextRecoveryPracticeItem(recoveryContext);
  assert.ok(item?.pin, `Recovery Practice is offered (${recoveryContext.eligibility?.reason || recoveryContext.eligibility?.state})`);
  const dealt = reproduceFamilyQuestionFromPin({ question: questions[0], assignmentId: recoveryAssignment.id, storageIndex: 0, pin: item.pin });
  assert.equal(dealt.error ?? null, null);
  const outcome = runSectionRecoveryAction({
    context: recoveryContext,
    action: RECOVERY_ACTION.PRACTICE,
    payload: { pin: item.pin, practiceIndex: 0, response: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'area', value: String(dealt.instance.values.area), isComplete: true }] } },
    at: Date.parse('2026-10-01T15:00:00Z'),
  });
  assert.equal(outcome.response.isCorrect, true, 'graded against the instance the student was dealt');
});

test('the Recovery runner never throws on a missing question or an unreadable plan pin', () => {
  // PracticeRunner asks for the attempt limit of a question that is not there
  // yet (no next practice item); a null question threw and replaced the app.
  assert.doesNotThrow(() => resolveQuestionMaximumAttempts({ question: null, activityPolicy: { attempts: 3 } }));
  const runner = executableSource(readFileSync(new URL('../../src/components/student/SectionRecoveryRunner.jsx', import.meta.url), 'utf8'));
  const pinned = region(runner, 'function PinnedQuestion(', 'function PracticeRunner(');
  assert.match(pinned, /const pin = normalizeDeliveryPin\(item\?\.pin\);/);
  assert.match(pinned, /if \(!pin\) \{\s*return \(\s*<QuestionResolutionFailure\b/, 'an unreadable plan pin is this item\'s classified failure');
  assert.doesNotMatch(pinned, /item\.pin\./, 'nothing dereferences the raw plan pin while rendering');
});

/* ------------------------------------- QuestionEngine wiring (source contract) */

const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const boundary = readFileSync(new URL('../../src/QuestionResolutionBoundary.jsx', import.meta.url), 'utf8');

test('14. question resolution runs INSIDE a question-level boundary: the default export wraps the engine body', () => {
  const live = executableSource(engine);
  const wrapper = region(live, 'export default function QuestionEngine(', '\n}\n');
  // What the wrapper RETURNS is the boundary, with the body as its only child.
  assert.match(wrapper, /\n  return \(\s*<QuestionResolutionBoundary\b[^]*?>\s*<QuestionEngineBody\b[^>]*\/>\s*<\/QuestionResolutionBoundary>\s*\);\s*$/, 'the body (and its generation memo) renders inside the boundary');
  assert.equal((wrapper.match(/<QuestionEngineBody\b/g) || []).length, 1, 'the body is never rendered outside it');
  assert.match(live, /import QuestionResolutionBoundary, \{[^}]*QuestionResolutionFailure[^}]*\} from '\.\/QuestionResolutionBoundary(\.jsx)?'/);
  // The generation memo lives in the body, not in the wrapper.
  assert.doesNotMatch(wrapper, /generateQuestion\(/);
  const body = region(live, 'function QuestionEngineBody(', 'export default function QuestionEngine(');
  assert.match(body, /generateQuestion\(runtimeQuestion, generationKey/);
});

test('a classified failure renders the question-level failure panel, never a submit button', () => {
  const live = executableSource(engine);
  assert.match(live, /const resolutionFailurePanel = processedQuestion\?\.type === 'platformQuestionError' \? \(\s*<QuestionResolutionFailure\b/);
  // Rendered INSTEAD OF the locked fieldset, so its buttons work on a question
  // that is already correct or closed (a disabled fieldset disables them).
  assert.match(live, /\{resolutionFailurePanel \|\| \(\s*<fieldset disabled=/);
  assert.match(live, /shouldShowSubmit = [^;]*processedQuestion\?\.type !== 'platformQuestionError'/);
  // The delivery effect only fires for a real delivery, so a failure pins nothing.
  assert.match(live, /if \(familyDelivery && typeof onFamilyDelivery === 'function'\)/);
});

test('the boundary records a scrubbed diagnostic, offers retry, and never shows a stack', () => {
  const live = executableSource(boundary);
  assert.match(live, /static getDerivedStateFromError/);
  assert.match(live, /recordClientDiagnostic\(/);
  const caught = region(live, 'componentDidCatch(', 'componentDidUpdate(');
  assert.match(caught, /recordQuestionResolutionDiagnostic\(\{[\s\S]*'question-resolution-error'/, 'a caught throw is recorded where it happened');
  assert.doesNotMatch(live, /\.stack\b/, 'a stack trace is never rendered or recorded');
  assert.match(live, /QUESTION_RESOLUTION_RECOVERY\.RELOAD/);
  assert.match(live, /QUESTION_RESOLUTION_RECOVERY\.RETRY/);
});
