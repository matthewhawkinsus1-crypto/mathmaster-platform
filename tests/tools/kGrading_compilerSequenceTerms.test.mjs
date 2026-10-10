import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import sequenceExplorerGrader from '../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

/*
 * THE V5 COMPILER KEEPS THE TERMS A SEQUENCE ITEM ASKS FOR.
 *
 * findSequenceTerm / analyzeSequence on their own handed the item to
 * SequenceExplorer's analyze mode, which drops authored answer boxes and grades
 * the family, the change and a₈. An item that authors its own boxes and names
 * no targetN / missingIndex / sumN now compiles to multiAnswer and grades
 * those boxes. Every other sequence item still compiles to SequenceExplorer,
 * which now stores the change under its canonical name (difference / ratio).
 *
 * The three items are District DOL1 exactly as first authored
 * (git show 283b29b^:teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json),
 * the shape any future import of that kind takes.
 */

const DOL1_FIRST_AUTHORED = [
  {
    standard: 'A.12C', dok: 2, difficultyBand: 3,
    prompt: 'An arithmetic sequence starts at 7 and each term is 4 more than the term before it. Find the second, third and fifth terms.',
    studentActions: ['findSequenceTerm'],
    sequence: { kind: 'arithmetic', first: 7, commonDifference: 4 },
    answerFields: [{ id: 'a2', label: 'a(2)', answer: '11' }, { id: 'a3', label: 'a(3)', answer: '15' }, { id: 'a5', label: 'a(5)', answer: '23' }],
  },
  {
    standard: 'A.12C', dok: 2, difficultyBand: 3,
    prompt: 'A geometric sequence starts at 3 and each term is twice the term before it. Find the second, third and fifth terms.',
    studentActions: ['findSequenceTerm'],
    sequence: { kind: 'geometric', first: 3, commonRatio: 2 },
    answerFields: [{ id: 'g2', label: 'g(2)', answer: '6' }, { id: 'g3', label: 'g(3)', answer: '12' }, { id: 'g5', label: 'g(5)', answer: '48' }],
  },
  {
    standard: 'A.12C', dok: 2, difficultyBand: 3,
    prompt: 'A sequence starts at 20 and each term is 3 less than the term before it. Find the fourth term.',
    studentActions: ['findSequenceTerm'],
    sequence: { kind: 'arithmetic', first: 20, commonDifference: -3 },
    answerFields: [{ id: 'a4', label: 'a(4)', answer: '11' }],
  },
];

const payload = (questions) => ({
  schemaVersion: 5,
  assignment: { title: 'K compiler sequence terms', courseId: 'algebra1' },
  sections: [{ role: 'practice', title: 'Sequences', questions }],
});
const compileAll = (questions) => compileAuthoringIntentV5(payload(questions)).package.sections.flatMap((section) => section.questions);
const compileOne = (question) => compileAll([question])[0];

// Independent of the tool: aₙ = a₁ + (n − 1)d and gₙ = g₁·r^(n − 1), from the prompts.
const arithmeticTerm = (first, d, n) => first + (n - 1) * d;
const geometricTerm = (first, r, n) => first * r ** (n - 1);

const fieldsResponse = (fields) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(fields).map(([id, value]) => ({ id, value: String(value), isComplete: String(value).trim() !== '' })),
});
const gradeFields = (question, fields) => gradeServerResponse({ question, response: fieldsResponse(fields) });

test('DOL1 as first authored compiles to the boxes its prompts ask for, not analyze mode', () => {
  const [arithmetic, geometric, decreasing] = compileAll(structuredClone(DOL1_FIRST_AUTHORED));
  assert.equal(arithmetic.type, 'multiAnswer');
  assert.equal(geometric.type, 'multiAnswer');
  assert.equal(decreasing.type, 'multiAnswer');
  assert.deepEqual(arithmetic.answerFields.map((field) => field.id), ['a2', 'a3', 'a5']);
  assert.deepEqual(geometric.answerFields.map((field) => field.id), ['g2', 'g3', 'g5']);
  assert.deepEqual(decreasing.answerFields.map((field) => field.id), ['a4']);
});

test('DOL1 as first authored: the asked terms are graded, right when right and wrong when wrong', () => {
  const [arithmetic, geometric, decreasing] = compileAll(structuredClone(DOL1_FIRST_AUTHORED));
  const a = (n) => arithmeticTerm(7, 4, n);
  const g = (n) => geometricTerm(3, 2, n);
  const d = (n) => arithmeticTerm(20, -3, n);

  assert.equal(gradeFields(arithmetic, { a2: a(2), a3: a(3), a5: a(5) }).isCorrect, true);
  assert.equal(gradeFields(geometric, { g2: g(2), g3: g(3), g5: g(5) }).isCorrect, true);
  assert.equal(gradeFields(decreasing, { a4: d(4) }).isCorrect, true);

  // One step too far in the last box.
  assert.equal(gradeFields(arithmetic, { a2: a(2), a3: a(3), a5: a(6) }).isCorrect, false);
  // Doubling read as adding 2.
  assert.equal(gradeFields(geometric, { g2: arithmeticTerm(3, 2, 2), g3: arithmeticTerm(3, 2, 3), g5: arithmeticTerm(3, 2, 5) }).isCorrect, false);
  // The sign of the change dropped.
  assert.equal(gradeFields(decreasing, { a4: arithmeticTerm(20, 3, 4) }).isCorrect, false);
  // What analyze mode used to grade: a₈, in every box.
  assert.equal(gradeFields(arithmetic, { a2: a(8), a3: a(8), a5: a(8) }).isCorrect, false);
});

const TERM_FIELDS = [{ id: 'a5', label: 'a(5)', answer: '23' }];
const base = { prompt: 'Analyze the sequence 7, 11, 15, ...', sequence: { kind: 'arithmetic', first: 7, difference: 4 } };

test('every other sequence item still compiles to SequenceExplorer', () => {
  // A positive target, a missing index or a partial sum is SequenceExplorer's workflow, boxes or not.
  assert.equal(compileOne({ ...base, studentActions: ['findSequenceTerm'], targetN: 5, answerFields: TERM_FIELDS }).type, 'sequenceExplorer');
  assert.equal(compileOne({ ...base, studentActions: ['analyzeSequence'], missingIndex: 3, answerFields: TERM_FIELDS }).type, 'sequenceExplorer');
  assert.equal(compileOne({ ...base, studentActions: ['findSequenceTerm'], sumN: 4, answerFields: TERM_FIELDS }).type, 'sequenceExplorer');
  // Any other sequence action asks for the integrated workspace.
  assert.equal(compileOne({ ...base, studentActions: ['findSequenceTerm', 'writeExplicit'], answerFields: TERM_FIELDS }).type, 'sequenceExplorer');
  // No boxes authored: analyze mode is the question.
  const analyze = compileOne({ ...base, studentActions: ['findSequenceTerm'] });
  assert.equal(analyze.type, 'sequenceExplorer');
  assert.equal(analyze.mode, 'analyze');
  // A box with no label is not student-facing, so it never claimed the item.
  assert.equal(compileOne({ ...base, studentActions: ['findSequenceTerm'], answerFields: [{ id: 'a5', answer: '23' }] }).type, 'sequenceExplorer');
});

const gradeAnalyze = (question, work) => gradeToolCheck(sequenceExplorerGrader, question, work);

test('SequenceExplorer stores commonDifference / commonRatio as difference / ratio, and the sequence is the same', () => {
  const arithmetic = compileOne({ prompt: 'Analyze.', studentActions: ['analyzeSequence'], sequence: { kind: 'arithmetic', first: 7, commonDifference: 4 } });
  assert.deepEqual(arithmetic.sequence, { kind: 'arithmetic', first: 7, difference: 4 });
  assert.equal(gradeAnalyze(arithmetic, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: String(arithmeticTerm(7, 4, 8)) }).isCorrect, true);
  assert.equal(gradeAnalyze(arithmetic, { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: String(arithmeticTerm(7, 1, 8)) }).isCorrect, false);

  // Ratio 3, not the unauthored default 2, so the name is proven read.
  const geometric = compileOne({ prompt: 'Analyze.', studentActions: ['analyzeSequence'], sequence: { kind: 'geometric', first: 3, commonRatio: 3 } });
  assert.deepEqual(geometric.sequence, { kind: 'geometric', first: 3, ratio: 3 });

  // compare mode's two sequences, each with its own default family.
  const compare = compileOne({ prompt: 'Compare.', studentActions: ['compareSequences'], left: { first: 3, commonDifference: 5 }, right: { first: 1, commonRatio: 4 } });
  assert.deepEqual(compare.left, { first: 3, difference: 5 });
  assert.deepEqual(compare.right, { first: 1, ratio: 4 });

  // A spec that already names its change keeps it, alias and all: the tool reads difference / change first.
  const named = compileOne({ prompt: 'Analyze.', studentActions: ['analyzeSequence'], sequence: { kind: 'arithmetic', first: 7, difference: 5, commonDifference: 4 } });
  assert.deepEqual(named.sequence, { kind: 'arithmetic', first: 7, difference: 5, commonDifference: 4 });
  const changed = compileOne({ prompt: 'Analyze.', studentActions: ['analyzeSequence'], sequence: { kind: 'geometric', first: 3, change: 0.5, commonRatio: 3 } });
  assert.deepEqual(changed.sequence, { kind: 'geometric', first: 3, change: 0.5, commonRatio: 3 });
  // The other family's name is not this family's change.
  const crossed = compileOne({ prompt: 'Analyze.', studentActions: ['analyzeSequence'], sequence: { kind: 'arithmetic', first: 7, commonRatio: 3 } });
  assert.deepEqual(crossed.sequence, { kind: 'arithmetic', first: 7, commonRatio: 3 });
});
