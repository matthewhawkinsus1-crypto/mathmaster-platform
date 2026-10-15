import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  DEFECT,
  DEFAULT_TOOL_SCOPE,
  NEEDS_TEACHER_REASON,
  REGRADE_CLASS,
  planClassroomAttempt,
} from '../../scripts/lib/classroomRegradePlan.mjs';
import { storedAttempt } from './helpers/classroomRegradeFixtures.mjs';

/*
 * JOB P — K's read-only classroom re-grade report, extended to Job P's
 * grading changes. Nothing here re-grades: the report lists, the owner
 * decides (D2).
 *
 * Each attempt is stored the way ingestion stores it (K's storedAttempt) with
 * the verdict main's code recorded, pinned by hand below and checked against
 * main by scripts/sweep-equivalence-verdicts.mjs and the pGrading_* tests
 * (each fails on main). The report replays it with today's graders.
 */
const ASSIGNMENT = { id: 'p-regrade-assignment', schemaVersion: 5 };
const AT = Date.parse('2026-10-15T15:00:00Z');

// The recorded grading: today's result with main's verdict laid over it.
const recordedAs = (result, isCorrect) => ({
  ...result,
  isCorrect,
  score: isCorrect ? 1 : 0,
  parts: result.parts.map((part) => ({ ...part, isCorrect, ...('credit' in part ? { credit: isCorrect ? 1 : 0 } : {}) })),
});

const planOf = ({ question, response, current, recordedCorrect, tag }) => {
  const attempt = storedAttempt({
    assignmentId: ASSIGNMENT.id,
    questionIndex: 0,
    question,
    response,
    grading: recordedAs(current, recordedCorrect),
    submissionId: `sub-${tag}`,
    at: AT,
  });
  return planClassroomAttempt({
    assignment: ASSIGNMENT,
    question,
    questionIndex: 0,
    studentId: `student-${tag}`,
    record: attempt.record,
    evidenceDocument: attempt.evidenceDocument,
  });
};

const fieldsAttempt = (question, value, recordedCorrect, tag) => {
  const response = { kind: 'fields', fields: [{ id: question.answerFields[0].id, value }] };
  return planOf({ question, response, current: gradeServerResponse({ question, response }), recordedCorrect, tag });
};
const toolAttempt = (toolId, question, work, recordedCorrect, tag) => {
  const current = gradeToolWork({ toolId, question, work });
  return planOf({ question, response: current.toolResponse, current, recordedCorrect, tag });
};

test('the default scope now reaches the surfaces Job P changed', () => {
  for (const tool of ['multiAnswer', 'orderedPair', 'intervalNumberLine', 'graphAnalysis', 'functionGraph', 'exponentialLogBridge']) {
    assert.ok(DEFAULT_TOOL_SCOPE.includes(tool), tool);
  }
});

test('a field answer main marked wrong and Job P accepts is a re-grade candidate, attributed to P', () => {
  const question = { type: 'multiAnswer', prompt: 'Solve 2x = 10.', answerFields: [{ id: 'x', label: 'x', answer: '5' }] };
  // Main: "x=5" was not the number 5 (see pGrading_answerEquivalence).
  const result = fieldsAttempt(question, 'x=5', false, 'x-equals');
  assert.equal(result.classification, REGRADE_CLASS.CANDIDATE);
  assert.ok(result.defects.includes(DEFECT.P_ANSWER_SPELLING));
  // Negative control: a wrong number stays wrong and unchanged.
  const wrong = fieldsAttempt(question, '6', false, 'wrong-number');
  assert.equal(wrong.classification, REGRADE_CLASS.UNCHANGED);
});

test('the number line inequality with an exact endpoint is a re-grade candidate', () => {
  const question = { type: 'intervalNumberLine', prompt: 'Write the inequality.', intervals: [{ min: 1 / 3, max: null }], ask: ['inequality'] };
  const result = toolAttempt('intervalNumberLine', question, { inequality: 'x > 1/3' }, false, 'third');
  assert.equal(result.classification, REGRADE_CLASS.CANDIDATE);
  assert.ok(result.defects.includes(DEFECT.P_INTERVAL_INEQUALITY_EXACT));
});

test('a line\'s monotone key: "none" for a rising line was right on main and is listed as now-lower', () => {
  const question = { type: 'graphAnalysis', prompt: 'Where is y = 2x + 1 increasing?', functionSpec: { type: 'line', m: 2, b: 1 }, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, analysisRequests: [{ id: 'inc', kind: 'increasing' }] };
  const lower = toolAttempt('graphAnalysis', question, { analysis: { answers: { inc: 'none' } } }, true, 'line-none');
  assert.equal(lower.classification, REGRADE_CLASS.NOW_LOWER);
  assert.ok(lower.defects.includes(DEFECT.P_LINE_FEATURES));
  const higher = toolAttempt('graphAnalysis', question, { analysis: { answers: { inc: '(-inf, inf)' } } }, false, 'line-all');
  assert.equal(higher.classification, REGRADE_CLASS.CANDIDATE);
});

test('an exponential bridge written with b: the base-2 answer main accepted is listed as now-lower', () => {
  const question = { toolId: 'exponentialLogBridge', type: 'exponentialLogBridge', prompt: 'f(x) = 3·5^(x − 1) + 4', mode: 'composition', function: { type: 'exponential', a: 3, b: 5, h: 1, k: 4 }, x: 1 };
  const lower = toolAttempt('exponentialLogBridge', question, { inverseAfterForward: '1', forwardAfterInverse: '10' }, true, 'base-two');
  assert.equal(lower.classification, REGRADE_CLASS.NOW_LOWER);
  assert.ok(lower.defects.includes(DEFECT.P_BRIDGE_B_IS_BASE));
  const higher = toolAttempt('exponentialLogBridge', question, { inverseAfterForward: '1', forwardAfterInverse: '19' }, false, 'base-five');
  assert.equal(higher.classification, REGRADE_CLASS.CANDIDATE);
});

test('item 8: a vertex keyed on an exponential is listed for the owner; its verdict does not change', () => {
  const question = { type: 'graphAnalysis', prompt: 'Find the vertex.', functionSpec: { type: 'exponential', a: 1, base: 2, h: 0, k: 1 }, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
  const result = toolAttempt('graphAnalysis', question, { analysis: { selections: { feature: [[0, 1]] } } }, true, 'exp-vertex');
  assert.equal(result.direction, 'same');
  assert.equal(result.classification, REGRADE_CLASS.NEEDS_TEACHER);
  assert.equal(result.reason, NEEDS_TEACHER_REASON.FEATURE_NOT_ON_FUNCTION);
  // A parabola's vertex is a real feature: unchanged, not listed.
  const parabola = { ...question, functionSpec: { type: 'quadratic', a: 1, h: 0, k: 1 } };
  assert.equal(toolAttempt('graphAnalysis', parabola, { analysis: { selections: { feature: [[0, 1]] } } }, true, 'parabola-vertex').classification, REGRADE_CLASS.UNCHANGED);
});
