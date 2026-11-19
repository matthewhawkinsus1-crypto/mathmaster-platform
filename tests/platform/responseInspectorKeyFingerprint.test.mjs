/*
 * THE ANSWER KEY'S FINGERPRINT HOLDS WHAT DECIDES A VERDICT, AND NOTHING ELSE (#249, #554 item 8).
 *
 * Grading evidence keeps a fingerprint of the key each box was graded against,
 * and the inspector says "The answer key changed after grading" when today's
 * differs. The first fingerprint (now version 1) hashed every property of a box
 * but a short list of presentation keys, so how a student enters an answer and
 * what they are told about it counted as the key: a choice's options and their
 * order, each option's rationale, the box's input and tool profiles. A Safe Live
 * Repair, which turns a typed box into choices with the same key and is
 * certified to change "only response-entry mechanics", made every earlier
 * attempt on that box read "The key for Trend changed", right answers included.
 *
 * Version 2 hashes a box's accepted answers and the rules the grader compares
 * them by (answerUtils.mjs matchesFieldAnswer): gradingMode, equivalence,
 * lineForm, answerForm, numericTolerance, numberRules, allowArithmetic and
 * partialCredit. How the answer is entered is not in it: when that changes a
 * verdict, the replay of the stored answer says so.
 *
 * Fingerprints already stored are version 1 and must not all start to read
 * "changed". They are compared with the current question's version-1
 * fingerprint: equal, the key is the one graded; a box added or removed is
 * certain either way; a box whose version-1 hash differs may have changed only
 * how it is answered, so nothing is claimed for it, and the reasons that read
 * today's key are not given. The version-1 fingerprints below are what the
 * version-1 code (a0aaaea2 to dace673a) stores for these questions, copied
 * from its output, so this reads evidence as that code writes it, not
 * evidence this code made up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInspectorModel,
  captureAutomaticGradingEvidence,
} from '../../functions/shared/responseInspector.mjs';
import {
  ANSWER_KEY_FINGERPRINT_VERSION,
  answerKeyFingerprint,
  findAnswerKeyChange,
} from '../../functions/shared/responseInspectorReasons.mjs';
import { analyzeSafeResponseEntryRepair } from '../../functions/shared/liveResponseRepairPolicy.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const fieldsResponse = (values) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(values).map(([id, value]) => ({ id, value, isComplete: String(value).trim() !== '' })),
});
const multiAnswer = (fields, extra = {}) => ({ questionId: 'q-key', type: 'multiAnswer', prompt: 'Answer each part.', answerFields: fields, ...extra });
const withField = (question, id, change) => ({
  ...question,
  answerFields: question.answerFields.map((field) => (field.id === id ? change(field) : field)),
});

/* ------------------------------------------------------------------ fixtures */

const LINE = {
  id: 'line',
  label: 'Line',
  type: 'choice',
  inputProfile: 'choice',
  options: ['y = -1/2 x + 3', 'y = 2x - 4', 'y = 1/2 x + 1'],
  answer: 'y = -1/2 x + 3',
  scoreWeight: 1,
  numericTolerance: 0,
  optionRationales: {
    'y = -1/2 x + 3': 'Its slope is the negative reciprocal of 2.',
    'y = 2x - 4': 'Same slope: parallel.',
    'y = 1/2 x + 1': 'Reciprocal but not negative.',
  },
};
const SLOPE = { id: 'slope', label: 'Slope', inputProfile: 'number', answer: '-1/2', scoreWeight: 1, numericTolerance: 0, toolProfile: 'algebra-operation' };
const PERPENDICULAR = multiAnswer([LINE, SLOPE], { prompt: 'Which line is perpendicular to y = 2x + 1, and what is its slope?' });
const PERPENDICULAR_RIGHT = fieldsResponse({ line: 'y = -1/2 x + 3', slope: '-1/2' });

// A typed plain-language box, and the Safe Live Repair that turns it into choices.
const TREND_TYPED = {
  questionId: 'q-trend',
  type: 'multiAnswer',
  activityRole: 'classwork',
  prompt: 'Is the function increasing or decreasing on the interval?',
  answerFields: [{ id: 'trend', label: 'Trend', answer: 'increasing', inputProfile: 'text', scoreWeight: 1 }],
};
const TREND_CHOICES = withField(TREND_TYPED, 'trend', (field) => ({ ...field, inputProfile: 'choice', options: ['increasing', 'decreasing', 'constant'] }));

const EXPRESSION = multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]);
const EXPRESSION_3X = multiAnswer([{ id: 'e', label: 'Expression', answer: '3x+3' }]);
const R_SQUARED = multiAnswer([
  { id: 'r2', label: 'r²', answer: 0.49, inputProfile: 'number' },
  { id: 'percent', label: 'Percentage', answer: 49, inputProfile: 'number' },
]);
const LITERAL = { questionId: 'q-literal', type: 'literal', prompt: 'Solve for h.', solveFor: 'h', acceptedAnswers: ['2x+2'] };

// The edits that are not the key, each on the question as it was graded.
const NOT_THE_KEY = {
  'a typo fixed in one choice\'s rationale': withField(PERPENDICULAR, 'line', (field) => ({ ...field, optionRationales: { ...field.optionRationales, 'y = 2x - 4': 'Same slope, so the lines are parallel.' } })),
  'another tool profile on the slope box': withField(PERPENDICULAR, 'slope', (field) => ({ ...field, toolProfile: 'numeric' })),
  'the choices in another order': withField(PERPENDICULAR, 'line', (field) => ({ ...field, options: [field.options[1], field.options[0], field.options[2]] })),
  'a relabelled box': withField(PERPENDICULAR, 'slope', (field) => ({ ...field, label: 'Slope m' })),
};

/*
 * VERSION 1, AS STORED. What the version-1 code stores in grading evidence
 * for these questions, copied from its output. They must never be
 * recomputed here: they stand for evidence that may already be in Firestore.
 */
const V1 = Object.freeze({
  PERPENDICULAR: { surface: 'multiAnswer', whole: '8ce33da7-bf18-4018-a85c-453ba5dee04a', parts: [{ id: 'line', hash: 'e0d911e9-1de7-43d2-ad63-12fd16162480' }, { id: 'slope', hash: '31b9ab22-8898-4831-afd1-b1cefe9f63bf' }] },
  TREND_TYPED: { surface: 'multiAnswer', whole: 'e837e964-78a0-4933-a420-5bf472a7b9ad', parts: [{ id: 'trend', hash: '6ffd6677-0494-4b80-a6c0-963bc6fc853a' }] },
  EXPRESSION: { surface: 'multiAnswer', whole: '89456437-2633-4050-ab59-8ccb7ba9211a', parts: [{ id: 'e', hash: '32833700-6f39-40e7-aa20-c2f8b6b98c29' }] },
  EXPRESSION_3X: { surface: 'multiAnswer', whole: '991142a9-070a-46d2-a424-9b998e350240', parts: [{ id: 'e', hash: '884ea012-4022-4159-a031-adf6c4947aaf' }] },
  R_SQUARED: { surface: 'multiAnswer', whole: '0750a8e9-3dad-498a-a8a8-57958d0dc6e0', parts: [{ id: 'r2', hash: '5abbe7cf-69d1-4290-aedd-d23327848c72' }, { id: 'percent', hash: '3fd74728-f96c-45df-a295-73409363e891' }] },
  LITERAL: { surface: 'literal', whole: 'e961ee15-a832-4aae-a0be-68853eb2ccac', parts: [{ id: 'literal', hash: '3df3700e-d3c7-4465-a0af-d8ea5b614b0b' }] },
});

/* ----------------------------------------------------- graded, then inspected */

/** One attempt graded against `gradedQuestion` and inspected with `question` (responseInspectorReasons.test.mjs). */
const inspect = ({ question, response, gradedQuestion = question, storedFingerprint = undefined }) => {
  const grading = gradeServerResponse({ question: gradedQuestion, response });
  assert.equal(grading.graded, true, `the fixture is graded (${grading.reason})`);
  const evidence = captureAutomaticGradingEvidence({ response, grading, question: gradedQuestion, submittedAt: '2026-11-10T15:00:00Z' });
  if (storedFingerprint !== undefined) evidence.answerKeyFingerprint = structuredClone(storedFingerprint);
  return buildInspectorModel({
    assignment: { id: 'assignment-1', title: 'Fingerprint' },
    question,
    questionIndex: 0,
    student: { id: 'student-1' },
    record: { status: grading.isCorrect ? 'correct' : 'expired', totalAttempts: 1, attemptCount: 1, variantIndex: 0, partGrades: grading.parts, lastSubmissionId: 'submission-1' },
    gradingEvidence: evidence,
  });
};
const codes = (model) => model.diagnosis.reasons.map((reason) => reason.code);
const keyLines = (model) => (model.diagnosis.reasons.find((reason) => reason.code === 'answer-key-changed')?.lines || [])
  .map((line) => line.map((segment) => segment.text ?? segment.value).join(''));

// The attempt exactly as ingestion stores it, on the question as it was then.
const ingested = (question, typed) => {
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${typed}`,
    kind: 'ordinarySubmission',
    studentId: 's1',
    assignmentId: 'asg-trend',
    questionIndex: 0,
    questionId: question.questionId,
    activityRole: 'classwork',
    capturedAt: Date.parse('2026-11-10T15:00:00Z'),
    previousTotalAttempts: 0,
    record: { status: 'unattempted' },
    response: fieldsResponse({ trend: typed }),
  })), { studentId: 's1' });
  const assignment = { id: 'asg-trend', schemaVersion: 5, title: 'Trend', sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] }] };
  return buildIngestedAttempt({ envelope, assignment, question, canonicalRecord: {}, gradeDocument: { classId: 'c' }, ingestedAt: Date.parse('2026-11-10T15:00:01Z') });
};
const inspectIngested = (built, question) => buildInspectorModel({
  assignment: { id: 'asg-trend', schemaVersion: 5, title: 'Trend', sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] }] },
  question,
  questionIndex: 0,
  student: { id: 's1', classId: 'c' },
  record: built.record,
  gradingEvidence: built.gradingEvidence,
});

/* ============================================================== version 2 */

test('a certified Safe Live Repair is not a key change: every earlier attempt reads as it did before the repair', () => {
  assert.deepEqual(analyzeSafeResponseEntryRepair(TREND_TYPED, TREND_CHOICES), { safe: true, affectedFieldIds: ['trend'] }, 'the repair is certified');
  for (const [typed, status, reading] of [['increases', 'attempted', 'genuinely-incorrect'], ['increasing', 'correct', 'correct']]) {
    const built = ingested(TREND_TYPED, typed);
    assert.equal(built.record.status, status, typed);
    assert.deepEqual(codes(inspectIngested(built, TREND_TYPED)), [reading], `${typed}, before the repair`);
    assert.deepEqual(codes(inspectIngested(built, TREND_CHOICES)), [reading], `${typed}, after the repair`);
    assert.equal(built.gradingEvidence.answerKeyFingerprint.version, ANSWER_KEY_FINGERPRINT_VERSION, 'ingestion stores the current version');
  }
});

test('a rationale, a tool profile, the order of the choices or a label is not the key; a changed answer is', () => {
  for (const [edit, question] of Object.entries(NOT_THE_KEY)) {
    const model = inspect({ question, gradedQuestion: PERPENDICULAR, response: PERPENDICULAR_RIGHT });
    assert.deepEqual(codes(model), ['correct'], edit);
    assert.equal(findAnswerKeyChange({
      evidence: { questionId: 'q-key', answerKeyFingerprint: answerKeyFingerprint(PERPENDICULAR) },
      question,
      currentFingerprint: answerKeyFingerprint(question),
    }).changed, false, edit);
  }
  const rekeyed = withField(PERPENDICULAR, 'slope', (field) => ({ ...field, answer: '-0.4' }));
  const model = inspect({ question: rekeyed, gradedQuestion: PERPENDICULAR, response: PERPENDICULAR_RIGHT });
  assert.equal(model.diagnosis.code, 'answer-key-changed');
  assert.deepEqual(keyLines(model), ['The key for Slope changed.']);
  const rechosen = withField(PERPENDICULAR, 'line', (field) => ({ ...field, answer: 'y = 1/2 x + 1' }));
  assert.deepEqual(keyLines(inspect({ question: rechosen, gradedQuestion: PERPENDICULAR, response: PERPENDICULAR_RIGHT })), ['The key for Line changed.']);
});

test('every rule the grader compares a box by is part of its key', () => {
  const box = { id: 'a', label: 'Answer', answer: '2x+2' };
  const RULES = {
    'accepted answers': { acceptedAnswers: ['2(x+1)'] },
    gradingMode: { gradingMode: 'equivalentExpression' },
    equivalence: { equivalence: 'polynomialRelation' },
    lineForm: { lineForm: 'any' },
    answerForm: { answerForm: 'simplifiedPolynomial' },
    numericTolerance: { numericTolerance: 0.5 },
    numberRules: { numberRules: 'digitalSAT' },
    allowArithmetic: { allowArithmetic: true },
    partialCredit: { partialCredit: 'matchedElements' },
  };
  const graded = multiAnswer([box]);
  for (const [rule, change] of Object.entries(RULES)) {
    const question = multiAnswer([{ ...box, ...change }]);
    const found = findAnswerKeyChange({ evidence: { questionId: 'q-key', answerKeyFingerprint: answerKeyFingerprint(graded) }, question, currentFingerprint: answerKeyFingerprint(question) });
    assert.equal(found.changed, true, rule);
    assert.deepEqual(found.details, [{ kind: 'key', parts: [{ id: 'a', label: 'Answer', change: 'changed' }] }], rule);
  }
  // The same accepted answers in another order are the same key.
  const reordered = (answers) => answerKeyFingerprint(multiAnswer([{ ...box, acceptedAnswers: answers }])).whole;
  assert.equal(reordered(['2(x+1)', '2 + 2x']), reordered(['2 + 2x', '2(x+1)']));
});

test('the fingerprint names its version, and ingestion stores it', () => {
  assert.equal(ANSWER_KEY_FINGERPRINT_VERSION, 2);
  assert.equal(answerKeyFingerprint(PERPENDICULAR).version, 2);
  assert.equal(answerKeyFingerprint(LITERAL).version, 2);
  // A literal's key was always only its answers: its version-1 hash is its version-2 hash.
  assert.equal(answerKeyFingerprint(LITERAL).whole, V1.LITERAL.whole);
  assert.notEqual(answerKeyFingerprint(PERPENDICULAR).whole, V1.PERPENDICULAR.whole, 'a box\'s projection changed');
});

/* ======================================== version 1, already in Firestore */

test('the version-1 projection is kept exactly: it reproduces what the version-1 code stores', () => {
  const questions = { PERPENDICULAR, TREND_TYPED, EXPRESSION, EXPRESSION_3X, R_SQUARED, LITERAL };
  for (const [name, question] of Object.entries(questions)) {
    const recomputed = answerKeyFingerprint(question, { version: 1 });
    assert.equal(recomputed.whole, V1[name].whole, name);
    assert.deepEqual(recomputed.parts, V1[name].parts, name);
  }
});

test('evidence stored by version 1 reads as the attempt was graded when nothing about the key changed', () => {
  // Unchanged: the key is the one graded, so the reasons that read it are given.
  const same = inspect({ question: EXPRESSION, response: fieldsResponse({ e: '2(x+1)' }), storedFingerprint: V1.EXPRESSION });
  assert.deepEqual(codes(same), ['equivalent-answer-rejected']);
  assert.deepEqual(codes(inspect({ question: PERPENDICULAR, response: PERPENDICULAR_RIGHT, storedFingerprint: V1.PERPENDICULAR })), ['correct']);
  // The Safe Live Repair and the edits that are not the key: version 1 cannot
  // tell them from a key change, so it claims none.
  for (const typed of ['increases', 'increasing']) {
    const built = ingested(TREND_TYPED, typed);
    built.gradingEvidence.answerKeyFingerprint = structuredClone(V1.TREND_TYPED);
    assert.deepEqual(codes(inspectIngested(built, TREND_CHOICES)), [typed === 'increasing' ? 'correct' : 'genuinely-incorrect'], `${typed}, after the repair`);
  }
  for (const [edit, question] of Object.entries(NOT_THE_KEY)) {
    assert.deepEqual(codes(inspect({ question, gradedQuestion: PERPENDICULAR, response: PERPENDICULAR_RIGHT, storedFingerprint: V1.PERPENDICULAR })), ['correct'], edit);
  }
});

test('evidence stored by version 1 still shows a box added or removed, and never claims what it cannot tell', () => {
  const response = fieldsResponse({ r2: '0.49', percent: '49' });
  const removed = inspect({ question: multiAnswer([R_SQUARED.answerFields[0]]), gradedQuestion: R_SQUARED, response, storedFingerprint: V1.R_SQUARED });
  assert.equal(removed.diagnosis.code, 'answer-key-changed');
  assert.deepEqual(keyLines(removed), ['The key for percent was removed.']);
  const added = inspect({ question: multiAnswer([...R_SQUARED.answerFields, { id: 'why', label: 'Explain', answer: 'r squared' }]), gradedQuestion: R_SQUARED, response, storedFingerprint: V1.R_SQUARED });
  assert.deepEqual(keyLines(added), ['The key for Explain was added.']);

  // A box's answer changed: its version-1 hash cannot say whether the key or only
  // its entry changed, so no key change is claimed, and the replay says the grade
  // would differ today.
  const rekeyed = inspect({ question: multiAnswer([{ ...R_SQUARED.answerFields[0], answer: 0.5 }, R_SQUARED.answerFields[1]]), gradedQuestion: R_SQUARED, response, storedFingerprint: V1.R_SQUARED });
  assert.ok(!codes(rekeyed).includes('answer-key-changed'), codes(rekeyed).join(', '));
  assert.ok(codes(rekeyed).includes('grader-version-discrepancy'));
  // Graded wrong against 3x+3 and equal in value to today's 2x+2: "same value as
  // the key" would describe a grade that never happened, so it is not said.
  const regraded = inspect({ question: EXPRESSION, gradedQuestion: EXPRESSION_3X, response: fieldsResponse({ e: '2(x+1)' }), storedFingerprint: V1.EXPRESSION_3X });
  assert.deepEqual(codes(regraded), ['genuinely-incorrect']);
});

test('evidence stored by version 1 for a key that is not a set of boxes reads exactly as before', () => {
  const graded = inspect({ question: LITERAL, response: { kind: 'scalar', type: 'literal', value: '2x+2', fields: [] }, storedFingerprint: V1.LITERAL });
  assert.deepEqual(codes(graded), ['correct']);
  const rekeyed = inspect({ question: { ...LITERAL, acceptedAnswers: ['2(x+1)'] }, gradedQuestion: LITERAL, response: { kind: 'scalar', type: 'literal', value: '2x+2', fields: [] }, storedFingerprint: V1.LITERAL });
  assert.equal(rekeyed.diagnosis.code, 'answer-key-changed');
  assert.deepEqual(keyLines(rekeyed), ['The answer key is not the one this attempt was graded against.']);
});

test('a fingerprint of a version this code does not know claims nothing', () => {
  const future = { ...answerKeyFingerprint(EXPRESSION_3X), version: ANSWER_KEY_FINGERPRINT_VERSION + 1 };
  const found = findAnswerKeyChange({ evidence: { questionId: 'q-key', answerKeyFingerprint: future }, question: EXPRESSION, currentFingerprint: answerKeyFingerprint(EXPRESSION) });
  assert.equal(found.changed, false);
  assert.doesNotThrow(() => findAnswerKeyChange({ evidence: { answerKeyFingerprint: { version: { toString: null }, whole: 'a', surface: 'multiAnswer', parts: [] } }, question: EXPRESSION }));
});
