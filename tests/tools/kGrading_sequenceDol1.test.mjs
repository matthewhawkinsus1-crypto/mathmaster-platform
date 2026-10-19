import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import sequenceExplorerGrader from '../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { sequenceSpecFromQuestion } from '../../functions/shared/toolMath/sequenceExplorer/sequenceMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

/*
 * DISTRICT DOL1'S SEQUENCE ITEMS GRADE THE TERMS THEY ASK FOR, ON THE SEQUENCE
 * THEY DESCRIBE.
 *
 * The items asked "find the second, third and fifth terms" (and "the fourth
 * term") and authored those boxes as answerFields, but also authored the
 * semantic action findSequenceTerm. That action hands the question to
 * SequenceExplorer's analyze mode, which drops the answerFields and grades the
 * family, the common change and a₈ instead. The items now author
 * multipleResponses, the documented shape for "these exact response boxes,
 * with a sequence as context", so the authored boxes are what is graded.
 *
 * Separately, the items name the change commonDifference / commonRatio. The
 * tool read only difference / ratio / change, so the sequence it drew and
 * graded was 7, 8, 9, ... — a stored analyze-mode copy of these items is still
 * graded by the tool, so the tool now reads those names too.
 *
 * Expected values are hand-derived from each prompt:
 *   7, 11, 15, 19, 23, ... (start 7, +4)      → a2 = 11, a3 = 15, a5 = 23, a8 = 35
 *   3, 6, 12, 24, 48, ...  (start 3, ×2)      → g2 = 6,  g3 = 12, g5 = 48
 *   20, 17, 14, 11, ...    (start 20, −3)     → a4 = 11, a8 = −1
 */

const SOURCE = JSON.parse(fs.readFileSync(
  new URL('../../teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json', import.meta.url),
  'utf8',
));

const compiledQuestions = (source) => compileAuthoringIntentV5(source).package.sections.flatMap((section) => section.questions);
const byPrompt = (questions, fragment) => {
  const found = questions.filter((question) => String(question.prompt || '').includes(fragment));
  assert.equal(found.length, 1, `exactly one question asks "${fragment}"`);
  return found[0];
};

const ARITHMETIC = 'starts at 7 and each term is 4 more';
const GEOMETRIC = 'starts at 3 and each term is twice';
const DECREASING = 'starts at 20 and each term is 3 less';

const fieldsResponse = (fields) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(fields).map(([id, value]) => ({ id, value: String(value), isComplete: String(value).trim() !== '' })),
});
const gradeFields = (question, fields) => gradeServerResponse({ question, response: fieldsResponse(fields) });

test('the real DOL1 sequence items compile to the response boxes their prompts ask for', () => {
  const questions = compiledQuestions(SOURCE);
  const expected = [
    [ARITHMETIC, ['a2', 'a3', 'a5']],
    [GEOMETRIC, ['g2', 'g3', 'g5']],
    [DECREASING, ['a4']],
  ];
  expected.forEach(([fragment, ids]) => {
    const question = byPrompt(questions, fragment);
    assert.equal(question.type, 'multiAnswer', `${fragment}: graded on its authored boxes, not SequenceExplorer's a₈`);
    assert.deepEqual(question.answerFields.map((field) => field.id), ids, `${fragment}: the terms the prompt names`);
  });
});

test('DOL1: the correct terms are right, and a wrong term is wrong', () => {
  const questions = compiledQuestions(SOURCE);
  const arithmetic = byPrompt(questions, ARITHMETIC);
  const geometric = byPrompt(questions, GEOMETRIC);
  const decreasing = byPrompt(questions, DECREASING);

  assert.equal(gradeFields(arithmetic, { a2: 11, a3: 15, a5: 23 }).isCorrect, true);
  assert.equal(gradeFields(geometric, { g2: 6, g3: 12, g5: 48 }).isCorrect, true);
  assert.equal(gradeFields(decreasing, { a4: 11 }).isCorrect, true);

  // a6 = 27 in the a5 box; one +4 too many.
  assert.equal(gradeFields(arithmetic, { a2: 11, a3: 15, a5: 27 }).isCorrect, false);
  // Doubling read as adding 2: 3, 5, 7, ..., 11.
  assert.equal(gradeFields(geometric, { g2: 5, g3: 7, g5: 11 }).isCorrect, false);
  // The sequence the tool used to read (difference 1): 20, 21, 22, 23.
  assert.equal(gradeFields(decreasing, { a4: 23 }).isCorrect, false);
  // What analyze mode used to ask for: a₈ of 7, 8, 9, ... is not any box's answer.
  assert.equal(gradeFields(arithmetic, { a2: 14, a3: 14, a5: 14 }).isCorrect, false);
});

/*
 * A STORED ANALYZE-MODE COPY STILL USES THE AUTHORED SEQUENCE: the shape a
 * classroom copy imported before this fix holds.
 */

const gradeAnalyze = (question, work) => gradeToolCheck(sequenceExplorerGrader, question, work);

// The two stored copies, pinned as the compiler of 4dc216e..283b29b produced
// them from the first-authored items (the compiler now routes that shape to
// multiAnswer, so a live compile no longer reproduces what classrooms hold).
const STORED_ANALYZE_COPIES = [
  { type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, commonDifference: 4 }, prompt: 'An arithmetic sequence starts at 7 and each term is 4 more than the term before it. Find the second, third and fifth terms.', studentActions: ['findSequenceTerm'], standard: 'A.12C', questionId: 'q_section-2_2_12' },
  { type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'arithmetic', first: 20, commonDifference: -3 }, prompt: 'A sequence starts at 20 and each term is 3 less than the term before it. Find the fourth term.', studentActions: ['findSequenceTerm'], standard: 'A.12C', questionId: 'q_section-4_4_8' },
];

test('a stored analyze-mode DOL1 copy is graded on the sequence it describes, not difference 1', () => {
  const arithmetic = byPrompt(STORED_ANALYZE_COPIES, ARITHMETIC);
  const decreasing = byPrompt(STORED_ANALYZE_COPIES, DECREASING);
  assert.equal(arithmetic.type, 'sequenceExplorer');
  assert.equal(arithmetic.mode, 'analyze');
  assert.equal(arithmetic.sequence.commonDifference, 4, 'the stored copy carries the authored name verbatim');

  assert.equal(gradeAnalyze(arithmetic, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' }).isCorrect, true);
  assert.equal(gradeAnalyze(arithmetic, { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: '14' }).isCorrect, false);
  assert.equal(gradeAnalyze(decreasing, { kindAnswer: 'arithmetic', changeAnswer: '-3', termAnswer: '-1' }).isCorrect, true);
  assert.equal(gradeAnalyze(decreasing, { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: '27' }).isCorrect, false);
});

test('commonDifference / commonRatio are read, and never override difference, ratio or change', () => {
  // DOL1's geometric ratio 2 equals the unauthored default, so prove the name is read with another ratio.
  assert.deepEqual(sequenceSpecFromQuestion({ sequence: { kind: 'geometric', first: 3, commonRatio: 3 } }), { kind: 'geometric', first: 3, ratio: 3 });
  assert.deepEqual(sequenceSpecFromQuestion({ sequence: { kind: 'arithmetic', first: 7, commonDifference: 4 } }), { kind: 'arithmetic', first: 7, difference: 4 });
  // Every spec that already named the change keeps exactly its sequence.
  assert.equal(sequenceSpecFromQuestion({ sequence: { kind: 'arithmetic', first: 7, difference: 5, commonDifference: 4 } }).difference, 5);
  assert.equal(sequenceSpecFromQuestion({ sequence: { kind: 'arithmetic', first: 7, change: 2, commonDifference: 4 } }).difference, 2);
  assert.equal(sequenceSpecFromQuestion({ sequence: { kind: 'geometric', first: 3, ratio: 0.5, commonRatio: 3 } }).ratio, 0.5);
  // A name for the other family is not this family's change.
  assert.equal(sequenceSpecFromQuestion({ sequence: { kind: 'arithmetic', first: 7, commonRatio: 3 } }).difference, 1);
});
