// DOL vs instructional work: the numbers side by side, differences flagged by a
// fixed rule, and never an explanation of why they differ.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBSTANTIAL_DIFFERENCE_POINTS, compareSections, describeSectionComparison,
} from '../../src/platform/caseReview/sectionComparison.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';

const { CORRECT_FIRST: FIRST, CORRECTED_AFTER_RETRY: RETRY, EXHAUSTED: EXH } = QUESTION_OUTCOME;
const row = (assignmentId, section, outcome, credit, extra = {}) => ({
  assignmentId,
  section,
  outcome,
  finalCredit: credit,
  finalResult: credit === 100 ? 'correct' : credit > 0 ? 'partial' : 'incorrect',
  firstAttemptCorrect: outcome === FIRST,
  standards: { primary: extra.code ? [extra.code] : [] },
  condition: extra.condition || 'standard',
  lastAttemptSupports: extra.supports || [],
  attempts: [{ calculatorUsed: extra.calculator === true }],
});

// High completion, low DOL: instructional work mostly correct (often after
// retries); DOL items mostly not correct.
const questions = [
  ...['a1', 'a2'].flatMap((id) => [
    row(id, 'classwork', FIRST, 100, { code: 'A.5A' }), row(id, 'classwork', RETRY, 100, { code: 'A.5A' }), row(id, 'classwork', EXH, 40, { code: 'A.5A' }),
    row(id, 'practice', RETRY, 100, { code: 'A.5A', calculator: true }), row(id, 'practice', FIRST, 100, { code: 'A.5A' }),
    row(id, 'dol', EXH, 0, { code: 'A.5A' }), row(id, 'dol', FIRST, 100, { code: 'A.5A' }),
  ]),
  row('a1', 'warmup', FIRST, 100), row('a1', 'warmup', FIRST, 100),
  row('a3', 'classwork', FIRST, 100, { condition: 'modified' }), row('a3', 'dol', FIRST, 100, { condition: 'modified' }),
];
const assignments = [
  { assignmentId: 'a1', title: 'Lesson 1', condition: { value: 'standard' }, sections: [{ key: 'classwork', score: 80 }, { key: 'practice', score: 100 }, { key: 'dol', score: 50 }] },
  { assignmentId: 'a2', title: 'Lesson 2', condition: { value: 'standard' }, sections: [{ key: 'classwork', score: 80 }, { key: 'practice', score: 100 }, { key: 'dol', score: 50 }] },
  { assignmentId: 'a3', title: 'Lesson 3 (MOD)', condition: { value: 'modified' }, sections: [{ key: 'classwork', score: 100 }, { key: 'dol', score: 100 }] },
  { assignmentId: 't1', title: 'Unit Test', condition: { value: 'standard' }, sections: [], isAssessment: true, score: 64, status: 'completed' },
];

const comparison = compareSections({ questions, assignmentRows: assignments });
const section = (key, condition = 'standard') => comparison.byCondition[condition].find((entry) => entry.key === key);

test('each section is pooled over its questions, Standard and Modified apart', () => {
  assert.equal(section('classwork').attempted, 6);
  assert.equal(section('classwork').finalCreditAverage, 80);
  assert.equal(section('practice').finalCreditAverage, 100);
  assert.equal(section('dol').finalCreditAverage, 50);
  assert.equal(section('warmup').finalCreditAverage, 100);
  assert.equal(section('dol', 'modified').attempted, 1);
  assert.equal(section('dol', 'modified').finalCreditAverage, 100);
  // First attempt vs final, side by side.
  assert.equal(section('classwork').firstAttemptAccuracy, 33);
  assert.equal(section('practice').firstAttemptAccuracy, 50);
});

test('assessments (Quiz / Test) appear when the selection has them, from their recorded grades', () => {
  assert.deepEqual(comparison.assessments.map((entry) => [entry.assignmentId, entry.score]), [['t1', 64]]);
});

test('a substantial difference is flagged by a fixed number, with both values printed', () => {
  assert.ok(SUBSTANTIAL_DIFFERENCE_POINTS >= 10);
  const cwDol = comparison.comparisons.find((entry) => entry.from === 'instructional' && entry.to === 'dol' && entry.condition === 'standard');
  assert.equal(cwDol.fromValue, 88); // Classwork + Practice pooled: (6×80 + 4×100) / 10
  assert.equal(cwDol.toValue, 50);
  assert.equal(cwDol.substantial, true);
  const highlights = describeSectionComparison(comparison);
  assert.ok(highlights.includes('Classwork final accuracy: 80%.'));
  assert.ok(highlights.includes('Practice final accuracy: 100%.'));
  assert.ok(highlights.includes('DOL accuracy: 50%.'));
  highlights.forEach((line) => assert.doesNotMatch(line, /because|due to|caus|effort|motivat|support (helped|explains)/i));
});

test('per assignment and per standard, where DOL sits well below the same lesson\'s instruction', () => {
  assert.deepEqual(comparison.assignmentsWithDolGap.map((entry) => entry.assignmentId), ['a1', 'a2']);
  assert.ok(comparison.standardsWithDolGap.some((entry) => entry.code === 'A.5A'));
});

test('recorded tool use per section is counted where the attempt record has it', () => {
  assert.equal(section('practice').calculatorRecordedQuestions, 2);
  assert.equal(section('classwork').calculatorRecordedQuestions, 0);
});

test('with too little evidence nothing is flagged', () => {
  const thin = compareSections({ questions: [row('x', 'classwork', FIRST, 100), row('x', 'dol', EXH, 0)], assignmentRows: [] });
  assert.ok(thin.comparisons.every((entry) => entry.substantial === false));
  assert.match(thin.note, /does not determine why/i);
});
