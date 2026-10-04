// SERVER-AUTHORITATIVE MISCONCEPTION EVIDENCE, PHASE 2.
//
// Phase 1 (misconceptionEvidence.test.mjs) holds the registry, the trust gate,
// ingestion's classifier and the case review. This suite holds what Phase 2
// adds, numbered as the brief numbers its required tests:
//
//    1-15  the new classifiers, on real tool questions and real family
//          instances graded by the real shared graders
//   16-17  forgery: a forged code, and a client that tries to manufacture one
//   18-20  Section Recovery / Recovery Practice: only a legitimately graded
//          item is classified; a platform failure, a hold or a repair never is
//   21-22  the deadline finalizer: a finalized answer classifies once, and
//          submit + finalizer never make two events for one attempt
//   23-24  the representations board: provable vs ambiguous work
//   25-26  PR #436's v2 families: version-aware, and no invented code
//   27-28  Test Cycle: canonical evidence, and legacy records still read
//      29  a future registry / classifier / code version is ignored safely
//   30-33  Case Review: recurring, isolated, the narrative fact, privacy
//   34-35  supports create nothing; grades identical with classification off
//
// Mutation testing of every Phase 2 classifier guard is in
// misconceptionClassifierMutation.test.mjs (same fixtures).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MISCONCEPTION_CLASSIFIERS,
  MISCONCEPTION_REGISTRY,
  MISCONCEPTION_REGISTRY_VERSION,
  buildMisconceptionEvidence,
  getMisconceptionCode,
  trustedMisconceptionFindings,
} from '../../functions/shared/misconceptionCodes.mjs';
import { classifyMisconceptions, misconceptionClassifierIdFor } from '../../functions/shared/misconceptionClassifiers.mjs';
import {
  MISCONCEPTION_EVIDENCE_KINDS,
  buildRecoveryMisconceptionEvidenceRecord,
  gradedResponseMisconceptionEvidence,
  recoveryMisconceptionEvidenceKey,
  recoveryMisconceptionEvidenceRecords,
} from '../../functions/shared/misconceptionEvidenceSites.mjs';
import { buildIngestedAttempt, buildSubmissionEnvelope, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildCaseEvidenceResponse } from '../../functions/shared/caseReviewEvidence.mjs';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import {
  buildCheckpointFinalization,
  decideCheckpointFinalization,
} from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import { buildResponseCheckpointAction } from '../../src/platform/performance/responseCheckpoint.js';
import { buildCorrectionPlan, buildPerformanceProfile, correctionPlanProgress, CORRECTION_DIAGNOSIS } from '../../functions/shared/testCycleCorrections.mjs';
import { RECOVERY_STATE } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { RECOVERY_ACTION, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { learnerToken, planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { ERROR_PATTERN_NOT_DETERMINABLE, MISCONCEPTION_RECURRENCE, analyzeErrorPatterns } from '../../src/platform/caseReview/errorPatterns.js';
import { TEMPLATES, buildNarrativeFacts } from '../../src/platform/caseReview/narrativeFacts.js';
import { narrativeViolations } from '../../src/platform/caseReview/narrativeGuard.js';
import { MISCONCEPTION_FIXTURES, classifiedCodes, gradeFixture } from './helpers/misconceptionFixtures.mjs';
import { MISCONCEPTION_FIXTURES_PHASE2 } from './helpers/misconceptionFixturesPhase2.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const byName = new Map(MISCONCEPTION_FIXTURES.map((fixture) => [fixture.name, fixture]));
const fixture = (name) => {
  const found = byName.get(name);
  assert.ok(found, `fixture "${name}"`);
  return found;
};
const codesOf = (name) => classifiedCodes(classifyMisconceptions, fixture(name));
const expectCodes = (name, codes) => {
  const found = fixture(name);
  assert.deepEqual(found.expected, codes, `the fixture's own expectation: ${name}`);
  assert.deepEqual(codesOf(name), [...codes].sort(), name);
};
const expectWrongWithNoCode = (name) => {
  assert.equal(gradeFixture(fixture(name)).isCorrect, false, `${name} is wrong work`);
  expectCodes(name, []);
};
const persisted = (value) => JSON.parse(JSON.stringify(value));

/* ===========================================================================
 * The registry, after Phase 2.
 * ======================================================================== */

test('Phase 2 is additive under registry v1: new ids only, every existing code and meaning unchanged', () => {
  assert.equal(MISCONCEPTION_REGISTRY_VERSION, 1, 'no registry bump for appearance');
  const added = ['initial-value-from-later-reading', 'composition-order-reversed', 'domain-range-swapped', 'correlation-direction-reversed', 'correlation-treated-as-causation'];
  added.forEach((id) => assert.equal(getMisconceptionCode(id)?.version, 1, id));
  // The Phase 1 codes keep version 1 and their exact meaning.
  const phase1 = {
    'slope-run-over-rise': 'Slope computed as run over rise',
    'slope-sign-reversed': 'Slope sign reversed',
    'inequality-boundary-style': 'Solid / dashed boundary chosen incorrectly',
    'inequality-shaded-wrong-side': 'Shaded the wrong side of the boundary',
    'independent-dependent-swapped': 'Independent and dependent quantities exchanged',
    'intercepts-swapped': 'x- and y-intercepts confused',
  };
  Object.entries(phase1).forEach(([id, label]) => {
    assert.equal(getMisconceptionCode(id).version, 1, id);
    assert.equal(getMisconceptionCode(id).label, label, id);
  });
  assert.equal(MISCONCEPTION_REGISTRY.length, 18 + added.length);
  // No synonym of an existing code was created: every new code names a different concept.
  const concepts = MISCONCEPTION_REGISTRY.map((entry) => entry.concept);
  added.forEach((id) => assert.equal(concepts.filter((concept) => concept === getMisconceptionCode(id).concept).length, 1, `${id} has its own concept`));
  // The one Phase 1 classifier that gained logic is versioned; its codes are not.
  assert.equal(MISCONCEPTION_CLASSIFIERS.find((entry) => entry.id === 'tool:systemsWorkspace/inequalities').version, 2);
  // A "correlation means causation" code exists only because a structured,
  // server-graded selection proves it — never text.
  assert.match(getMisconceptionCode('correlation-treated-as-causation').evidenceRequired, /selection/);
});

/* ===========================================================================
 * 1-15. The classifiers.
 * ======================================================================== */

test('1. linear table: an inverted rate (Δx/Δy) from the student\'s own Δx and Δy', () => {
  expectCodes('table: rate inverted (Δx/Δy) on every interval', ['slope-run-over-rise']);
  expectCodes('table: rate inverted, rows taken in click order', ['slope-run-over-rise']);
  expectCodes('table derive: slope as Δx/Δy', ['slope-run-over-rise']);
  const result = classifyMisconceptions({ ...fixture('table: rate inverted (Δx/Δy) on every interval'), grading: gradeFixture(fixture('table: rate inverted (Δx/Δy) on every interval')) });
  assert.deepEqual(result.findings, [{ code: 'slope-run-over-rise', codeVersion: 1, parts: ['evidenceAccuracy'] }]);
  assert.equal(result.classifier, 'tool:linearTableWorkbench/constantRate');
});

test('2. linear table: a later reading used as the starting value, with the rate right', () => {
  expectCodes('table derive: the reading at x = 1 used as the starting value', ['initial-value-from-later-reading']);
  expectCodes('table derive: the reading at x = 3 used as the starting value', ['initial-value-from-later-reading']);
});

test('3. similar-but-not-exact table work gets no code', () => {
  [
    'table: Δx and Δy typed into each other is not named',
    'table: an inverted rate beside a different wrong rate is not named',
    'table: an unmodeled wrong rate is not named',
    'table derive: a reading that is also the sign error working back is not named',
    'table derive: a reading that is also "subtracted x" is not named',
    'table derive: a starting value that is no reading is not named',
    'table derive: a reading with the wrong slope is not named',
    'table derive: an earlier reading (x < 0) is not named',
  ].forEach(expectWrongWithNoCode);
});

test('4. composition: f(g(x)) and g(f(x)) exchanged, read from both labelled boxes', () => {
  expectCodes('composition: f(g(x)) and g(f(x)) exchanged', ['composition-order-reversed']);
});

test('5. another wrong composition is not an order swap', () => {
  [
    'composition: one box exchanged and the other unmodeled is not named',
    'composition: one order used for both boxes is not named',
    'composition: f(x)·g(x) and f(x) + g(x) are not an order swap',
    'composition: commuting functions cannot show a swap',
    'composition: an exchanged value that is also f(x) is not named',
    'composition: compositions closer than twice the tolerance are not named',
  ].forEach(expectWrongWithNoCode);
});

test('6. domain and range exactly exchanged', () => {
  expectCodes('relation: domain and range exchanged', ['domain-range-swapped']);
  expectCodes('relation: exchanged, written as sets', ['domain-range-swapped']);
});

test('7. a partial or unrelated domain error is not a swap', () => {
  [
    'relation: a partial domain is not a swap',
    'relation: unrelated wrong sets are not a swap',
    'relation: the range in the domain box alone is not a swap',
    'relation: a list with a non-number is not read as a swap',
    'relation: a domain equal to its range cannot show a swap',
  ].forEach(expectWrongWithNoCode);
});

test('8. a constructed line with the reciprocal slope from the right anchor', () => {
  expectCodes('graph: reciprocal slope from the right y-intercept', ['slope-run-over-rise']);
  expectCodes('graph: point-slope, reciprocal slope from the given point', ['slope-run-over-rise']);
});

test('9. a constructed line with the opposite slope from the right anchor', () => {
  expectCodes('graph: opposite slope from the right y-intercept', ['slope-sign-reversed']);
});

test('10. an ambiguous constructed slope gets no code', () => {
  [
    'graph: slope 1, where −1 is both −m and −1/m, is not named',
    'graph: reciprocal and opposite at once is not named',
    'graph: a reciprocal slope from the wrong intercept is not named',
    'graph: a third point off the line is not named',
  ].forEach(expectWrongWithNoCode);
});

test('11. a reversed correlation direction, chosen or typed', () => {
  expectCodes('data: positive association called negative', ['correlation-direction-reversed']);
  expectCodes('data: r and direction both reversed', ['correlation-direction-reversed']);
  expectCodes('data: association stated as causation', ['correlation-treated-as-causation']);
  expectCodes('data: reversed direction and causation coexist', ['correlation-direction-reversed', 'correlation-treated-as-causation']);
});

test('12. an unrelated regression error, a borderline association or a pre-selected choice is no direction code', () => {
  [
    'data: an unrelated regression error is not a direction code',
    'data: a borderline association cannot show a reversal',
    'data: a pre-selected direction is not the student\'s choice',
    'data: r typed with the opposite sign',
  ].forEach(expectWrongWithNoCode);
  // Causation chosen where the key supports it is no causation code.
  expectCodes('data: causation chosen where the key supports it is not named', ['correlation-direction-reversed']);
});

test('13. student-build inequality: the boundary style, on a boundary drawn right', () => {
  expectCodes('build: dashed boundary for ≥', ['inequality-boundary-style']);
  const result = classifyMisconceptions({ ...fixture('build: dashed boundary for ≥'), grading: gradeFixture(fixture('build: dashed boundary for ≥')) });
  assert.equal(result.classifier, 'tool:systemsWorkspace/inequalities');
  assert.equal(result.evidence.classifierVersion, 2);
  assert.deepEqual(result.findings[0].parts, ['constraint-1']);
  expectWrongWithNoCode('build: style on a wrong boundary is not judged');
});

test('14. student-build inequality: the wrong side shaded, clear of the boundary', () => {
  expectCodes('build: shaded the wrong side', ['inequality-shaded-wrong-side']);
  expectCodes('build: style and side wrong together', ['inequality-boundary-style', 'inequality-shaded-wrong-side']);
  ['build: a shading point hugging the boundary is not named', 'build: a modeling question is not read', 'build: an unchosen style is not a style error'].forEach((name) => expectCodes(name, []));
});

test('15. correct work emits no code — on every Phase 2 classifier', () => {
  const correct = MISCONCEPTION_FIXTURES_PHASE2.filter((entry) => entry.name.endsWith(' correct'));
  assert.ok(correct.length >= 7, 'one correct-work fixture per Phase 2 classifier family');
  correct.forEach((entry) => {
    const grading = gradeFixture(entry);
    assert.equal(grading.isCorrect, true, `${entry.name} is graded correct by the real grader`);
    assert.equal(classifyMisconceptions({ ...entry, grading }).evidence, null, entry.name);
  });
});

/* ===========================================================================
 * 16-17. Forgery.
 * ======================================================================== */

test('16. a forged Phase 2 code is ignored by the trust gate and by every builder', () => {
  const genuine = buildMisconceptionEvidence({ classifierId: 'tool:relationMapping/default', findings: [{ code: 'domain-range-swapped', parts: ['domain', 'range'] }] });
  assert.equal(trustedMisconceptionFindings({ misconceptionEvidence: genuine }).length, 1);
  [
    { misconceptionCodes: ['domain-range-swapped'] },
    { misconceptionEvidence: { ...genuine, source: 'client' } },
    // A code its classifier may not emit.
    { misconceptionEvidence: { ...genuine, findings: [{ code: 'composition-order-reversed', codeVersion: 1, parts: [] }] } },
    { misconceptionEvidence: { ...genuine, classifier: 'tool:relationMapping/forged' } },
    // A causation code from the direction-only correlation view.
    { misconceptionEvidence: { ...buildMisconceptionEvidence({ classifierId: 'tool:dataModelingLab/correlation', findings: [{ code: 'correlation-direction-reversed', parts: [] }] }), findings: [{ code: 'correlation-treated-as-causation', codeVersion: 1, parts: [] }] } },
  ].forEach((performance, index) => assert.deepEqual(trustedMisconceptionFindings(performance), [], `forgery ${index}`));
  assert.equal(buildMisconceptionEvidence({ classifierId: 'tool:dataModelingLab/correlation', findings: [{ code: 'correlation-treated-as-causation', parts: [] }] }), null);
  // The Recovery record builder re-checks too: it cannot be made to store a forgery.
  const forgedRecord = buildRecoveryMisconceptionEvidenceRecord({
    kind: MISCONCEPTION_EVIDENCE_KINDS.SECTION_RECOVERY, studentId: 'S1', assignmentId: 'A1', section: 'dol', itemId: 'r1',
    misconceptionEvidence: { ...genuine, source: 'client' },
  });
  assert.equal(forgedRecord, null);
  assert.equal(buildRecoveryMisconceptionEvidenceRecord({ kind: 'testCycle', studentId: 'S1', assignmentId: 'A1', misconceptionEvidence: genuine }), null, 'an unknown kind is not stored');
});

const RELATION_QUESTION = { questionId: 'q-relation', type: 'relationMapping', activityRole: 'classwork', pairs: [[1, 4], [2, 5], [3, 6]], ask: ['domain', 'range'], prompt: 'Give the domain and range.' };
const RELATION_ASSIGNMENT = {
  id: 'a-relation', title: 'Relations (synthetic)', schemaVersion: 5, assignedClassIds: ['C1'],
  releaseAt: '2026-09-21T08:00:00-05:00', dueAt: '2026-10-30',
  sections: [{ id: 'cw', role: 'classwork', questions: [RELATION_QUESTION] }],
};
const STUDENT = 'S950001'; // synthetic
const CAPTURED_AT = Date.parse('2026-09-28T15:00:00Z');
let actionCounter = 0;
const ingestRelation = ({ work, record = null, claimed = null, supportUsage = undefined, studentId = STUDENT, at = CAPTURED_AT }) => {
  const { toolResponse } = gradeToolWork({ toolId: 'relationMapping', question: RELATION_QUESTION, work });
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-p2-${(actionCounter += 1)}`,
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: RELATION_ASSIGNMENT.id,
    questionIndex: 0,
    questionId: RELATION_QUESTION.questionId,
    activityRole: 'classwork',
    capturedAt: at,
    previousTotalAttempts: Number(record?.totalAttempts || 0),
    record: claimed || { status: 'attempted', attemptCount: 1, totalAttempts: Number(record?.totalAttempts || 0) + 1 },
    response: toolResponse,
    ...(supportUsage ? { supportUsage } : {}),
  })), { studentId });
  return buildIngestedAttempt({ envelope, assignment: RELATION_ASSIGNMENT, question: RELATION_QUESTION, canonicalRecord: record, gradeDocument: { classId: 'C1' }, ingestedAt: at + 1000 });
};
const SWAPPED = { domainText: '4, 5, 6', rangeText: '1, 2, 3' };
const CORRECT = { domainText: '1, 2, 3', rangeText: '4, 5, 6' };

test('17. a client cannot manufacture evidence: codes in the work, the record or the parts are never read', () => {
  // Correct work dressed up with every place a forged code could ride.
  const forged = ingestRelation({
    work: { ...CORRECT, misconceptionCode: 'domain-range-swapped', misconceptionEvidence: buildMisconceptionEvidence({ classifierId: 'tool:relationMapping/default', findings: [{ code: 'domain-range-swapped', parts: ['domain'] }] }) },
    claimed: { status: 'attempted', attemptCount: 1, totalAttempts: 1, partGrades: [{ id: 'domain', isComplete: true, isCorrect: false, misconceptionCode: 'domain-range-swapped' }] },
  });
  assert.equal(forged.gradedBy, 'server');
  assert.equal(forged.record.status, 'correct', 'the server graded the real work');
  assert.equal('misconceptionCodes' in forged.evidenceEvent.performance, false, 'nothing the client sent became evidence');
  // (The stored response key is the student's raw text, keys and all; it is never read as evidence.)
  assert.ok(forged.record.partGrades.every((part) => !('misconceptionCode' in part)), 'no part carries a code');
  // Real swapped work is classified — by the server, with its provenance.
  const honest = ingestRelation({ work: SWAPPED });
  assert.deepEqual(honest.evidenceEvent.performance.misconceptionCodes, ['domain-range-swapped']);
  assert.equal(honest.evidenceEvent.performance.misconceptionEvidence.classifier, 'tool:relationMapping/default');
});

/* ===========================================================================
 * 18-20. Section Recovery and Recovery Practice.
 * ======================================================================== */

const NOW = Date.parse('2026-10-01T15:00:00Z');
const RECOVERY_STUDENT = 'student-07';
const CLASS = 'class-A';
const ROSTER = Array.from({ length: 12 }, (_, index) => `student-${String(index).padStart(2, '0')}`);
const zeros = (questionId, questionWeight) => ({
  questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight,
  questionFamily: { id: 'functions.identifyZeros' },
});
const recoveryAssignment = (questions = [zeros('d1', 4), zeros('d2', 3), zeros('d3', 3)]) => {
  const assignment = {
    id: 'asg-recovery-evidence', schemaVersion: 5, title: 'Recovery evidence (synthetic)', assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z', lateDueAt: '2026-10-10T23:00:00Z',
    warmup: { instructionDate: '2026-09-01' }, dol: { instructionDate: '2026-09-01' },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions }],
  };
  assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };
  return assignment;
};
const ORIGINAL = Object.freeze({
  0: Object.freeze({ status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
  1: Object.freeze({ status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
  2: Object.freeze({ status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
});
const recoveryContext = ({ assignment, record = null, classify = null }) => {
  const original = splitGradesBySection({ tracker: ORIGINAL, assignment }).dol;
  const context = buildSectionRecoveryContext({
    assignment, section: 'dol',
    sectionEntries: getStoredAssignmentQuestions(assignment).map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'dol'),
    questions: getStoredAssignmentQuestions(assignment), tracker: ORIGINAL,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record, studentId: RECOVERY_STUDENT, classId: CLASS, classPeriod: '1', schedule: null, supportEvents: [],
    sectionModeFor: () => 'personalized', nowValue: NOW,
  });
  return classify ? Object.assign(context, { classifyMisconceptions: classify }) : context;
};
const reproduce = (assignment, item) => reproduceFamilyQuestionFromPin({
  question: getStoredAssignmentQuestions(assignment)[item.storageIndex], assignmentId: assignment.id, storageIndex: item.storageIndex, pin: item.pin,
});
const zerosResponse = (smaller, larger) => ({
  kind: 'fields', type: 'multiAnswer', value: '',
  fields: [{ id: 'smallerZero', value: String(smaller), isComplete: true }, { id: 'largerZero', value: String(larger), isComplete: true }],
});
const rightZeros = (reproduced) => zerosResponse(reproduced.instance.values.low, reproduced.instance.values.high);
// Right work for either DOL family in these fixtures (zeros, intercepts).
const rightAnswer = (reproduced) => {
  const { answer } = reproduced.instance;
  if (answer.kind !== 'points') return rightZeros(reproduced);
  return {
    kind: 'fields', type: 'multiAnswer', value: '',
    fields: [
      { id: 'xIntercept', value: `(${answer.value.xIntercept.join(', ')})`, isComplete: true },
      { id: 'yIntercept', value: `(${answer.value.yIntercept.join(', ')})`, isComplete: true },
    ],
  };
};
// The constants of the factors: {−r1, −r2}, in order.
const signReversedZeros = (reproduced) => {
  const { low, high } = reproduced.instance.values;
  return zerosResponse(Math.min(-low, -high), Math.max(-low, -high));
};
const unmodeledZeros = () => zerosResponse(9998, 9999);

const startRecovery = (assignment) => {
  let record = null;
  for (let step = 0; step < 24; step += 1) {
    const context = recoveryContext({ assignment, record });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({
      context, action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: rightAnswer(reproduce(assignment, item)) },
      at: NOW + step,
    }).record;
  }
  const context = recoveryContext({ assignment, record });
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, `fixture: Recovery unlocks (${context.eligibility.reason})`);
  return runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: NOW + 1_000 }).record;
};
const submitRecovery = ({ assignment, record, responses, classify = null }) => runSectionRecoveryAction({
  context: recoveryContext({ assignment, record, classify }),
  action: RECOVERY_ACTION.SUBMIT,
  payload: { responses },
  at: NOW + 5_000,
});

test('18. Recovery: a legitimately graded wrong item may classify — beside the record, never in it', () => {
  const assignment = recoveryAssignment();
  const started = startRecovery(assignment);
  const [r1, r2, r3] = started.plan.items;
  const responses = {
    r1: signReversedZeros(reproduce(assignment, r1)),
    r2: unmodeledZeros(),
    r3: rightZeros(reproduce(assignment, r3)),
  };
  const outcome = submitRecovery({ assignment, record: started, responses });
  assert.equal(outcome.record.status, 'completed');
  assert.equal(outcome.misconceptionEvidence.length, 1, 'only the item whose wrong value one strategy explains');
  const [entry] = outcome.misconceptionEvidence;
  assert.equal(entry.kind, 'sectionRecovery');
  assert.equal(entry.itemId, 'r1');
  assert.deepEqual(entry.misconceptionEvidence.findings.map((finding) => finding.code), ['zeros-sign-reversed']);
  assert.equal(r2.itemId, 'r2');
  // The stored record carries no code anywhere.
  assert.equal(JSON.stringify(outcome.record).includes('misconception'), false);
  // The record the callable writes: server-only collection, fixed key, no response.
  const records = recoveryMisconceptionEvidenceRecords({ entries: outcome.misconceptionEvidence, studentId: RECOVERY_STUDENT, assignmentId: assignment.id, section: 'dol', occurredAt: NOW + 5_000 });
  assert.equal(records.length, 1);
  assert.equal(records[0].eventKey, recoveryMisconceptionEvidenceKey({ kind: 'sectionRecovery', studentId: RECOVERY_STUDENT, assignmentId: assignment.id, section: 'dol', opportunity: 1, itemId: 'r1', fingerprint: r1.pin.fingerprint }));
  assert.deepEqual(Object.keys(records[0]).sort(), ['eventKey', 'occurredAt', 'performance', 'questionSnapshot', 'schemaVersion', 'source', 'studentId']);
  assert.equal('score' in records[0].performance, false, 'no score: it can move no grade or mastery');
  assert.equal('alignmentKeys' in records[0], false, 'no alignment keys: My Math Path mastery cannot read it');
  // No student work: no response, no fields, no answer.
  assert.doesNotMatch(JSON.stringify(records[0]), /"(response|fields|value|answer)"/);
  // Practice: a graded practice answer classifies; a forfeit never does.
  const fresh = recoveryAssignment();
  const context = recoveryContext({ assignment: fresh });
  const item = nextRecoveryPracticeItem(context);
  const practiced = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: signReversedZeros(reproduce(fresh, item)) }, at: NOW });
  assert.deepEqual(practiced.misconceptionEvidence.map((entryOf) => [entryOf.kind, entryOf.misconceptionEvidence.findings[0].code]), [['recoveryPractice', 'zeros-sign-reversed']]);
  const forfeited = runSectionRecoveryAction({ context: recoveryContext({ assignment: fresh }), action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, forfeit: true }, at: NOW });
  assert.deepEqual(forfeited.misconceptionEvidence, [], 'a forfeit is no answer');
});

test('19. Recovery: a platform-unavailable item never classifies, whatever answer it carries', () => {
  const assignment = recoveryAssignment();
  const started = startRecovery(assignment);
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, signReversedZeros(reproduce(assignment, item))]));
  // The teacher re-tunes Q3 after the plan was pinned: its pin no longer reproduces.
  const broken = structuredClone(assignment);
  broken.sections[0].questions[2] = { ...broken.sections[0].questions[2], questionFamily: { id: 'functions.identifyZeros', constraints: { zeroRange: [6, 9] } } };
  const outcome = submitRecovery({ assignment: broken, record: started, responses });
  assert.equal(outcome.record.results.r3.status, 'platform-unavailable');
  assert.deepEqual(outcome.misconceptionEvidence.map((entry) => entry.itemId).sort(), ['r1', 'r2'], 'r3 carried a sign-reversed answer and is still never classified');
  // The site rule itself: nothing that is not a server-graded wrong answer is classified.
  [
    { graded: false, reason: 'platform-unavailable' },
    { graded: false, reason: 'grader-unavailable' },
    { graded: false, reason: 'family-pin-fingerprint-mismatch' },
    null,
    { graded: true, isCorrect: true, parts: [] },
  ].forEach((grading, index) => assert.equal(gradedResponseMisconceptionEvidence({ question: { type: 'multiAnswer' }, response: {}, grading, classify: alwaysClassifies }), null, `site ${index}`));
  // Even a classifier that would name anything is never asked about such an item.
  const assignmentAgain = recoveryAssignment();
  const startedAgain = startRecovery(assignmentAgain);
  const brokenAgain = structuredClone(assignmentAgain);
  brokenAgain.sections[0].questions[2] = { ...brokenAgain.sections[0].questions[2], questionFamily: { id: 'functions.identifyZeros', constraints: { zeroRange: [6, 9] } } };
  const onlyGraded = submitRecovery({ assignment: brokenAgain, record: startedAgain, responses: { r1: rightZeros(reproduce(assignmentAgain, startedAgain.plan.items[0])), r3: unmodeledZeros() }, classify: alwaysClassifies });
  assert.deepEqual(onlyGraded.misconceptionEvidence.map((entry) => entry.itemId), [], 'right (r1), unanswered (r2) and unavailable (r3) items are never classified');
  // A Practice forfeit is no answer, whatever it carries.
  const fresh = recoveryAssignment();
  const item = nextRecoveryPracticeItem(recoveryContext({ assignment: fresh }));
  const forfeited = runSectionRecoveryAction({
    context: recoveryContext({ assignment: fresh, classify: alwaysClassifies }),
    action: RECOVERY_ACTION.PRACTICE,
    payload: { pin: item.pin, practiceIndex: item.practiceIndex, forfeit: true, response: signReversedZeros(reproduce(fresh, item)) },
    at: NOW,
  });
  assert.deepEqual(forfeited.misconceptionEvidence, []);
});
// A stand-in classifier that names a code for ANY work it is shown: whatever
// it is never shown cannot be classified, however a real classifier evolves.
const alwaysClassifies = () => ({
  classifier: 'family:functions.identifyZeros@1',
  findings: [{ code: 'zeros-sign-reversed', codeVersion: 1, parts: [] }],
  evidence: buildMisconceptionEvidence({ classifierId: 'family:functions.identifyZeros@1', findings: [{ code: 'zeros-sign-reversed', parts: [] }] }),
});

test('20. Recovery: a hold for a platform failure, and the teacher\'s repair of it, never classify', () => {
  const assignment = recoveryAssignment([zeros('d1', 4), { questionId: 'd2', type: 'multiAnswer', prompt: 'Find both intercepts.', questionWeight: 3, questionFamily: { id: 'functions.identifyIntercepts' } }, zeros('d3', 3)]);
  const started = startRecovery(assignment);
  const responses = { r1: rightZeros(reproduce(assignment, started.plan.items[0])), r3: rightZeros(reproduce(assignment, started.plan.items[2])) };
  // Q2 (the only intercepts question) breaks: its skill has no graded item, so the Recovery is held.
  const broken = structuredClone(assignment);
  broken.sections[0].questions[1] = { ...broken.sections[0].questions[1], questionFamily: { id: 'functions.identifyIntercepts', constraints: { interceptRange: [-3, 3] } } };
  const held = submitRecovery({ assignment: broken, record: started, responses: { ...responses, r2: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'xIntercept', value: '(0, 1)', isComplete: true }, { id: 'yIntercept', value: '(1, 0)', isComplete: true }] } } });
  assert.equal(held.record.status, 'held');
  assert.equal(held.record.results.r2.status, 'platform-unavailable');
  assert.deepEqual(held.misconceptionEvidence, [], 'the held item is never evidence, and the right answers carry none');
  // The teacher repair callable never classifies: it grades nothing new.
  const resolution = executableSource(readFileSync(new URL('../../functions/shared/sectionRecoveryResolution.mjs', import.meta.url), 'utf8'));
  assert.doesNotMatch(resolution, /classifyMisconceptions|gradedResponseMisconceptionEvidence|misconceptionEvidence/);
  const callable = region(executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')), 'exports.resolveHeldSectionRecovery', 'exports.', 'resolveHeldSectionRecovery');
  assert.doesNotMatch(callable, /misconception/i);
  // The Recovery callable writes evidence only from the action's own outcome, after the record.
  const recovery = region(executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')), 'exports.advanceSectionRecovery', 'exports.', 'advanceSectionRecovery');
  assert.match(recovery, /outcome\.changed && Array\.isArray\(outcome\.misconceptionEvidence\)/);
  assert.match(recovery, /collection\(service\.MISCONCEPTION_EVIDENCE_COLLECTION\)/);
  assert.doesNotMatch(recovery, /collection\("evidenceEvents"\)/, 'never an attempt event: mastery and Path cannot move');
});

/* ===========================================================================
 * 21-22. The deadline finalizer.
 * ======================================================================== */

const DAY = '2026-09-14';
const CLASS_ID = 'class-a';
const CLASS_PERIOD = 'Period 3';
const SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: { [CLASS_PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
  weeklyDayTypes: { 1: 'A' }, dayTypeOverrides: { [DAY]: 'A' }, modifiedSchedules: {},
};
const WARMUP_CLOSE = Date.parse('2026-09-14T15:10:00Z');
const DURING_WARMUP = Date.parse('2026-09-14T15:05:00Z');
const AFTER_WARMUP = Date.parse('2026-09-14T15:11:00Z');
const WARMUP_RELATION = { ...RELATION_QUESTION, questionId: 'q-warmup-relation', activityRole: 'warmup' };
const checkpointAssignment = () => ({
  id: 'A1', schemaVersion: 5, assignedClassIds: [CLASS_ID], dueAt: '2026-09-20', lateDueAt: '2026-09-21',
  warmup: { enabled: true, instructionDate: DAY }, dol: { enabled: true, instructionDate: DAY },
  sections: [{ id: 's-warmup', role: 'warmup', questions: [WARMUP_RELATION] }],
});
const checkpointFor = ({ work, previousTotalAttempts = 0 }) => {
  const { toolResponse } = gradeToolWork({ toolId: 'relationMapping', question: WARMUP_RELATION, work });
  const action = buildResponseCheckpointAction({
    identity: { studentId: 'S1042', assignmentId: 'A1', questionIndex: 0, questionId: WARMUP_RELATION.questionId, variantIndex: 0, generationKey: 'A1|S1042|0|variant:0' },
    question: WARMUP_RELATION,
    activityRole: 'warmup',
    answerState: { isComplete: true, responseKey: JSON.stringify(work), toolResponse },
    revision: 1,
    finalizeAt: new Date(WARMUP_CLOSE).toISOString(),
    finalizationReason: 'warmup-close',
    finalizationContext: { classId: CLASS_ID, classPeriod: CLASS_PERIOD },
    previousTotalAttempts,
    capturedAt: DURING_WARMUP,
  });
  assert.ok(action, 'fixture: the client builds a checkpoint');
  return { ...action.payload, classId: CLASS_ID, serverAcknowledgedAt: new Date(DURING_WARMUP), status: CHECKPOINT_STATUS.ACTIVE };
};
const finalize = ({ checkpoint, gradeDocument = { studentId: 'S1042', classId: CLASS_ID, classPeriod: CLASS_PERIOD, gradesByAssignment: {} }, classify = undefined }) => {
  const assignment = checkpointAssignment();
  const question = { ...WARMUP_RELATION };
  const decision = decideCheckpointFinalization({ checkpoint, assignment, gradeDocument, gradeDocumentId: 'S1042', question, schedule: SCHEDULE, classPeriod: CLASS_PERIOD, isSecureAssignment: false, now: AFTER_WARMUP });
  if (decision.action !== 'finalize') return { decision, finalization: null };
  return { decision, finalization: buildCheckpointFinalization({ checkpoint, assignment, question, decision, occurredAt: AFTER_WARMUP, runAt: AFTER_WARMUP, classify }) };
};

test('21. a checkpoint the deadline finalizes as the student\'s answer classifies — once, on its own attempt event', () => {
  const { decision, finalization } = finalize({ checkpoint: checkpointFor({ work: SWAPPED }) });
  assert.equal(decision.action, 'finalize');
  assert.equal(finalization.record.gradedBy, 'server');
  assert.deepEqual(finalization.evidenceEvent.performance.misconceptionCodes, ['domain-range-swapped']);
  assert.equal(finalization.evidenceEvent.performance.misconceptionEvidence.source, 'server-grading');
  assert.equal(finalization.evidenceEvent.performance.attemptNumber, 1);
  // Correct work finalizes with no code.
  assert.equal('misconceptionCodes' in finalize({ checkpoint: checkpointFor({ work: CORRECT }) }).finalization.evidenceEvent.performance, false);
  // Incomplete work at the close writes no attempt, and so reaches no classifier.
  const incomplete = finalize({ checkpoint: checkpointFor({ work: { domainText: '4, 5, 6', rangeText: '' } }) });
  assert.notEqual(incomplete.decision.action, 'finalize');
  assert.equal(incomplete.finalization, null);
});

test('21b. a Question Family checkpoint is classified from the parameters the server reproduced from its pin', () => {
  const slot = { questionId: 'q-warmup-slope', type: 'multiAnswer', activityRole: 'warmup', questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer' } };
  const assignment = {
    ...checkpointAssignment(),
    generationSeats: { version: 1, byClassId: { [CLASS_ID]: { [learnerToken('A1', 'S1042')]: 3 } } },
    sections: [{ id: 's-warmup', role: 'warmup', questions: [slot] }],
  };
  const delivered = resolveFamilyQuestionInstance({ question: slot, assignmentId: 'A1', storageIndex: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' } });
  const { rise, run } = delivered.instance.values;
  const action = buildResponseCheckpointAction({
    identity: { studentId: 'S1042', assignmentId: 'A1', questionIndex: 0, questionId: slot.questionId, variantIndex: 0, generationKey: 'A1|S1042|0|variant:0' },
    question: delivered.question,
    activityRole: 'warmup',
    answerState: { isComplete: true, responseKey: `${run}/${rise}`, parts: [{ id: 'slope', response: `${run}/${rise}`, isComplete: true }] },
    revision: 1,
    finalizeAt: new Date(WARMUP_CLOSE).toISOString(),
    finalizationReason: 'warmup-close',
    finalizationContext: { classId: CLASS_ID, classPeriod: CLASS_PERIOD },
    previousTotalAttempts: 0,
    capturedAt: DURING_WARMUP,
    familyDelivery: delivered.delivery,
  });
  const checkpoint = { ...action.payload, classId: CLASS_ID, serverAcknowledgedAt: new Date(DURING_WARMUP), status: CHECKPOINT_STATUS.ACTIVE };
  const gradeDocument = { studentId: 'S1042', classId: CLASS_ID, classPeriod: CLASS_PERIOD, gradesByAssignment: {} };
  const decision = decideCheckpointFinalization({ checkpoint, assignment, gradeDocument, gradeDocumentId: 'S1042', question: slot, schedule: SCHEDULE, classPeriod: CLASS_PERIOD, isSecureAssignment: false, now: AFTER_WARMUP });
  assert.equal(decision.action, 'finalize', decision.reason);
  const finalization = buildCheckpointFinalization({ checkpoint, assignment, question: slot, decision, occurredAt: AFTER_WARMUP, runAt: AFTER_WARMUP });
  assert.equal(finalization.record.status === 'correct', false);
  assert.deepEqual(finalization.evidenceEvent.performance.misconceptionCodes, ['slope-run-over-rise']);
  assert.equal(finalization.evidenceEvent.performance.misconceptionEvidence.classifier, 'family:linear.slopeFromPoints@1');
});

test('22. submit + finalizer never produce two events for one attempt', () => {
  // The student submits; the submission retires nothing yet, and a stale
  // checkpoint (written before the submit) reaches the scheduler.
  const submitted = ingestRelation({ work: SWAPPED });
  assert.deepEqual(submitted.evidenceEvent.performance.misconceptionCodes, ['domain-range-swapped']);
  const gradeDocument = { studentId: 'S1042', classId: CLASS_ID, classPeriod: CLASS_PERIOD, gradesByAssignment: { A1: { 0: submitted.record } } };
  const stale = finalize({ checkpoint: checkpointFor({ work: SWAPPED, previousTotalAttempts: 0 }), gradeDocument });
  assert.equal(stale.decision.action, 'close');
  assert.equal(stale.decision.status, CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION);
  assert.equal(stale.finalization, null, 'no second attempt, so no second evidence event');
  // And the finalizer's event for an attempt is keyed exactly as a submit of
  // that attempt (same student, assignment, question, variant, attempt number)
  // through the one shared builder: a race could only ever write the same
  // document, never a second one.
  const finalized = finalize({ checkpoint: checkpointFor({ work: SWAPPED }) }).finalization.evidenceEvent;
  const submitKey = buildAttemptEvidenceEvent({
    studentId: 'S1042', assignment: checkpointAssignment(), question: WARMUP_RELATION, questionIndex: 0, activityRole: 'warmup',
    attemptRecord: { status: 'attempted', totalAttempts: 1, variantIndex: 0 }, attemptResult: { isCorrect: false },
  }).eventKey;
  assert.equal(finalized.eventKey, submitKey);
  // The ingestion path builds its event through that same builder.
  const ingestion = executableSource(readFileSync(new URL('../../functions/shared/submissionIngestion.mjs', import.meta.url), 'utf8'));
  assert.match(ingestion, /evidenceEvent = question\?\.type === 'modelingLab' \? null : buildAttemptEvidenceEvent\(/);
});

/* ===========================================================================
 * 23-24. The linear representations board.
 * ======================================================================== */

test('23. representations: provable errors from the structured board', () => {
  expectCodes('representations: inverted rate', ['slope-run-over-rise']);
  expectCodes('representations: the later reading as the starting amount', ['initial-value-from-later-reading']);
  expectCodes('representations: intercepts exchanged', ['intercepts-swapped']);
  expectCodes('representations: intercepts written (y, x)', ['ordered-pair-reversed']);
  expectCodes('representations: quantities exchanged', ['independent-dependent-swapped']);
  const reading = fixture('representations: the later reading as the starting amount');
  assert.equal(classifyMisconceptions({ ...reading, grading: gradeFixture(reading) }).classifier, 'family:linear.multipleRepresentations@1');
});

test('24. representations: ambiguous work, and the story text alone, get no code', () => {
  [
    'representations: Δx/Δy that is also the line through the reading is not named',
    'representations: slope −1, where 1 is −m and −Δx/Δy, is not named',
    'representations: the later reading with a wrong rate is not named',
    'representations: a later reading equal to the stated rate is not named',
    'representations: one intercept wrong is not named',
    'representations: the dependent quantity as independent alone is not a swap',
    'representations: the story text alone is no evidence',
  ].forEach(expectWrongWithNoCode);
  // The sort family places cards and types no value: nothing to read a strategy from.
  assert.equal(misconceptionClassifierIdFor({ question: { familyInstance: { familyId: 'linear.representationSort', familyVersion: 1 } }, grading: {}, familyValues: {} }), null);
});

/* ===========================================================================
 * 25-26. PR #436's families.
 * ======================================================================== */

const v2Instance = (id, version, constraints) => {
  const resolved = resolveFamilyQuestionInstance({
    question: { questionId: `q-${id}`, type: id.startsWith('systems') ? 'systemsWorkspace' : 'stepAlgebra', activityRole: 'classwork', questionFamily: { id, version, constraints } },
    assignmentId: 'a-436', storageIndex: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' },
  });
  assert.ok(!resolved.error, `${id}@${version} builds (${resolved.error})`);
  return resolved;
};

test('25. #436 families are dispatched by version: no v1 classifier reads a v2 instance, and none was justified for v2', () => {
  // v1 still classifies exactly as before.
  expectCodes('two-step: constant moved without changing sign', ['inverse-operation-sign']);
  [
    ['linear.multiStepEquation', 2, { solutionCase: 'one' }],
    ['linear.twoStepEquation', 2, {}],
    ['systems.algebraic2x2', 1, { solutionCase: 'one' }],
  ].forEach(([id, version, constraints]) => {
    const { question, instance } = v2Instance(id, version, constraints);
    // v2 exposes none of v1's parameter names (a, b, cc, d): a v1 formula would misread it.
    if (id.startsWith('linear')) ['a', 'b', 'cc', 'd'].forEach((name) => assert.equal(name in instance.values, false, `${id}@${version} has no "${name}"`));
    const response = id.startsWith('systems')
      ? gradeToolWork({ toolId: 'systemsWorkspace', question, work: { dimension: 2, method: 'elimination', values: { x: 1, y: 1 }, verification: {} } }).toolResponse
      : { kind: 'opaque', type: 'stepAlgebra', value: 'x=99', fields: [] };
    const grading = gradeServerResponse({ question, response });
    assert.equal(grading.isCorrect, false, `${id}@${version}: wrong work is graded wrong`);
    assert.equal(misconceptionClassifierIdFor({ question, grading, familyValues: instance.values }), null, `${id}@${version} has no classifier`);
    assert.equal(classifyMisconceptions({ question, response, grading, familyValues: instance.values }).evidence, null);
  });
  // The declared classifiers name each family by version.
  assert.ok(MISCONCEPTION_CLASSIFIERS.every((entry) => !entry.id.endsWith('@2') || !entry.id.startsWith('family:linear')), 'no v2 equation classifier is declared');
});

test('26. a wrong special-case reading (No Solution, All Real Numbers, infinite / no-solution systems) invents no code', () => {
  const none = v2Instance('linear.multiStepEquation', 2, { solutionCase: 'none' });
  const allReals = { kind: 'opaque', type: 'stepAlgebra', value: 'All real numbers', fields: [] };
  const graded = gradeServerResponse({ question: none.question, response: allReals });
  assert.equal(graded.graded, true);
  assert.equal(graded.isCorrect, false);
  assert.equal(classifyMisconceptions({ question: none.question, response: allReals, grading: graded, familyValues: none.instance.values }).evidence, null);
  const system = v2Instance('systems.algebraic2x2', 1, { solutionCase: 'none' });
  const readAsInfinite = gradeToolWork({
    toolId: 'systemsWorkspace', question: system.question,
    work: { dimension: 2, method: 'elimination', values: {}, verification: {}, reducedStatement: '0 = 7', specialCase: { statementTruth: 'true', solutionCount: 'infinite', classification: 'consistent-dependent' } },
  }).toolResponse;
  const systemGrading = gradeServerResponse({ question: system.question, response: readAsInfinite });
  assert.equal(systemGrading.isCorrect, false);
  assert.equal(classifyMisconceptions({ question: system.question, response: readAsInfinite, grading: systemGrading, familyValues: system.instance.values }).evidence, null);
});

/* ===========================================================================
 * 27-28. Test Cycle.
 * ======================================================================== */

const BLUEPRINT = {
  title: 'Unit 3 Test (synthetic)', passingScore: 70,
  targets: [
    { targetId: 't1', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 2, familyIds: ['f1', 'f2', 'f3'] },
    { targetId: 't2', alignmentKey: 'texas:A.3A', label: 'Slope', dok: 2, difficultyBand: 3, questionCount: 2, familyIds: ['g1', 'g2', 'g3'] },
  ],
};
const POLICY = { mode: 'testCycle' };
const missed = (targetId, extra) => ({ targetId, slotId: `${targetId}#1`, familyId: 'f1', questionInstanceId: `${targetId}-i1`, score: 0, isCorrect: false, ...extra });
const testCyclePlan = (responses) => buildCorrectionPlan({
  blueprint: BLUEPRINT, profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses }), policy: POLICY,
  releasedTestGrade: 0, assignmentId: 'A1', studentId: 'S1', examSessionId: 'e1',
});

test('27. Test Cycle: a canonical, server-proved finding becomes the diagnosis, with the registry\'s one meaning', () => {
  const evidence = buildMisconceptionEvidence({ classifierId: 'tool:relationMapping/default', findings: [{ code: 'domain-range-swapped', parts: ['domain', 'range'] }] });
  const plan = testCyclePlan([missed('t1', { grading: { score: 0, isCorrect: false, misconceptionEvidence: evidence } }), missed('t2', {})]);
  const t1 = plan.targets.find((target) => target.targetId === 't1');
  assert.equal(t1.diagnosis, CORRECTION_DIAGNOSIS.MISCONCEPTION);
  assert.equal(t1.misconception, 'domain-range-swapped');
  assert.equal(t1.misconceptionLabel, getMisconceptionCode('domain-range-swapped').label);
  assert.ok(t1.diagnosisDetail.includes(getMisconceptionCode('domain-range-swapped').teacherMeaning), 'one teacher-facing meaning');
  // Forged client data never becomes trusted: a browser-sourced block, a bare
  // list and a free-text label all leave the standard diagnosis.
  [
    { grading: { misconceptionEvidence: { ...evidence, source: 'browser' } } },
    { grading: { misconceptionCodes: ['domain-range-swapped'] } },
    { misconceptionCode: 'domain-range-swapped' },
    { errorPattern: 'confuses domain and range' },
    { responsePayload: { misconceptionEvidence: evidence } },
  ].forEach((extra, index) => {
    const target = testCyclePlan([missed('t1', extra), missed('t2', {})]).targets.find((entry) => entry.targetId === 't1');
    assert.equal(target.diagnosis, CORRECTION_DIAGNOSIS.STANDARD, `forgery ${index}`);
    assert.equal(target.misconception, null, `forgery ${index}`);
  });
  // The server's reader carries the provenance block to the planner (and only that is trusted).
  const reader = readFileSync(new URL('../../functions/lib/testCycle.js', import.meta.url), 'utf8');
  assert.match(reader, /misconceptionEvidence: response\?\.grading\?\.misconceptionEvidence \|\| null/);
});

test('28. Test Cycle: a legacy plan with a free-text diagnosis is still readable, exactly as stored', () => {
  const legacy = {
    planId: 'plan-legacy', complete: false, gradeImpact: 'none',
    targets: [{
      correctionId: 'correction-t1', order: 1, targetId: 't1', label: 'Domain and range', alignmentKey: 'texas:A.2A',
      diagnosis: 'misconception', misconception: 'distributes-sign-once',
      diagnosisDetail: 'Observed error pattern "distributes-sign-once" on this standard.',
      evidence: [], missed: 1, attempted: 1, requiredCorrectResponses: 2, correctResponses: 1, complete: false,
      practiceFamilyIds: ['f2'], forbiddenInstanceIds: ['t1-i1'],
    }],
  };
  const stored = persisted(legacy);
  const progress = correctionPlanProgress(stored);
  assert.ok(progress, 'the planner reads a legacy plan');
  assert.equal(stored.targets[0].diagnosisDetail, legacy.targets[0].diagnosisDetail, 'shown as it was written');
  // A future registry code on new evidence degrades to the standard diagnosis.
  const future = { ...buildMisconceptionEvidence({ classifierId: 'tool:relationMapping/default', findings: [{ code: 'domain-range-swapped', parts: [] }] }), registryVersion: MISCONCEPTION_REGISTRY_VERSION + 1 };
  const target = testCyclePlan([missed('t1', { grading: { misconceptionEvidence: future } }), missed('t2', {})]).targets.find((entry) => entry.targetId === 't1');
  assert.equal(target.diagnosis, CORRECTION_DIAGNOSIS.STANDARD);
});

/* ===========================================================================
 * 29. Versions.
 * ======================================================================== */

test('29. a future registry, classifier or code version is ignored safely; persisted Phase 1 evidence still passes', () => {
  const genuine = buildMisconceptionEvidence({ classifierId: 'tool:linearTableWorkbench/deriveEquation', findings: [{ code: 'initial-value-from-later-reading', parts: ['intercept'] }] });
  [
    { ...genuine, registryVersion: MISCONCEPTION_REGISTRY_VERSION + 1 },
    { ...genuine, classifierVersion: 2 },
    { ...genuine, findings: [{ code: 'initial-value-from-later-reading', codeVersion: 2, parts: [] }] },
    { ...genuine, classifier: 'tool:linearTableWorkbench/deriveEquation@next' },
    buildMisconceptionEvidence({ classifierId: 'tool:systemsWorkspace/inequalities', findings: [{ code: 'inequality-boundary-style', parts: [] }] }) && {
      ...buildMisconceptionEvidence({ classifierId: 'tool:systemsWorkspace/inequalities', findings: [{ code: 'inequality-boundary-style', parts: [] }] }), classifierVersion: 3,
    },
  ].forEach((block, index) => assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: block }), [], `future ${index}`));
  // Evidence a Phase 1 build persisted — the inequalities classifier at v1 — is still trusted at v2.
  const phase1Block = {
    registryVersion: 1, source: 'server-grading', classifier: 'tool:systemsWorkspace/inequalities', classifierVersion: 1,
    findings: [{ code: 'inequality-shaded-wrong-side', codeVersion: 1, parts: ['shade-2'] }],
  };
  assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: persisted(phase1Block) }).map((finding) => finding.code), ['inequality-shaded-wrong-side']);
  // An older reader (simulated: a registry without the Phase 2 codes) drops new codes instead of guessing.
  const olderRegistryKnows = (code) => !['initial-value-from-later-reading', 'composition-order-reversed', 'domain-range-swapped', 'correlation-direction-reversed', 'correlation-treated-as-causation'].includes(code);
  assert.equal(trustedMisconceptionFindings({ misconceptionEvidence: genuine }).filter((finding) => olderRegistryKnows(finding.code)).length, 0);
});

/* ===========================================================================
 * 30-33. Case Review.
 * ======================================================================== */

const row = ({ assignmentId, storageIndex, codes = [] }) => ({
  assignmentId, storageIndex, number: storageIndex + 1, section: 'classwork', required: true, outcome: 'exhausted', finalResult: 'incorrect', latestParts: [],
  misconceptionCodes: codes, misconceptionFindings: codes.map((code) => ({ code, attemptNumber: 1 })),
});
const recoveryRecord = (code, { assignmentId = 'A2', itemId = 'r1', classifierId = 'tool:relationMapping/default', studentId = 'S1' } = {}) => buildRecoveryMisconceptionEvidenceRecord({
  kind: MISCONCEPTION_EVIDENCE_KINDS.SECTION_RECOVERY, studentId, assignmentId, section: 'dol', itemId, fingerprint: `fp-${itemId}`,
  misconceptionEvidence: buildMisconceptionEvidence({ classifierId, findings: [{ code, parts: ['domain', 'range'] }] }),
});

test('30. recurring: the same code on 2+ questions — assignment questions and Recovery items alike', () => {
  const projected = buildCaseEvidenceResponse({
    request: { studentId: 'S1', assignmentIds: ['A1', 'A2'], fromMs: 0, toMs: 1 },
    misconceptionRecords: [{ id: 'x', data: persisted(recoveryRecord('domain-range-swapped')) }],
  }).misconceptionEvidence;
  const patterns = analyzeErrorPatterns({
    questions: [row({ assignmentId: 'A1', storageIndex: 0, codes: ['domain-range-swapped'] }), row({ assignmentId: 'A1', storageIndex: 1, codes: ['domain-range-swapped'] })],
    recoveryEvidence: projected,
  });
  assert.equal(patterns.codes.length, 1);
  assert.equal(patterns.codes[0].recurrence, MISCONCEPTION_RECURRENCE.RECURRING);
  assert.equal(patterns.codes[0].questions, 3);
  assert.equal(patterns.codes[0].recoveryQuestions, 1);
  assert.deepEqual([...patterns.codes[0].assignmentIds].sort(), ['A1', 'A2']);
  assert.equal(patterns.codes[0].description, 'Recurring misconception: Domain and range exchanged (3 questions, 2 assignments, including 1 Recovery question)');
});

test('31. isolated: one question; and nothing proved stays "not determinable"', () => {
  const isolated = analyzeErrorPatterns({ questions: [row({ assignmentId: 'A1', storageIndex: 0, codes: ['composition-order-reversed'] })] });
  assert.equal(isolated.codes[0].recurrence, MISCONCEPTION_RECURRENCE.ISOLATED);
  assert.equal(isolated.codes[0].description, 'Isolated misconception: Composition order exchanged (1 question)');
  const recoveryOnly = analyzeErrorPatterns({ questions: [], recoveryEvidence: [persisted(recoveryRecord('domain-range-swapped'))] });
  assert.equal(recoveryOnly.codes[0].recurrence, MISCONCEPTION_RECURRENCE.ISOLATED);
  // The same Recovery record read twice is one question.
  const twice = analyzeErrorPatterns({ questions: [], recoveryEvidence: [persisted(recoveryRecord('domain-range-swapped')), persisted(recoveryRecord('domain-range-swapped'))] });
  assert.equal(twice.codes[0].questions, 1);
  const none = analyzeErrorPatterns({ questions: [row({ assignmentId: 'A1', storageIndex: 0 })] });
  assert.equal(none.statement, ERROR_PATTERN_NOT_DETERMINABLE);
});

const narrativeModel = (errorPatterns) => ({ summary: { snapshot: {} }, assignments: [], errorPatterns, attemptSummary: { scored: 3 } });

test('32. the Case Review narrative fact is built only from trusted findings, and describes the work', () => {
  const trusted = analyzeErrorPatterns({
    questions: [row({ assignmentId: 'A1', storageIndex: 0, codes: ['domain-range-swapped'] }), row({ assignmentId: 'A2', storageIndex: 0, codes: ['domain-range-swapped'] })],
    recoveryEvidence: [persisted(recoveryRecord('domain-range-swapped', { assignmentId: 'A2' }))],
  });
  const facts = buildNarrativeFacts(narrativeModel(trusted)).filter((fact) => fact.template === 'recurringErrorPattern');
  assert.equal(facts.length, 1);
  assert.equal(facts[0].text, 'MathMaster identified a recurring error pattern on 3 server-graded questions across 2 assignments: domain and range exchanged.');
  assert.deepEqual(narrativeViolations(facts[0].text), []);
  assert.doesNotMatch(facts[0].text, /\b(careless|does not understand|confused|lazy|weak)\b/i, 'the work, never the student');
  assert.deepEqual(narrativeViolations(TEMPLATES.recurringErrorPattern), []);
  // A forged Recovery record (no server provenance) and a bare code list are never counted.
  const forged = { ...persisted(recoveryRecord('domain-range-swapped')), eventKey: 'mev_forged', performance: { misconceptionCodes: ['domain-range-swapped'], misconceptionEvidence: { ...recoveryRecord('domain-range-swapped').performance.misconceptionEvidence, source: 'browser' } } };
  const untrusted = analyzeErrorPatterns({ questions: [row({ assignmentId: 'A1', storageIndex: 0, codes: ['domain-range-swapped'] })], recoveryEvidence: [forged] });
  assert.equal(untrusted.codes[0].recurrence, MISCONCEPTION_RECURRENCE.ISOLATED, 'the forged record added nothing');
  assert.equal(buildNarrativeFacts(narrativeModel(untrusted)).filter((fact) => fact.template === 'recurringErrorPattern').length, 0);
  // An isolated code is not a narrative.
  const isolated = analyzeErrorPatterns({ questions: [row({ assignmentId: 'A1', storageIndex: 0, codes: ['domain-range-swapped'] })] });
  assert.equal(buildNarrativeFacts(narrativeModel(isolated)).filter((fact) => fact.template === 'recurringErrorPattern').length, 0);
});

test('33. another student\'s evidence stays private: never projected into this case, and no response text leaves the server', () => {
  const mine = recoveryRecord('domain-range-swapped', { studentId: 'S1' });
  const theirs = recoveryRecord('domain-range-swapped', { studentId: 'S2', itemId: 'r9' });
  const otherAssignment = recoveryRecord('domain-range-swapped', { studentId: 'S1', assignmentId: 'A9', itemId: 'r3' });
  const response = buildCaseEvidenceResponse({
    request: { studentId: 'S1', assignmentIds: ['A2'], fromMs: 0, toMs: 1 },
    misconceptionRecords: [mine, theirs, otherAssignment].map((record) => ({ id: record.eventKey, data: persisted(record) })),
  });
  assert.deepEqual(response.misconceptionEvidence.map((record) => record.eventKey), [mine.eventKey]);
  // A record without server provenance never leaves the server as evidence.
  const forged = { ...persisted(mine), eventKey: 'mev_forged', performance: { ...persisted(mine).performance, misconceptionEvidence: { ...persisted(mine).performance.misconceptionEvidence, source: 'browser' } } };
  assert.deepEqual(buildCaseEvidenceResponse({ request: { studentId: 'S1', assignmentIds: ['A2'], fromMs: 0, toMs: 1 }, misconceptionRecords: [forged] }).misconceptionEvidence, []);
  assert.deepEqual(Object.keys(response.misconceptionEvidence[0]).sort(), ['eventKey', 'occurredAt', 'performance', 'questionSnapshot', 'source']);
  assert.equal('studentId' in response.misconceptionEvidence[0], false);
  // Only teacher authorization reaches it: the callable is the existing case review one.
  const callable = region(executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')), 'exports.loadStudentCaseEvidence', 'exports.overrideStudentResponseGrade', 'loadStudentCaseEvidence');
  assert.match(callable, /authorizeCaseEvidenceCaller/);
  assert.match(callable, /collection\("misconceptionEvidence"\)/);
  // The rules close the collection to every browser (proven against the emulator in tests/rules/misconceptionEvidenceRules.test.mjs).
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/misconceptionEvidence\/\{recordId\} \{\s*allow read, write: if false;/);
});

/* ===========================================================================
 * 34-35. Never a grade.
 * ======================================================================== */

test('34. supports and accommodations never create a code, and never change one', () => {
  const fullSupport = {
    modified: true, accommodations: ['extended-time', 'read-aloud'], modifications: ['reduce-complexity'],
    hintUsed: true, teacherAssisted: true, scaffoldUsed: true, calculatorUsed: true, isMathematicallyIndependent: false,
  };
  const supportedCorrect = ingestRelation({ work: CORRECT, supportUsage: fullSupport });
  assert.equal('misconceptionCodes' in supportedCorrect.evidenceEvent.performance, false);
  const supportedUnmodeled = ingestRelation({ work: { domainText: '7', rangeText: '8' }, supportUsage: fullSupport });
  assert.equal('misconceptionCodes' in supportedUnmodeled.evidenceEvent.performance, false);
  assert.deepEqual(
    ingestRelation({ work: SWAPPED, supportUsage: fullSupport }).evidenceEvent.performance.misconceptionEvidence,
    ingestRelation({ work: SWAPPED }).evidenceEvent.performance.misconceptionEvidence,
  );
  // The site helper is never handed support data at all.
  const sites = executableSource(readFileSync(new URL('../../functions/shared/misconceptionEvidenceSites.mjs', import.meta.url), 'utf8'));
  assert.doesNotMatch(sites, /supportUsage|accommodation/);
});

const throwing = () => { throw new Error('classifier exploded'); };
const silent = () => ({ classifier: null, findings: [], evidence: null });

test('35. grades, attempts and Recovery results are identical with classification disabled or throwing', () => {
  // The deadline finalizer.
  const checkpoint = checkpointFor({ work: SWAPPED });
  const withCode = finalize({ checkpoint }).finalization;
  [throwing, silent].forEach((classify) => {
    const without = finalize({ checkpoint, classify }).finalization;
    assert.deepEqual(without.record, withCode.record);
    assert.deepEqual(without.result, withCode.result);
    assert.deepEqual(without.dolGrade ?? null, withCode.dolGrade ?? null);
    const { misconceptionCodes: _codes, misconceptionEvidence: _evidence, ...performance } = withCode.evidenceEvent.performance;
    assert.deepEqual(without.evidenceEvent, { ...withCode.evidenceEvent, performance }, 'the event differs only by the two misconception fields');
  });
  // Section Recovery: record, results, score and response byte-identical.
  const assignment = recoveryAssignment();
  const started = startRecovery(assignment);
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, signReversedZeros(reproduce(assignment, item))]));
  const classified = submitRecovery({ assignment, record: started, responses });
  assert.ok(classified.misconceptionEvidence.length > 0, 'fixture: this submission does classify');
  [throwing, silent].forEach((classify) => {
    const plain = submitRecovery({ assignment, record: started, responses, classify });
    assert.equal(JSON.stringify(plain.record), JSON.stringify(classified.record));
    assert.deepEqual(plain.response, classified.response);
    assert.equal(plain.gradeChanged, classified.gradeChanged);
    assert.deepEqual(plain.misconceptionEvidence, []);
  });
  // Recovery Practice.
  const practiceAssignment = recoveryAssignment();
  const item = nextRecoveryPracticeItem(recoveryContext({ assignment: practiceAssignment }));
  const payload = { pin: item.pin, practiceIndex: item.practiceIndex, response: signReversedZeros(reproduce(practiceAssignment, item)) };
  const practiced = runSectionRecoveryAction({ context: recoveryContext({ assignment: practiceAssignment }), action: RECOVERY_ACTION.PRACTICE, payload, at: NOW });
  const practicedPlain = runSectionRecoveryAction({ context: recoveryContext({ assignment: practiceAssignment, classify: throwing }), action: RECOVERY_ACTION.PRACTICE, payload, at: NOW });
  assert.equal(JSON.stringify(practicedPlain.record), JSON.stringify(practiced.record));
  assert.deepEqual(practicedPlain.response, practiced.response);
  // Every Phase 2 fixture: the classifier never touches the grading it reads.
  MISCONCEPTION_FIXTURES_PHASE2.forEach((entry) => {
    const grading = gradeFixture(entry);
    const before = JSON.stringify(grading);
    classifyMisconceptions({ ...entry, grading });
    assert.equal(JSON.stringify(grading), before, entry.name);
  });
  // The finalizer reads the classifier's result in exactly one place: the event builder.
  const finalizer = executableSource(readFileSync(new URL('../../functions/shared/responseCheckpointFinalizer.mjs', import.meta.url), 'utf8'));
  const mentions = finalizer.match(/\bmisconceptionEvidence\b[^\n]*/g) || [];
  assert.deepEqual(mentions.map((line) => line.trim()), ['misconceptionEvidence = gradedResponseMisconceptionEvidence({', 'misconceptionEvidence,']);
  (finalizer.match(/recordQuestionAttempt\(\{[\s\S]*?\}\);/g) || []).forEach((call) => assert.doesNotMatch(call, /misconception/i));
});
