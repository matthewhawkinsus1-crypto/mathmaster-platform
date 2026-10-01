// Skill / TEKS analysis: aggregated from the standards each question actually
// carries, with fixed minimum-evidence rules, Standard and Modified kept apart,
// and prerequisite gaps only where MathMaster has a real prerequisite map.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_SCORED_FOR_SKILL_FINDING, analyzeSkills, sectionGroupOf,
} from '../../src/platform/caseReview/skillAnalysis.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T15:00:00Z');
let counter = 0;
const row = (code, section, outcome, finalCredit, extra = {}) => {
  counter += 1;
  const correct = finalCredit === 100;
  return {
    assignmentId: extra.assignmentId || 'a1',
    storageIndex: counter,
    questionId: `q${counter}`,
    section,
    standards: { primary: code ? [code] : [], secondary: [], prerequisite: extra.prerequisite || [] },
    outcome,
    finalResult: outcome === QUESTION_OUTCOME.NOT_ATTEMPTED ? 'not-attempted' : correct ? 'correct' : finalCredit > 0 ? 'partial' : 'incorrect',
    finalCredit: outcome === QUESTION_OUTCOME.NOT_ATTEMPTED ? null : finalCredit,
    firstAttemptCorrect: outcome === QUESTION_OUTCOME.NOT_ATTEMPTED ? null : outcome === QUESTION_OUTCOME.CORRECT_FIRST,
    improved: outcome === QUESTION_OUTCOME.CORRECTED_AFTER_RETRY,
    totalAttempts: outcome === QUESTION_OUTCOME.CORRECT_FIRST ? 1 : 3,
    lastAttemptAtMs: extra.atMs ?? T0,
    condition: extra.condition || 'standard',
    replacements: 0,
    repeatedReturn: null,
    attemptsSource: 'derived-from-record',
  };
};
const { CORRECT_FIRST: FIRST, CORRECTED_AFTER_RETRY: RETRY, EXHAUSTED: EXH, NOT_ATTEMPTED: NONE } = QUESTION_OUTCOME;

const questions = [
  // A.5A — strong.
  row('A.5A', 'classwork', FIRST, 100), row('A.5A', 'classwork', FIRST, 100), row('A.5A', 'practice', FIRST, 100), row('A.5A', 'dol', FIRST, 100),
  // A.5C — weak and persistent; its hard prerequisite A.5A is strong.
  row('A.5C', 'classwork', EXH, 0, { assignmentId: 'a1' }), row('A.5C', 'practice', EXH, 30, { assignmentId: 'a2' }), row('A.5C', 'dol', EXH, 0, { assignmentId: 'a2' }), row('A.5C', 'classwork', RETRY, 100),
  // A.3B — improves with retries.
  row('A.3B', 'classwork', RETRY, 100, { atMs: T0 }), row('A.3B', 'practice', RETRY, 100, { atMs: T0 + DAY }), row('A.3B', 'practice', FIRST, 100, { atMs: T0 + 9 * DAY }), row('A.3B', 'dol', EXH, 0, { atMs: T0 + 10 * DAY }),
  // A.2A — only two questions: limited evidence, never a finding.
  row('A.2A', 'classwork', EXH, 0), row('A.2A', 'classwork', EXH, 0),
  // Modified work on A.5A, kept apart.
  row('A.5A', 'classwork', EXH, 0, { condition: 'modified', assignmentId: 'a3' }),
  // No standard metadata at all.
  row(null, 'classwork', FIRST, 100), row(null, 'classwork', NONE, 0),
];

const analysis = analyzeSkills({ questions, nowValue: T0 + 20 * DAY });
const skill = (code) => analysis.skills.find((entry) => entry.code === code);

test('each standard aggregates only the questions tagged with it, with its TEKS description', () => {
  assert.deepEqual(analysis.skills.map((entry) => entry.code).sort(), ['A.2A', 'A.3B', 'A.5A', 'A.5C']);
  assert.equal(skill('A.5A').attempted, 5);
  assert.match(skill('A.5A').description, /linear equations/i);
  assert.equal(analysis.untagged.attempted, 1, 'questions without standards are counted, not assigned a skill');
  assert.match(analysis.untagged.note, /no standard/i);
});

test('Standard and Modified work are reported separately for a standard', () => {
  const a5a = skill('A.5A');
  assert.equal(a5a.byCondition.standard.attempted, 4);
  assert.equal(a5a.byCondition.standard.finalCreditAverage, 100);
  assert.equal(a5a.byCondition.modified.attempted, 1);
  assert.equal(a5a.byCondition.modified.finalCreditAverage, 0);
});

test('DOL and instructional (Classwork + Practice) accuracy per standard', () => {
  const a3b = skill('A.3B');
  assert.equal(a3b.instructional.finalCreditAverage, 100);
  assert.equal(a3b.dol.finalCreditAverage, 0);
  assert.equal(a3b.instructional.firstAttemptAccuracy, 33);
  assert.equal(sectionGroupOf('warmup'), 'warmup');
  assert.equal(sectionGroupOf('quiz'), 'assessment');
  assert.equal(sectionGroupOf('test'), 'assessment');
});

test('findings follow fixed rules with a minimum amount of evidence', () => {
  assert.ok(MIN_SCORED_FOR_SKILL_FINDING >= 3);
  assert.ok(analysis.findings.strongest.some((entry) => entry.code === 'A.5A'));
  assert.ok(analysis.findings.needsInstruction.some((entry) => entry.code === 'A.5C'));
  assert.ok(analysis.findings.persistentError.some((entry) => entry.code === 'A.5C'));
  assert.ok(analysis.findings.improvedAfterRetry.some((entry) => entry.code === 'A.3B'));
  // Two questions are not enough to call anything.
  ['strongest', 'needsInstruction', 'persistentError', 'improvedAfterRetry'].forEach((key) => {
    assert.ok(!analysis.findings[key].some((entry) => entry.code === 'A.2A'), `A.2A must not be a ${key} finding`);
  });
  assert.ok(analysis.findings.limitedEvidence.some((entry) => entry.code === 'A.2A'));
  // Every finding states its rule in numbers, never a judgement.
  [...analysis.findings.needsInstruction, ...analysis.findings.persistentError].forEach((entry) => {
    assert.match(entry.reason, /\d/);
    assert.doesNotMatch(entry.reason, /struggl|weak student|can't|cannot learn|effort/i);
  });
});

test('prerequisite gaps come only from MathMaster\'s authored prerequisite map', () => {
  const gaps = analysis.prerequisites.find((entry) => entry.code === 'A.5C');
  assert.ok(gaps, 'A.5C needs instruction and has an authored prerequisite');
  const a5a = gaps.prerequisites.find((entry) => entry.code === 'A.5A');
  assert.equal(a5a.strength, 'hard');
  assert.equal(a5a.source, 'course-prerequisite-map');
  assert.equal(a5a.finalCreditAverage, 100);
  assert.equal(a5a.status, 'evidence-at-or-above-threshold');
  // A standard with no authored prerequisites produces nothing.
  assert.ok(!analysis.prerequisites.some((entry) => entry.code === 'A.2A' && entry.prerequisites.length));
});

test('a trend needs dated evidence on at least two days and four questions', () => {
  const a3b = skill('A.3B');
  assert.equal(a3b.trend.determinable, true);
  assert.equal(a3b.trend.earlier.finalCreditAverage, 100);
  assert.equal(a3b.trend.later.finalCreditAverage, 50);
  assert.equal(skill('A.2A').trend.determinable, false);
});

test('a platform-inferred standard (Honors extension) is never counted toward a skill', () => {
  const inferred = { ...row('A.5A', 'classwork', EXH, 0), standardsSource: 'platform-inferred' };
  const result = analyzeSkills({ questions: [...questions, inferred] });
  assert.equal(result.skills.find((entry) => entry.code === 'A.5A').attempted, 5, 'unchanged by the inferred question');
  assert.equal(result.platformInferred.attempted, 1);
  assert.match(result.platformInferred.note, /not counted toward any standard/);
});
