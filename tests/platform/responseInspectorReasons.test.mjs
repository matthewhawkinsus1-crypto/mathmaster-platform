/*
 * "WHY WAS THIS MARKED WRONG?" — THE THREE REASONS THAT READ THE ANSWER KEY (#249, #554 item 8).
 *
 * Each reason is stated only when it is true. A teacher who reads "same value
 * as the key" on a correct rejection stops trusting the inspector, so every
 * reason here has its false cases beside its true ones, and every case goes
 * through the real model (buildInspectorModel): the evidence ingestion stores
 * (captureAutomaticGradingEvidence), the shared grader's verdict and the
 * replay against the question as it is now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInspectorModel,
  captureAutomaticGradingEvidence,
} from '../../functions/shared/responseInspector.mjs';
import {
  answerKeyFingerprint,
  findAnswerKeyChange,
  findEquivalentRejections,
  findParserChanges,
} from '../../functions/shared/responseInspectorReasons.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const fieldsResponse = (values) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(values).map(([id, value]) => ({ id, value, isComplete: String(value).trim() !== '' })),
});
const scalarResponse = (type, value) => ({ kind: 'scalar', type, value, fields: [] });
const multiAnswer = (fields, extra = {}) => ({ questionId: 'q-reasons', type: 'multiAnswer', prompt: 'Answer each part.', answerFields: fields, ...extra });

/** One graded attempt, inspected: graded against `gradedQuestion`, inspected with `question`. */
const inspect = ({ question, response, gradedQuestion = question, evidenceOverrides = {} }) => {
  const grading = gradeServerResponse({ question: gradedQuestion, response });
  assert.equal(grading.graded, true, `the fixture is graded (${grading.reason})`);
  const evidence = {
    ...captureAutomaticGradingEvidence({ response, grading, question: gradedQuestion, submittedAt: '2026-11-10T15:00:00Z' }),
    ...evidenceOverrides,
  };
  const record = {
    status: grading.isCorrect ? 'correct' : 'expired',
    totalAttempts: 1,
    attemptCount: 1,
    variantIndex: 0,
    partialCredit: Math.round((grading.score || 0) * 100),
    bestPartialCredit: Math.round((grading.score || 0) * 100),
    partGrades: grading.parts,
    lastSubmissionId: 'submission-1',
    lastAttemptAt: '2026-11-10T15:00:00Z',
  };
  return buildInspectorModel({
    assignment: { id: 'assignment-1', title: 'Reasons' },
    question,
    questionIndex: 0,
    student: { id: 'student-1' },
    record,
    gradingEvidence: evidence,
  });
};
const codes = (model) => model.diagnosis.reasons.map((reason) => reason.code);
const reason = (model, code) => model.diagnosis.reasons.find((entry) => entry.code === code) || null;
const lineText = (line) => line.map((segment) => segment.text ?? segment.value).join('');
const linesOf = (entry) => (entry?.lines || []).map(lineText);

/* ==========================================================================
 * EQUAL TO THE KEY, BUT NOT ACCEPTED.
 * ======================================================================== */

test('an expression equal to the key but in another form is named, with the rule that refused it', () => {
  const model = inspect({
    question: multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]),
    response: fieldsResponse({ e: '2(x+1)' }),
  });
  assert.equal(model.diagnosis.code, 'equivalent-answer-rejected', 'it is the first reason');
  const found = reason(model, 'equivalent-answer-rejected');
  assert.deepEqual(found.parts.map(({ id, typed, key, rules }) => ({ id, typed, key, rules })), [
    { id: 'e', typed: '2(x+1)', key: '2x+2', rules: ['written-form'] },
  ]);
  assert.deepEqual(linesOf(found), ['Expression: 2(x+1) has the same value as the key 2x+2, but this box accepts only the form the key is written in.']);
  assert.equal(found.title, 'Same value as the key, but not accepted');
  assert.equal(found.action, 'To accept it, use Grant Full Credit under Grading Actions.');
  // The values travel as values, so the screen draws them as written.
  assert.deepEqual(found.lines[0].filter((segment) => 'value' in segment).map((segment) => segment.value), ['2(x+1)', '2x+2']);
});

test('each box setting that refuses an equal answer is the rule named, never the default form rule in its place', () => {
  const cases = [
    [{ id: 'n', label: 'Value', answer: '58', inputProfile: 'number' }, '64-6', ['calculation'], 'this box asks for one number, not a calculation.'],
    [{ id: 'f', label: 'Factored', answer: '(x+2)(x+3)', gradingMode: 'factoredForm' }, 'x^2+5x+6', ['factored-form'], 'this box asks for factored form.'],
    [{ id: 's', label: 'Simplified', answer: 'a^3+8a-9', answerForm: 'simplifiedPolynomial' }, '2a^3+5a-7-a^3+3a-2', ['simplified-polynomial'], 'this box asks for a simplified polynomial.'],
    [{ id: 'k', label: 'Equation', answer: 'y=2x+1', gradingMode: 'sidesAsKeyed' }, '2x+1=y', ['sides-as-keyed'], 'this box asks for the equation with its sides as the key has them.'],
    [{ id: 'c', label: 'Simplest', type: 'choice', options: ['(2a^2b)(4a^3b)', '8a^5b^2'], answer: '8a^5b^2' }, '(2a^2b)(4a^3b)', ['choice-option'], 'it is a choice, and a choice is marked by the option picked.'],
  ];
  for (const [field, typed, rules, sentence] of cases) {
    const model = inspect({ question: multiAnswer([field]), response: fieldsResponse({ [field.id]: typed }) });
    const found = reason(model, 'equivalent-answer-rejected');
    assert.ok(found, `${field.label}: named`);
    assert.deepEqual(found.parts[0].rules, rules, `${field.label}: the rule`);
    assert.ok(linesOf(found)[0].endsWith(sentence), `${field.label}: ${linesOf(found)[0]}`);
  }
});

test('a line in another form is refused by the line-form rule only when the question names a form', () => {
  const asked = inspect({
    question: multiAnswer([{ id: 'l', label: 'Line', answer: 'y=2x+1' }], { prompt: 'Write the equation of the line in slope-intercept form.' }),
    response: fieldsResponse({ l: '2x-y=-1' }),
  });
  assert.deepEqual(reason(asked, 'equivalent-answer-rejected')?.parts[0].rules, ['line-form']);
  // Asked for no form, the grader takes any equation of the line: correct, nothing to explain.
  const free = inspect({ question: multiAnswer([{ id: 'l', label: 'Line', answer: 'y=2x+1' }]), response: fieldsResponse({ l: '2x-y=-1' }) });
  assert.equal(free.automaticResult.isCorrect, true);
  assert.deepEqual(codes(free), ['correct']);
});

test('a literal answer in another form is named, read at the literal grader\'s own tolerance', () => {
  const model = inspect({
    question: { questionId: 'q-literal', type: 'literal', prompt: 'Solve for h.', solveFor: 'h', acceptedAnswers: ['2x+2'] },
    response: scalarResponse('literal', '2(x+1)'),
  });
  assert.deepEqual(reason(model, 'equivalent-answer-rejected')?.parts.map(({ id, label, rules }) => ({ id, label, rules })), [
    { id: 'literal', label: 'Expression for h', rules: ['written-form'] },
  ]);
  // 1/3 for 0.3333333 is 3.3e-8 apart: wrong at the literal grader's 1e-9, so it is not "the key's value".
  const near = inspect({
    question: { questionId: 'q-literal', type: 'literal', prompt: 'Write it.', acceptedAnswers: ['0.3333333'] },
    response: scalarResponse('literal', '1/3'),
  });
  assert.equal(near.automaticResult.isCorrect, false);
  assert.equal(reason(near, 'equivalent-answer-rejected'), null);
  assert.equal(near.diagnosis.code, 'genuinely-incorrect');
});

test('no equivalence is claimed for a wrong value, a list for a set, or one part of several when the others are right', () => {
  const wrong = inspect({ question: multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]), response: fieldsResponse({ e: '2x+3' }) });
  assert.equal(reason(wrong, 'equivalent-answer-rejected'), null);
  assert.equal(wrong.diagnosis.code, 'genuinely-incorrect');

  const list = inspect({ question: multiAnswer([{ id: 's', label: 'Set', answer: '{1,2,3}' }]), response: fieldsResponse({ s: '1,2,3' }) });
  assert.equal(reason(list, 'equivalent-answer-rejected'), null, 'a set written as a list is not the set, by the platform\'s own reading');

  const twoParts = inspect({
    question: multiAnswer([{ id: 'r2', label: 'r²', answer: 0.49 }, { id: 'e', label: 'Expression', answer: '2x+2' }]),
    response: fieldsResponse({ r2: '0.49', e: '2(x+1)' }),
  });
  const found = reason(twoParts, 'equivalent-answer-rejected');
  assert.deepEqual(found.parts.map((part) => part.id), ['e'], 'only the refused part');
  assert.equal(found.action, 'To accept it, use Grant Credit for Expression under Grading Actions.');
  assert.deepEqual(codes(twoParts), ['equivalent-answer-rejected', 'multipart-partial']);
});

test('no equivalence is claimed when today\'s grader accepts the answer: that is a grading discrepancy', () => {
  const question = multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2', gradingMode: 'equivalentExpression' }]);
  const gradedQuestion = multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]);
  const model = inspect({ question, gradedQuestion, response: fieldsResponse({ e: '2(x+1)' }) });
  assert.equal(model.replay.currentScore, 100);
  assert.ok(codes(model).includes('grader-version-discrepancy'));
  assert.equal(reason(model, 'equivalent-answer-rejected'), null);
});

test('no equivalence is claimed without a replay of the stored snapshot (a generated question with no delivered instance)', () => {
  const generated = multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }], { generator: { parameters: { a: { type: 'int', min: 1, max: 3 } } } });
  const response = fieldsResponse({ e: '2(x+1)' });
  const grading = gradeServerResponse({ question: multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]), response });
  const model = buildInspectorModel({
    question: generated,
    record: { status: 'expired', totalAttempts: 1, partGrades: grading.parts },
    gradingEvidence: captureAutomaticGradingEvidence({ response, grading, question: generated }),
  });
  assert.equal(model.replay.available, false);
  assert.equal(reason(model, 'equivalent-answer-rejected'), null);
  assert.equal(findEquivalentRejections({ question: generated, response, original: grading, current: null }).length, 0);
});

/* ==========================================================================
 * READ DIFFERENTLY FROM HOW IT WAS TYPED.
 * ======================================================================== */

test('a dash the grader does not read as a minus sign: both the typed text and the reading that matches are shown', () => {
  const model = inspect({ question: multiAnswer([{ id: 'x', label: 'x', answer: -5 }]), response: fieldsResponse({ x: '‒5' }) });
  assert.equal(model.diagnosis.code, 'parser-changed-input');
  const found = reason(model, 'parser-changed-input');
  assert.deepEqual(found.parts.map(({ typed, reading, rules }) => ({ typed, reading, rules })), [
    { typed: '‒5', reading: '-5', rules: [{ rule: 'minus-sign', characters: ['‒'] }] },
  ]);
  assert.deepEqual(linesOf(found), [
    'x: typed ‒5.',
    'The grader does not read ‒ as a minus sign. Read as -5, it matches the key.',
  ]);
  assert.equal(found.title, 'Read differently from how it was typed');
  assert.equal(reason(model, 'equivalent-answer-rejected'), null, 'the same box is not explained twice');
});

test('a dropped percent sign, a decimal comma, other digits and a fraction character are each read as written', () => {
  const cases = [
    [{ id: 'r2', label: 'r²', answer: 0.49 }, '49%', '0.49', 'percent', 'r²: typed 49%, read by the grader as 49.', 'The grader dropped the percent sign. Read as 0.49, it matches the key.'],
    [{ id: 'r2', label: 'r²', answer: 0.49 }, '49\\%', '0.49', 'percent', 'r²: typed 49\\%, read by the grader as 49.', 'The grader dropped the percent sign. Read as 0.49, it matches the key.'],
    [{ id: 'r2', label: 'r²', answer: 0.49 }, '0,49', '0.49', 'decimal-comma', 'r²: typed 0,49.', 'The grader does not read a comma as a decimal point. Read as 0.49, it matches the key.'],
    [{ id: 'n', label: 'n', answer: 49 }, '４９', '49', 'digits', 'n: typed ４９.', 'The grader does not read the digits ４ ９. Read as 49, it matches the key.'],
    [{ id: 'm', label: 'm', answer: 2.5 }, '2½', '2 1/2', 'fraction-character', 'm: typed 2½.', 'The grader does not read the fraction ½. Read as 2 1/2, it matches the key.'],
  ];
  for (const [field, typed, reading, rule, first, second] of cases) {
    const model = inspect({ question: multiAnswer([field]), response: fieldsResponse({ [field.id]: typed }) });
    const found = reason(model, 'parser-changed-input');
    assert.ok(found, `${typed}: named`);
    assert.equal(found.parts[0].reading, reading, typed);
    assert.equal(found.parts[0].rules[0].rule, rule, typed);
    assert.deepEqual(linesOf(found), [first, second], typed);
  }
});

test('a pair typed with an unread dash is read as written; an ordered-pair question it cannot read was never graded', () => {
  const model = inspect({
    question: multiAnswer([{ id: 'p', label: 'Point', answer: '(2,-3)', answerFormat: 'orderedPair' }]),
    response: fieldsResponse({ p: '(2, ‒3)' }),
  });
  assert.deepEqual(reason(model, 'parser-changed-input')?.parts.map(({ id, reading }) => ({ id, reading })), [{ id: 'p', reading: '(2, -3)' }]);
  // The orderedPair type reads such a pair as unfinished: there is no graded
  // attempt to explain (the grader answers `incomplete-response`).
  const pairQuestion = { questionId: 'q-pair', type: 'orderedPair', prompt: 'Where do they meet?', answer: [2, -3] };
  assert.equal(gradeServerResponse({ question: pairQuestion, response: scalarResponse('orderedPair', '(2, ‒3)') }).reason, 'incomplete-response');
  const wrongPair = inspect({ question: pairQuestion, response: scalarResponse('orderedPair', '(2, 4)') });
  assert.equal(reason(wrongPair, 'parser-changed-input'), null);
  assert.equal(wrongPair.diagnosis.code, 'multipart-partial');
});

test('no misreading is claimed when the answer is wrong however it is read, or right as the grader read it', () => {
  const stillWrong = inspect({ question: multiAnswer([{ id: 'x', label: 'x', answer: 7 }]), response: fieldsResponse({ x: '‒5' }) });
  assert.equal(reason(stillWrong, 'parser-changed-input'), null);
  assert.equal(stillWrong.diagnosis.code, 'genuinely-incorrect');

  const percentKey = inspect({ question: multiAnswer([{ id: 'p', label: 'Percentage', answer: 49 }]), response: fieldsResponse({ p: '49%' }) });
  assert.equal(percentKey.automaticResult.isCorrect, true);
  assert.deepEqual(codes(percentKey), ['correct']);

  // 1,000 is a thousands grouping, not a decimal comma: no reading is guessed for it.
  const grouped = inspect({ question: multiAnswer([{ id: 'n', label: 'n', answer: 1 }]), response: fieldsResponse({ n: '1,000' }) });
  assert.equal(reason(grouped, 'parser-changed-input'), null);

  // The minus signs the normalizer reads are read: −5 (U+2212) is simply right.
  const read = inspect({ question: multiAnswer([{ id: 'x', label: 'x', answer: -5 }]), response: fieldsResponse({ x: '−5' }) });
  assert.deepEqual(codes(read), ['correct']);
});

/* ==========================================================================
 * THE ANSWER KEY CHANGED SINCE GRADING.
 * ======================================================================== */

const R_SQUARED = [
  { id: 'r2', label: 'r²', answer: 0.49, inputProfile: 'number' },
  { id: 'percent', label: 'Percentage', answer: 49, inputProfile: 'number' },
];

test('the evidence keeps a fingerprint of the key it was graded against, and never the key', () => {
  const question = multiAnswer(R_SQUARED);
  const response = fieldsResponse({ r2: '0.49', percent: '49' });
  const evidence = captureAutomaticGradingEvidence({ response, grading: gradeServerResponse({ question, response }), question });
  assert.equal(evidence.questionId, 'q-reasons');
  assert.equal(evidence.answerKeyFingerprint.surface, 'multiAnswer');
  // A list, never a record keyed by box id: Firestore refuses some names as field names.
  assert.ok(Array.isArray(evidence.answerKeyFingerprint.parts));
  assert.deepEqual(evidence.answerKeyFingerprint.parts.map((part) => part.id).sort(), ['percent', 'r2']);
  const reserved = answerKeyFingerprint(multiAnswer([{ id: '__x__', label: 'x', answer: 1 }]));
  assert.deepEqual(reserved.parts.map((part) => part.id), ['__x__'], 'an id Firestore reserves is a value here, never a field name');
  assert.equal(evidence.answerKeyFingerprint.whole, answerKeyFingerprint(question).whole);
  assert.doesNotMatch(JSON.stringify(evidence.answerKeyFingerprint), /0\.49|"49"/, 'a fingerprint, not the key');
});

test('a key changed since grading is named by its box, and the reasons that would read the new key are not given', () => {
  const graded = multiAnswer(R_SQUARED);
  const now = multiAnswer([{ ...R_SQUARED[0], answer: 0.5 }, R_SQUARED[1]]);
  const model = inspect({ question: now, gradedQuestion: graded, response: fieldsResponse({ r2: '0.49', percent: '49' }) });
  assert.equal(model.diagnosis.code, 'answer-key-changed');
  const found = reason(model, 'answer-key-changed');
  assert.deepEqual(linesOf(found), ['The key for r² changed.']);
  assert.equal(found.action, 'Replay Grading below marks the same answer with the current key. Use Apply Corrected Grade to use that result.');
  assert.ok(codes(model).includes('grader-version-discrepancy'), 'the replay with the new key differs');
  assert.equal(reason(model, 'equivalent-answer-rejected'), null);
  assert.equal(reason(model, 'parser-changed-input'), null);

  // Rekeyed to the same value in another form: the right answer is now refused
  // by the form rule, and that is the key's change, not the student's form.
  const reformed = inspect({
    question: multiAnswer([{ id: 'e', label: 'Expression', answer: '2(x+1)' }]),
    gradedQuestion: multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]),
    response: fieldsResponse({ e: '2x+2' }),
  });
  assert.deepEqual(codes(reformed), ['answer-key-changed', 'grader-version-discrepancy']);
  assert.deepEqual(linesOf(reason(reformed, 'answer-key-changed')), ['The key for Expression changed.']);

  // Wrong against the key it was graded with, and equal in value to today's
  // key in another form: still only the key change. Measured against the new
  // key, "same value as the key" would describe a grade that never happened.
  const regraded = inspect({
    question: multiAnswer([{ id: 'e', label: 'Expression', answer: '2x+2' }]),
    gradedQuestion: multiAnswer([{ id: 'e', label: 'Expression', answer: '3x+3' }]),
    response: fieldsResponse({ e: '2(x+1)' }),
  });
  assert.equal(regraded.replay.currentScore, 0, 'today\'s key refuses it too');
  assert.deepEqual(codes(regraded), ['answer-key-changed']);
});

test('a box added or removed since grading, a replaced question and a changed version are each named', () => {
  const graded = multiAnswer(R_SQUARED);
  const response = fieldsResponse({ r2: '0.49', percent: '49' });
  const added = inspect({ question: multiAnswer([...R_SQUARED, { id: 'why', label: 'Explain', answer: 'r squared' }]), gradedQuestion: graded, response });
  assert.deepEqual(linesOf(reason(added, 'answer-key-changed')), ['The key for Explain was added.']);

  const replaced = inspect({ question: { ...graded, questionId: 'q-other' }, gradedQuestion: graded, response });
  assert.deepEqual(linesOf(reason(replaced, 'answer-key-changed')), ['A different question is now in this place.']);

  // A graph's key is not a named set of fields: only a version says it changed.
  const graph = { questionId: 'q-graph', type: 'graphing', prompt: 'What is the slope?', m: 2, b: -3, version: 4 };
  const graphResponse = { kind: 'tool', schemaVersion: 1, type: 'graphing', toolId: 'graphing', mode: null, contractVersion: 1, value: '{"slope":"2","intercept":"-3"}', fields: [] };
  const versioned = inspect({ question: graph, gradedQuestion: { ...graph, version: 3 }, response: graphResponse });
  assert.deepEqual(linesOf(reason(versioned, 'answer-key-changed')), ['The question was version 3 when graded and is version 4 now.']);
});

test('evidence stored before the fingerprint still shows a box added, removed or compared another way', () => {
  const graded = multiAnswer(R_SQUARED);
  const response = fieldsResponse({ r2: '0.49', percent: '49' });
  const older = { answerKeyFingerprint: undefined, questionId: undefined };
  const removed = inspect({ question: multiAnswer([R_SQUARED[0]]), gradedQuestion: graded, response, evidenceOverrides: older });
  assert.deepEqual(linesOf(reason(removed, 'answer-key-changed')), ['Answer boxes changed since grading: removed percent.']);

  const compared = inspect({
    question: multiAnswer([R_SQUARED[0], { ...R_SQUARED[1], answer: 'forty-nine' }]),
    gradedQuestion: graded,
    response,
    evidenceOverrides: older,
  });
  assert.deepEqual(linesOf(reason(compared, 'answer-key-changed')), ['Percentage was compared as a number when graded and is compared as written math or text now.']);
});

test('a prompt, a label or a hint edited since grading is not a key change', () => {
  const graded = multiAnswer(R_SQUARED);
  const edited = multiAnswer(R_SQUARED.map((field) => ({ ...field, label: `${field.label} (decimal)`, hint: 'Square r.' })), { prompt: 'For r = −0.70, find r² and the percentage it is.' });
  const model = inspect({ question: edited, gradedQuestion: graded, response: fieldsResponse({ r2: '0.49', percent: '49' }) });
  assert.deepEqual(codes(model), ['correct']);
  assert.deepEqual(findAnswerKeyChange({ evidence: { answerKeyFingerprint: answerKeyFingerprint(graded), questionId: 'q-reasons' }, question: edited, currentFingerprint: answerKeyFingerprint(edited) }), { known: true, changed: false, details: [] });
});

test('nothing is claimed about the key when nothing comparable was stored', () => {
  const question = { questionId: 'q-graph', type: 'graphing', prompt: 'What is the slope?', m: 2, b: -3 };
  assert.equal(answerKeyFingerprint(question), null, 'a graph has no named key fields');
  const graphResponse = { kind: 'tool', schemaVersion: 1, type: 'graphing', toolId: 'graphing', mode: null, contractVersion: 1, value: '{"slope":"2","intercept":"-3"}', fields: [] };
  const model = inspect({ question: { ...question, m: 5 }, gradedQuestion: question, response: graphResponse, evidenceOverrides: { questionId: undefined } });
  assert.equal(reason(model, 'answer-key-changed'), null);
  assert.deepEqual(findAnswerKeyChange({ evidence: {}, question }), { known: false, changed: false, details: [] });
});

/* ==========================================================================
 * REPLAY: A DISCREPANCY IS A DIFFERENT VERDICT, NOT A DIFFERENT SPELLING.
 * ======================================================================== */

// The attempt exactly as ingestion records it: the attempt policy's record,
// and evidence whose parts are that record's parts (submissionIngestion.mjs).
const recorded = async ({ question, response, earlier = {} }) => {
  const { recordQuestionAttempt } = await import('../../functions/shared/attemptPolicy.mjs');
  const { attemptInputsFromGrading } = await import('../../functions/shared/serverGrading/gradingResult.mjs');
  const { getQuestionCredit } = await import('../../functions/shared/attemptPolicy.mjs');
  const grading = gradeServerResponse({ question, response });
  const inputs = attemptInputsFromGrading(grading);
  const outcome = recordQuestionAttempt({
    record: earlier, isCorrect: inputs.isCorrect, parts: inputs.parts, partialCreditPercent: inputs.partialCreditPercent,
    maximumAttempts: 3, responseKey: 'key', occurredAt: Date.parse('2026-11-10T15:00:00Z'),
  });
  const record = { ...outcome.record, lastSubmissionId: 'submission-1' };
  const evidence = captureAutomaticGradingEvidence({
    response,
    grading: { ...outcome.result, isCorrect: record.status === 'correct', parts: record.partGrades },
    question,
    automaticScore: Math.round(getQuestionCredit(record) * 100),
  });
  return { record, evidence };
};

test('a recorded attempt replays with no discrepancy, relabelled or not, and a changed verdict is still one', async () => {
  const question = multiAnswer(R_SQUARED);
  const right = await recorded({ question, response: fieldsResponse({ r2: '0.49', percent: '49' }) });
  const same = buildInspectorModel({ question, record: right.record, gradingEvidence: right.evidence });
  assert.equal(same.replay.discrepancy, false, 'the record\'s own part shape is not a different grade');
  assert.deepEqual(same.replay.fieldDifferences, []);
  assert.deepEqual(codes(same), ['correct']);

  const relabelled = buildInspectorModel({ question: multiAnswer(R_SQUARED.map((field) => ({ ...field, label: `${field.label}!` }))), record: right.record, gradingEvidence: right.evidence });
  assert.equal(relabelled.replay.discrepancy, false);

  const rekeyed = buildInspectorModel({ question: multiAnswer([{ ...R_SQUARED[0], answer: 0.5 }, R_SQUARED[1]]), record: right.record, gradingEvidence: right.evidence });
  assert.equal(rekeyed.replay.discrepancy, true);
  assert.deepEqual(rekeyed.replay.fieldDifferences.map((difference) => difference.id), ['r2']);
});

test('a last attempt worse than an earlier one is not a discrepancy: the question keeps its best credit, the snapshot its own verdict', async () => {
  const question = multiAnswer(R_SQUARED);
  const first = await recorded({ question, response: fieldsResponse({ r2: '0.49', percent: '50' }) });
  const last = await recorded({ question, response: fieldsResponse({ r2: '0.5', percent: '50' }), earlier: first.record });
  assert.equal(last.evidence.automaticScore, 50, 'the question\'s credit is its best attempt');
  const model = buildInspectorModel({ question, record: last.record, gradingEvidence: last.evidence });
  assert.equal(model.replay.currentScore, 0);
  assert.equal(model.replay.discrepancy, false);
});

test('the reasons never throw on a hostile snapshot or question, and say nothing about what they cannot read', () => {
  const hostile = [null, undefined, 42, '', 'x'.repeat(5000), { kind: 'fields', fields: [{ id: '__proto__', value: { toString: null } }, null, 7] }, { kind: 'fields', fields: 'not a list' }, { kind: 'scalar', value: { nested: [1, 2] } }];
  const questions = [multiAnswer([{ id: '__proto__', answer: '2' }, null, { id: 'e', answer: ['2x', null] }]), { type: 'literal', acceptedAnswers: 'not a list' }, { type: 'table', table: { answers: null } }, { type: 'orderedPair', answer: 'none' }, null, 'question'];
  for (const question of questions) {
    for (const response of hostile) {
      assert.doesNotThrow(() => findEquivalentRejections({ question, response, original: { parts: [{ id: 'e', isCorrect: false }] }, current: { parts: [{ id: 'e', isCorrect: false }] } }));
      assert.doesNotThrow(() => findParserChanges({ question, response, original: { isCorrect: false }, current: { isCorrect: false } }));
      assert.doesNotThrow(() => answerKeyFingerprint(question));
      assert.doesNotThrow(() => findAnswerKeyChange({ evidence: { answerKeyFingerprint: { whole: 1, parts: null }, automaticResult: { parts: 'x' }, gradingTrace: { fields: [null] } }, question }));
      assert.doesNotThrow(() => findAnswerKeyChange({ evidence: { answerKeyFingerprint: { whole: 'a', surface: 'multiAnswer', parts: [null, 7, { id: { toString: null } }] } }, question, currentFingerprint: { whole: 'b', surface: 'multiAnswer', parts: 'x' } }));
    }
  }
});
