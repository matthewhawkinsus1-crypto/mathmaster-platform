// SERVER-AUTHORITATIVE MISCONCEPTION EVIDENCE.
//
// A misconception code is evidence about mathematical thinking, never a grade.
// The server derives it from the authoritative question, the student's raw
// work and its own grading result (functions/shared/misconceptionClassifiers.mjs),
// stores it with provenance on the attempt's evidence event — a collection no
// client can write — and every reader accepts it only through the registry's
// trust gate (functions/shared/misconceptionCodes.mjs). This suite holds the
// whole contract, numbered as the brief numbers its requirements:
//
//    1 known wrong work → the intended code        8 different codes stay distinct
//    2 correct work → no code                      9 a classmate's evidence stays theirs
//    3 a different wrong strategy → not that code 10 the grade is identical with and without it
//    4 ambiguous wrong work → no code             11 support does not create a code
//    5 a client-forged code is refused            12 old attempts without the field are valid
//    6 the code persists and reaches Case Review  13 an unknown future code/version degrades
//    7 a repeated code aggregates (recurring)
//
// Mutation testing of the classifiers is in misconceptionClassifierMutation.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MISCONCEPTION_CLASSIFIERS,
  MISCONCEPTION_EXCLUSIVITY,
  MISCONCEPTION_REGISTRY,
  MISCONCEPTION_REGISTRY_VERSION,
  buildMisconceptionEvidence,
  trustedMisconceptionFindings,
} from '../../functions/shared/misconceptionCodes.mjs';
import { IMPLEMENTED_MISCONCEPTION_CLASSIFIERS, classifyMisconceptions } from '../../functions/shared/misconceptionClassifiers.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { buildIngestedAttempt, buildSubmissionEnvelope, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildCaseEvidenceResponse, projectAttemptEvent } from '../../functions/shared/caseReviewEvidence.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { learnerToken } from '../../functions/shared/questionGenerationIdentity.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import {
  ERROR_PATTERN_NOT_DETERMINABLE, MISCONCEPTION_RECURRENCE, analyzeErrorPatterns, errorPatternForQuestion,
} from '../../src/platform/caseReview/errorPatterns.js';
import { MISCONCEPTION_FIXTURES, classifiedCodes, familyInstance, fieldsResponse, gradeFixture } from './helpers/misconceptionFixtures.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

// --- A real assignment, real family slots, real pins ---------------------------------------

const STUDENT = 'S940001'; // synthetic
const CLASSMATE = 'S940002'; // synthetic
const CAPTURED_AT = Date.parse('2026-09-28T15:00:00Z');
const SLOTS = [
  { questionId: 'q-slope-1', type: 'multiAnswer', activityRole: 'classwork', standards: { primary: ['A.3A'] }, questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer' } },
  { questionId: 'q-slope-2', type: 'multiAnswer', activityRole: 'classwork', standards: { primary: ['A.3A'] }, questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer' } },
  { questionId: 'q-vertex', type: 'multiAnswer', activityRole: 'classwork', standards: { primary: ['A.7A'] }, questionFamily: { id: 'quadratics.identifyVertex', version: 1, tool: 'multiAnswer' } },
];
const ASSIGNMENT = {
  id: 'a-synthetic-evidence',
  title: 'Slope and vertex (synthetic)',
  schemaVersion: 5,
  assignedClassIds: ['C1'],
  releaseAt: '2026-09-21T08:00:00-05:00',
  dueAt: '2026-10-30',
  generationSeats: { version: 1, byClassId: { C1: { [learnerToken('a-synthetic-evidence', STUDENT)]: 3, [learnerToken('a-synthetic-evidence', CLASSMATE)]: 7 } } },
  sections: [{ id: 'cw', role: 'classwork', questions: SLOTS }],
};

const SEATS = { [STUDENT]: 3, [CLASSMATE]: 7 };
const delivered = (index, studentId = STUDENT) => resolveFamilyQuestionInstance({
  question: SLOTS[index],
  assignmentId: ASSIGNMENT.id,
  storageIndex: index,
  allocation: { seat: SEATS[studentId], variant: 0, stride: 40, index: SEATS[studentId], basis: 'seated' },
});

let actionCounter = 0;
const ingest = ({ index, fields, record = null, studentId = STUDENT, claimed = null, supportUsage = undefined, at = CAPTURED_AT }) => {
  const instance = delivered(index, studentId);
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${(actionCounter += 1)}`,
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: ASSIGNMENT.id,
    questionIndex: index,
    questionId: SLOTS[index].questionId,
    activityRole: 'classwork',
    capturedAt: at,
    previousTotalAttempts: Number(record?.totalAttempts || 0),
    record: claimed || { status: 'attempted', attemptCount: 1, totalAttempts: Number(record?.totalAttempts || 0) + 1 },
    response: fieldsResponse(fields),
    familyDelivery: instance.delivery,
    ...(supportUsage ? { supportUsage } : {}),
  })), { studentId });
  return buildIngestedAttempt({ envelope, assignment: ASSIGNMENT, question: SLOTS[index], canonicalRecord: record, gradeDocument: { classId: 'C1' }, ingestedAt: at + 1000 });
};

const slopeValues = (index, studentId = STUDENT) => delivered(index, studentId).instance.values;
const slopeAnswers = (index, studentId = STUDENT) => {
  const { rise, run } = slopeValues(index, studentId);
  return { correct: `${rise}/${run}`, runOverRise: `${run}/${rise}`, signReversed: `${-rise}/${run}`, unmodeled: '1000' };
};

// Firestore stores plain data: what is read back is what survived serialization.
const persisted = (value) => JSON.parse(JSON.stringify(value));

const caseReview = ({ records, events, studentId = STUDENT }) => {
  const evidence = buildCaseEvidenceResponse({
    request: { studentId, assignmentIds: [ASSIGNMENT.id], fromMs: CAPTURED_AT - 86_400_000, toMs: CAPTURED_AT + 30 * 86_400_000 },
    events: events.map((event) => ({ id: event.eventKey, data: persisted(event) })),
    nowMs: CAPTURED_AT,
  });
  const analysis = analyzeAssignmentQuestions({
    assignment: ASSIGNMENT,
    student: { id: studentId, classId: 'C1', gradesByAssignment: { [ASSIGNMENT.id]: persisted(records) } },
    attemptEvents: evidence.attemptEvents,
  });
  return { evidence, rows: analysis.questions, patterns: analyzeErrorPatterns({ questions: analysis.questions }) };
};

// --- The registry ---------------------------------------------------------------------

test('the registry is one versioned catalog: every code is defined in full, and every classifier is declared and implemented', () => {
  assert.equal(MISCONCEPTION_REGISTRY_VERSION, 1);
  const ids = MISCONCEPTION_REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  MISCONCEPTION_REGISTRY.forEach((entry) => {
    assert.match(entry.id, /^[a-z]+(?:-[a-z]+)*$/, entry.id);
    ['concept', 'domain', 'label', 'teacherMeaning', 'evidenceRequired'].forEach((field) => assert.ok(String(entry[field] || '').length > 3, `${entry.id}.${field}`));
    assert.ok(Number.isInteger(entry.version) && entry.version >= 1, `${entry.id}.version`);
    assert.ok(Object.values(MISCONCEPTION_EXCLUSIVITY).includes(entry.exclusivity), `${entry.id}.exclusivity`);
    entry.supersedes.forEach((other) => assert.ok(ids.includes(other), `${entry.id} supersedes a registered code`));
    // Codes describe mathematical thinking, never the student.
    assert.doesNotMatch(`${entry.label} ${entry.teacherMeaning}`, /\b(careless|lazy|confused student|weak|low|struggling)\b/i, entry.id);
  });
  assert.deepEqual([...IMPLEMENTED_MISCONCEPTION_CLASSIFIERS].sort(), MISCONCEPTION_CLASSIFIERS.map((entry) => entry.id).sort(), 'declared = implemented');
  MISCONCEPTION_CLASSIFIERS.forEach((entry) => entry.codes.forEach((code) => assert.ok(ids.includes(code), `${entry.id} may emit ${code}`)));
  const emittable = new Set(MISCONCEPTION_CLASSIFIERS.flatMap((entry) => entry.codes));
  ids.forEach((id) => assert.ok(emittable.has(id), `${id} has a classifier — no code exists only on paper`));
  // Every code is exercised by a fixture that produces it.
  const produced = new Set(MISCONCEPTION_FIXTURES.flatMap((fixture) => fixture.expected));
  ids.forEach((id) => assert.ok(produced.has(id), `${id} has a fixture that produces it`));
});

// --- 1-4: the classifiers ----------------------------------------------------------------

test('1-4. every fixture: known wrong work gets its code; correct, different, ambiguous and unmodeled work get exactly what they should', () => {
  MISCONCEPTION_FIXTURES.forEach((fixture) => {
    assert.deepEqual(classifiedCodes(classifyMisconceptions, fixture), [...fixture.expected].sort(), fixture.name);
  });
  const kinds = (pattern) => MISCONCEPTION_FIXTURES.filter((fixture) => pattern.test(fixture.name));
  assert.ok(kinds(/: correct$/).length >= 13, 'every classifier has a correct-work fixture');
  assert.ok(kinds(/not named|not a |not judged|cannot tell/).length >= 15, 'and a body of no-code fixtures');
});

test('2. correct work produces no misconception — on every classifier', () => {
  MISCONCEPTION_FIXTURES.filter((fixture) => fixture.expected.length === 0 && gradeFixture(fixture).isCorrect === true).forEach((fixture) => {
    const result = classifyMisconceptions({ question: fixture.question, response: fixture.response, grading: gradeFixture(fixture), familyValues: fixture.familyValues });
    assert.equal(result.evidence, null, fixture.name);
  });
  // Even a grading result that lies about a part: a correct verdict is never classified.
  const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === 'slope: run over rise');
  const grading = { ...gradeFixture(fixture), isCorrect: true };
  assert.equal(classifyMisconceptions({ question: fixture.question, response: fixture.response, grading, familyValues: fixture.familyValues }).evidence, null);
});

test('3. a different wrong strategy does not receive the first strategy\'s code', () => {
  const pairs = [
    ['slope: run over rise', 'slope: sign reversed'],
    ['two-step: constant moved without changing sign', 'two-step: divided only some terms'],
    ['intercepts: swapped points', 'intercepts: pairs written (y, x)'],
    ['vertex: x sign reversed', 'vertex: written (y, x)'],
    ['substitution: partial distribution, y from the first equation', 'substitution: on one line only, not the distribution error'],
    ['number line: open circle for ≥', 'number line: ray reversed'],
    ['line features: run over rise', 'line features: slope and intercept exchanged'],
  ];
  const byName = new Map(MISCONCEPTION_FIXTURES.map((fixture) => [fixture.name, fixture]));
  pairs.forEach(([first, second]) => {
    const firstCodes = classifiedCodes(classifyMisconceptions, byName.get(first));
    const secondCodes = classifiedCodes(classifyMisconceptions, byName.get(second));
    assert.equal(firstCodes.length, 1, first);
    assert.equal(secondCodes.length, 1, second);
    assert.notDeepEqual(firstCodes, secondCodes, `${first} vs ${second}`);
  });
});

test('4. ambiguous wrong work gets no diagnosis — two explanations are no explanation', () => {
  [
    'slope: both errors at once is not named',
    'slope 1: −1 matches two strategies and is not named',
    'two-step: −x has two causes and is not named',
    'intercepts: equal values cannot tell a swap from a reversal',
    'line features: a swap that is also a sign error is not named',
    'number line: the complement is not named',
    'zeros: opposite zeros in the wrong boxes are not a sign error',
  ].forEach((name) => {
    const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === name);
    assert.ok(fixture, name);
    assert.equal(gradeFixture(fixture).isCorrect, false, `${name} is wrong work`);
    assert.deepEqual(classifiedCodes(classifyMisconceptions, fixture), [], name);
  });
  // No graded result, no tool, no family parameters: nothing to classify.
  const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === 'slope: run over rise');
  assert.equal(classifyMisconceptions({ question: fixture.question, response: fixture.response, grading: { graded: false, reason: 'blank-response' }, familyValues: fixture.familyValues }).evidence, null);
  assert.equal(classifyMisconceptions({ question: fixture.question, response: fixture.response, grading: gradeFixture(fixture), familyValues: null }).evidence, null, 'parameters come from the server, or there is no classification');
  assert.equal(classifyMisconceptions({}).evidence, null);
  // A classifier that throws is no code — never a failed submission.
  assert.equal(classifyMisconceptions({ question: fixture.question, response: fixture.response, grading: gradeFixture(fixture), familyValues: { get rise() { throw new Error('boom'); } } }).evidence, null);
});

// --- 5: forged codes ------------------------------------------------------------------------

test('5. a client-forged code is refused on every path: browser record, server re-grade, bare event lists and forged provenance', () => {
  // (a) A server-re-graded attempt whose browser record names a code: the record the server stores is its own.
  const forgedRecord = {
    status: 'attempted', attemptCount: 1, totalAttempts: 1,
    partGrades: [{ id: 'slope', label: 'Slope', isComplete: true, isCorrect: false, misconceptionCode: 'slope-sign-reversed' }],
  };
  const answers = slopeAnswers(0);
  const regraded = ingest({ index: 0, fields: { slope: answers.unmodeled }, claimed: forgedRecord });
  assert.equal(regraded.gradedBy, 'server');
  assert.equal(JSON.stringify(regraded.record).includes('misconceptionCode'), false);
  assert.equal('misconceptionCodes' in regraded.evidenceEvent.performance, false, 'unmodeled work stays unclassified whatever the browser said');

  // (b) A record the server cannot re-mark (sanitized path): a claimed code is dropped from the stored record.
  const opaqueQuestion = { questionId: 'q-tool', id: 'q-tool', type: 'graphing2', activityRole: 'classwork' };
  const assignment = { ...ASSIGNMENT, sections: [{ id: 'cw', role: 'classwork', questions: [opaqueQuestion] }] };
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'act-forged', kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: assignment.id, questionIndex: 0, questionId: 'q-tool',
    activityRole: 'classwork', capturedAt: CAPTURED_AT, previousTotalAttempts: 0, record: forgedRecord,
  })), { studentId: STUDENT });
  const sanitized = buildIngestedAttempt({ envelope, assignment, question: opaqueQuestion, canonicalRecord: null, ingestedAt: CAPTURED_AT + 1000 });
  assert.equal(sanitized.gradedBy, 'client');
  assert.equal(sanitized.record.partGrades.length, 1, 'the part itself is kept');
  assert.equal('misconceptionCode' in sanitized.record.partGrades[0], false, 'its forged code is not');
  assert.equal('misconceptionCodes' in sanitized.evidenceEvent.performance, false);

  // (c) The browser's own attempt recorder keeps no code on a part either.
  const local = recordQuestionAttempt({ record: null, isCorrect: false, parts: forgedRecord.partGrades, maximumAttempts: 3 });
  assert.equal('misconceptionCode' in local.record.partGrades[0], false);

  // (d) The trust gate: a bare list, a forged source, an undeclared classifier, a code the
  // classifier may not emit, a malformed block — none is evidence.
  const genuine = buildMisconceptionEvidence({ classifierId: 'family:linear.slopeFromPoints@1', findings: [{ code: 'slope-sign-reversed', parts: ['slope'] }] });
  assert.equal(trustedMisconceptionFindings({ misconceptionEvidence: genuine }).length, 1, 'the genuine block passes');
  [
    { misconceptionCodes: ['slope-sign-reversed'] },
    { misconceptionEvidence: { ...genuine, source: 'browser' } },
    { misconceptionEvidence: { ...genuine, classifier: 'family:made.up@1' } },
    { misconceptionEvidence: { ...genuine, findings: [{ code: 'zeros-sign-reversed', codeVersion: 1, parts: [] }] } },
    { misconceptionEvidence: { ...genuine, findings: [{ code: 'whatever', codeVersion: 1, parts: [] }] } },
    { misconceptionEvidence: { ...genuine, findings: [{ code: 'slope-sign-reversed' }] } },
    { misconceptionEvidence: [genuine] },
    { misconceptionEvidence: 'slope-sign-reversed' },
  ].forEach((performance, index) => assert.deepEqual(trustedMisconceptionFindings(performance), [], `forgery ${index}`));
  assert.equal(buildMisconceptionEvidence({ classifierId: 'family:linear.slopeFromPoints@1', findings: [{ code: 'whatever' }] }), null);
  // The evidence builder re-checks the block it is handed: it cannot be made to store a forgery.
  const eventWith = (misconceptionEvidence) => buildAttemptEvidenceEvent({
    studentId: STUDENT, assignment: ASSIGNMENT, question: delivered(0).question, questionIndex: 0, activityRole: 'classwork',
    attemptRecord: { status: 'attempted', totalAttempts: 1 }, attemptResult: { isCorrect: false }, misconceptionEvidence,
  });
  assert.deepEqual(eventWith(genuine).performance.misconceptionCodes, ['slope-sign-reversed']);
  [
    { ...genuine, classifier: 'family:made.up@1' },
    { ...genuine, findings: [{ code: 'zeros-sign-reversed', codeVersion: 1, parts: [] }] },
    { ...genuine, source: 'browser' },
  ].forEach((block, index) => assert.equal('misconceptionCodes' in eventWith(block).performance, false, `builder forgery ${index}`));

  // (e) A code written straight onto grades/{sid} (student-writable) never reaches the case review.
  const honest = ingest({ index: 0, fields: { slope: answers.unmodeled } });
  const tampered = { ...honest.record, partGrades: honest.record.partGrades.map((part) => ({ ...part, misconceptionCode: 'slope-sign-reversed' })) };
  const tamperedEvent = { ...honest.evidenceEvent, performance: { ...honest.evidenceEvent.performance, misconceptionCodes: ['slope-sign-reversed'] } };
  const { rows, patterns } = caseReview({ records: { 0: tampered }, events: [tamperedEvent] });
  assert.deepEqual(rows[0].misconceptionCodes, []);
  assert.equal(patterns.statement, ERROR_PATTERN_NOT_DETERMINABLE);
});

// --- 6-8: persistence, aggregation, distinct codes ------------------------------------------

test('6. a server-classified code survives persistence and reaches Case Review with its provenance', () => {
  const answers = slopeAnswers(0);
  const built = ingest({ index: 0, fields: { slope: answers.runOverRise } });
  assert.equal(built.gradedBy, 'server');
  const stored = persisted(built.evidenceEvent);
  assert.deepEqual(stored.performance.misconceptionCodes, ['slope-run-over-rise']);
  assert.deepEqual(stored.performance.misconceptionEvidence, {
    registryVersion: MISCONCEPTION_REGISTRY_VERSION,
    source: 'server-grading',
    classifier: 'family:linear.slopeFromPoints@1',
    classifierVersion: 1,
    findings: [{ code: 'slope-run-over-rise', codeVersion: 1, parts: ['slope'] }],
  });
  // Provenance a teacher can read: the question/family, the attempt, the time.
  assert.equal(stored.questionSnapshot.questionId, 'q-slope-1');
  assert.equal(stored.questionSnapshot.familyId, 'linear.slopeFromPoints');
  assert.equal(stored.performance.attemptNumber, 1);
  assert.equal(stored.occurredAt, CAPTURED_AT);

  const { evidence, rows, patterns } = caseReview({ records: { 0: built.record }, events: [built.evidenceEvent] });
  assert.deepEqual(evidence.attemptEvents[0].performance.misconceptionCodes, ['slope-run-over-rise']);
  assert.deepEqual(rows[0].misconceptionCodes, ['slope-run-over-rise']);
  assert.deepEqual(rows[0].misconceptionFindings, [{
    code: 'slope-run-over-rise', parts: ['slope'], classifier: 'family:linear.slopeFromPoints@1', classifierVersion: 1, attemptNumber: 1, occurredAt: CAPTURED_AT,
  }]);
  const pattern = errorPatternForQuestion(rows[0]);
  assert.equal(pattern.determinable, true);
  assert.equal(pattern.codes[0].label, 'Slope computed as run over rise');
  assert.match(pattern.codes[0].meaning, /reciprocal/);
  assert.equal(patterns.codes[0].recurrence, MISCONCEPTION_RECURRENCE.ISOLATED);
  assert.equal(patterns.codes[0].description, 'Isolated misconception: Slope computed as run over rise (1 question)');
  // The projection carries no response text.
  assert.equal(JSON.stringify(evidence.attemptEvents).includes(answers.runOverRise), false);
});

test('7. a repeated code aggregates: on two questions it is recurring; on two attempts of one question it is isolated, counted twice', () => {
  const first = ingest({ index: 0, fields: { slope: slopeAnswers(0).runOverRise } });
  const second = ingest({ index: 1, fields: { slope: slopeAnswers(1).runOverRise }, at: CAPTURED_AT + 60_000 });
  const recurring = caseReview({ records: { 0: first.record, 1: second.record }, events: [first.evidenceEvent, second.evidenceEvent] });
  assert.equal(recurring.patterns.codes.length, 1);
  assert.equal(recurring.patterns.codes[0].code, 'slope-run-over-rise');
  assert.equal(recurring.patterns.codes[0].questions, 2);
  assert.equal(recurring.patterns.codes[0].recurrence, MISCONCEPTION_RECURRENCE.RECURRING);
  assert.equal(recurring.patterns.recurring, 1);
  assert.match(recurring.patterns.statement, /^1 recurring misconception identified/);
  assert.equal(recurring.patterns.codes[0].description, 'Recurring misconception: Slope computed as run over rise (2 questions, 1 assignment)');

  const retry = ingest({ index: 0, fields: { slope: slopeAnswers(0).runOverRise }, record: first.record, at: CAPTURED_AT + 120_000 });
  assert.equal(retry.evidenceEvent.performance.attemptNumber, 2);
  const repeated = caseReview({ records: { 0: retry.record }, events: [first.evidenceEvent, retry.evidenceEvent] });
  assert.equal(repeated.patterns.codes[0].questions, 1);
  assert.equal(repeated.patterns.codes[0].attempts, 2);
  assert.equal(repeated.patterns.codes[0].recurrence, MISCONCEPTION_RECURRENCE.ISOLATED);
  assert.equal(repeated.patterns.codes[0].description, 'Isolated misconception: Slope computed as run over rise (1 question, on 2 attempts)');
  assert.equal(errorPatternForQuestion(repeated.rows[0]).codes[0].attempts, 2);
});

test('8. different misconception codes remain distinct', () => {
  const slope = ingest({ index: 0, fields: { slope: slopeAnswers(0).signReversed } });
  const { h, k } = delivered(2).instance.values;
  assert.notEqual(h, 0, 'fixture: this seat\'s vertex has a non-zero h');
  const vertex = ingest({ index: 2, fields: { vertex: `(${-h}, ${k})` } });
  const { patterns, rows } = caseReview({ records: { 0: slope.record, 2: vertex.record }, events: [slope.evidenceEvent, vertex.evidenceEvent] });
  assert.deepEqual(rows.map((row) => row.misconceptionCodes), [['slope-sign-reversed'], [], ['vertex-x-sign-reversed']]);
  assert.deepEqual(patterns.codes.map((entry) => [entry.code, entry.questions, entry.recurrence]).sort(), [
    ['slope-sign-reversed', 1, 'isolated'],
    ['vertex-x-sign-reversed', 1, 'isolated'],
  ]);
  assert.equal(patterns.isolated, 2);
});

// --- 9: privacy -----------------------------------------------------------------------------

test('9. a classmate\'s evidence stays private: never projected into another student\'s case, and never graded against their question', () => {
  const mine = ingest({ index: 0, fields: { slope: slopeAnswers(0).signReversed } });
  const theirs = ingest({ index: 0, fields: { slope: slopeAnswers(0, CLASSMATE).runOverRise }, studentId: CLASSMATE });
  assert.deepEqual(theirs.evidenceEvent.performance.misconceptionCodes, ['slope-run-over-rise']);
  // Even if a classmate's event were handed to this student's case, it is not projected.
  const { evidence, rows } = caseReview({ records: { 0: mine.record }, events: [mine.evidenceEvent, theirs.evidenceEvent] });
  assert.equal(evidence.attemptEvents.length, 1);
  assert.deepEqual(rows[0].misconceptionCodes, ['slope-sign-reversed']);
  // A student who submits on a classmate's pin is held for a teacher, never classified.
  const instance = delivered(0, CLASSMATE);
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'act-pin', kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: ASSIGNMENT.id, questionIndex: 0, questionId: 'q-slope-1',
    activityRole: 'classwork', capturedAt: CAPTURED_AT, previousTotalAttempts: 0, record: { status: 'attempted', attemptCount: 1, totalAttempts: 1 },
    response: fieldsResponse({ slope: slopeAnswers(0, CLASSMATE).runOverRise }), familyDelivery: instance.delivery,
  })), { studentId: STUDENT });
  const held = buildIngestedAttempt({ envelope, assignment: ASSIGNMENT, question: SLOTS[0], canonicalRecord: null, gradeDocument: { classId: 'C1' }, ingestedAt: CAPTURED_AT + 1000 });
  assert.equal(held.blocked, true);
  assert.equal(held.evidenceEvent, undefined);
  // The stored provenance holds codes and part ids only — no student work.
  const block = JSON.stringify(mine.evidenceEvent.performance.misconceptionEvidence);
  assert.equal(block.includes(slopeAnswers(0).signReversed), false);
  assert.deepEqual(Object.keys(mine.evidenceEvent.performance.misconceptionEvidence).sort(), ['classifier', 'classifierVersion', 'findings', 'registryVersion', 'source']);
});

// --- 10-11: never a grade; support creates nothing ----------------------------------------

const GRADE_FIELDS = ['status', 'attemptCount', 'totalAttempts', 'partialCredit', 'bestPartialCredit', 'partGrades', 'supportUsage', 'lastResponseKey'];

test('10. the grade is identical with and without classification', () => {
  const answers = slopeAnswers(0);
  [answers.runOverRise, answers.signReversed, answers.unmodeled, answers.correct].forEach((answer) => {
    const built = ingest({ index: 0, fields: { slope: answer } });
    // The same attempt recorded with no classifier anywhere in the path.
    const response = fieldsResponse({ slope: answer });
    const grading = gradeServerResponse({ question: delivered(0).question, response });
    const inputs = attemptInputsFromGrading(grading);
    const plain = recordQuestionAttempt({
      record: null, ...inputs, timeSpent: 0, maximumAttempts: 3, occurredAt: CAPTURED_AT, responseKey: JSON.stringify(response.fields),
    });
    GRADE_FIELDS.forEach((field) => assert.deepEqual(built.record[field], plain.record[field], `${answer}: ${field}`));
    ['isCorrect', 'status', 'attemptCount', 'remainingAttempts', 'expired', 'partialCredit'].forEach((field) => assert.deepEqual(built.result[field], plain.result[field], `${answer}: result.${field}`));
  });

  // The evidence event differs ONLY by the two misconception fields.
  const built = ingest({ index: 0, fields: { slope: answers.runOverRise } });
  const event = built.evidenceEvent;
  const without = buildAttemptEvidenceEvent({
    studentId: STUDENT, assignment: ASSIGNMENT, question: delivered(0).question, questionIndex: 0, activityRole: 'classwork',
    attemptRecord: built.record, attemptResult: built.result, supportUsage: built.record.supportUsage, occurredAt: CAPTURED_AT,
  });
  const { misconceptionCodes: _codes, misconceptionEvidence: _evidence, ...performance } = event.performance;
  assert.deepEqual({ ...event, performance }, without);

  // The classifier never touches the grading result it reads.
  const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === 'line features: slope and intercept exchanged');
  const grading = gradeFixture(fixture);
  const before = JSON.stringify(grading);
  classifyMisconceptions({ question: fixture.question, response: fixture.response, grading, familyValues: null });
  assert.equal(JSON.stringify(grading), before);

  // And ingestion hands it to nothing but the evidence event.
  const source = executableSource(readFileSync(new URL('../../functions/shared/submissionIngestion.mjs', import.meta.url), 'utf8'));
  const mentions = source.match(/\bmisconception\b[^\n]*/g) || [];
  assert.deepEqual(mentions.map((line) => line.trim()), [
    'misconception = null;',
    'misconception = classifyMisconceptions({',
    'misconception?.evidence || null,',
  ]);
  (source.match(/recordQuestionAttempt\(\{[\s\S]*?\}\);/g) || []).forEach((call) => assert.doesNotMatch(call, /misconception/i));
});

test('11. accommodations and supports never create a code, and never change one', () => {
  const answers = slopeAnswers(0);
  const fullSupport = {
    modified: true, accommodations: ['extended-time', 'read-aloud'], modifications: ['reduce-complexity'],
    hintUsed: true, teacherAssisted: true, scaffoldUsed: true, contextScaffoldUsed: true, remediationUsed: true, workedExampleUsed: true, calculatorUsed: true,
    isMathematicallyIndependent: false,
  };
  const supportedCorrect = ingest({ index: 0, fields: { slope: answers.correct }, supportUsage: fullSupport });
  assert.equal(supportedCorrect.record.status, 'correct');
  assert.equal('misconceptionCodes' in supportedCorrect.evidenceEvent.performance, false, 'support on correct work is no code');
  const supportedUnmodeled = ingest({ index: 0, fields: { slope: answers.unmodeled }, supportUsage: fullSupport });
  assert.equal('misconceptionCodes' in supportedUnmodeled.evidenceEvent.performance, false, 'support on wrong work is no code');
  const supported = ingest({ index: 0, fields: { slope: answers.runOverRise }, supportUsage: fullSupport });
  const unsupported = ingest({ index: 0, fields: { slope: answers.runOverRise } });
  assert.deepEqual(supported.evidenceEvent.performance.misconceptionEvidence, unsupported.evidenceEvent.performance.misconceptionEvidence);
  assert.equal(supported.evidenceEvent.supportUsage.hintUsed, true, 'support is still recorded, beside the code, as before');
  // A support-narrowed family instance is classified on its own numbers like any other.
  const { question, values } = familyInstance('linear.twoStepEquation', { x: 2, a: 2, b: 3 }, { constraints: { coefficientRange: [2, 6], constantRange: [-8, 8], solutionRange: [-6, 6] } });
  const response = fieldsResponse({ solution: String((values.c + values.b) / values.a) });
  const grading = gradeServerResponse({ question, response });
  assert.deepEqual(classifyMisconceptions({ question, response, grading, familyValues: values }).findings.map((entry) => entry.code), ['inverse-operation-sign']);
});

// --- 12-13: old and future data ----------------------------------------------------------------

test('12. old attempts with no misconception field — and old bare code lists — remain valid and read as "not determinable"', () => {
  const built = ingest({ index: 0, fields: { slope: slopeAnswers(0).unmodeled } });
  assert.deepEqual(Object.keys(built.evidenceEvent.performance), ['score', 'isCorrect', 'attemptNumber', 'status', 'partialCredit', 'isMathematicallyIndependent']);
  const legacyEvent = persisted(built.evidenceEvent);
  const preRegistryEvent = { ...legacyEvent, eventKey: 'ev-legacy', performance: { ...legacyEvent.performance, misconceptionCodes: ['slope-direction', 'sign-error'] } };
  const legacyRecord = { ...built.record, partGrades: built.record.partGrades.map((part) => ({ ...part, misconceptionCode: 'slope-direction' })) };
  const projected = projectAttemptEvent(preRegistryEvent, 'ev-legacy');
  assert.equal('misconceptionCodes' in projected.performance, false);
  const { rows, patterns } = caseReview({ records: { 0: legacyRecord }, events: [preRegistryEvent] });
  assert.deepEqual(rows[0].misconceptionCodes, []);
  assert.deepEqual(rows[0].misconceptionFindings, []);
  assert.equal(errorPatternForQuestion(rows[0]).statement, ERROR_PATTERN_NOT_DETERMINABLE);
  assert.equal(patterns.determinable, false);
  assert.equal(patterns.statement, ERROR_PATTERN_NOT_DETERMINABLE);
  assert.equal(rows[0].finalResult, 'incorrect', 'the attempt itself still reads as before');
});

test('13. an unknown future code, code version, classifier version or registry version degrades safely to "not determinable"', () => {
  const genuine = buildMisconceptionEvidence({ classifierId: 'family:linear.slopeFromPoints@1', findings: [{ code: 'slope-run-over-rise', parts: ['slope'] }] });
  const futures = [
    { ...genuine, registryVersion: MISCONCEPTION_REGISTRY_VERSION + 1 },
    { ...genuine, classifierVersion: 2 },
    { ...genuine, findings: [{ code: 'slope-run-over-rise', codeVersion: 2, parts: ['slope'] }] },
    { ...genuine, findings: [{ code: 'a-code-from-registry-v2', codeVersion: 1, parts: ['slope'] }] },
    { ...genuine, classifier: 'family:linear.slopeFromPoints@2' },
  ];
  const built = ingest({ index: 0, fields: { slope: slopeAnswers(0).unmodeled } });
  futures.forEach((block, index) => {
    assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: block }), [], `future ${index}`);
    const event = { ...built.evidenceEvent, eventKey: `ev-future-${index}`, performance: { ...built.evidenceEvent.performance, misconceptionCodes: block.findings.map((finding) => finding.code), misconceptionEvidence: block } };
    const { rows, patterns } = caseReview({ records: { 0: built.record }, events: [event] });
    assert.deepEqual(rows[0].misconceptionCodes, [], `future ${index}`);
    assert.equal(patterns.statement, ERROR_PATTERN_NOT_DETERMINABLE, `future ${index}`);
  });
  // A future finding beside a known one: the known one is kept, the unknown dropped.
  const mixed = { ...genuine, findings: [...genuine.findings, { code: 'a-code-from-registry-v2', codeVersion: 1, parts: [] }] };
  assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: mixed }).map((finding) => finding.code), ['slope-run-over-rise']);
});
