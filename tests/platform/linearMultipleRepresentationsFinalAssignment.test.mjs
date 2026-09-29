/*
 * PR #397 — THE FINAL ALGEBRA I MULTIPLE-REPRESENTATIONS ASSIGNMENT.
 *
 * docs/assignments/algebra1-linear-multiple-representations-final-v5.json is
 * certified through the chain a teacher's import and publish actually run
 * (App.jsx handleCreateAssignment), not raw-JSON preflight: import recompiles
 * by studentActions, and Firestore-safe repair rewrites coordinate lists, so
 * a file can pass raw preflight and still publish broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { resolveQuestionActivityRole, getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import {
  deriveLinearMultipleRepresentations,
  describeGivenRepresentation,
  resolveRequiredCards,
  scoreLinearMultipleRepresentations,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsMath.js';

const FINAL = 'docs/assignments/algebra1-linear-multiple-representations-final-v5.json';
const finalText = readFileSync(new URL(`../../${FINAL}`, import.meta.url), 'utf8');

/** The teacher import + publish chain, returning the questions a student is served. */
const publish = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  const questions = model.isValid ? validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {}) : [];
  return {
    model,
    questions,
    sections: model.isValid ? rebuildV5SectionsFromQuestions(model.assignmentV5, questions) : [],
  };
};

const published = publish(finalText);
const served = (id) => published.questions.find((question) => question.questionId === id);
const raw = JSON.parse(finalText);
const rawQuestions = raw.sections.flatMap((section) => section.questions);

test('the FINAL file passes the real teacher import chain with zero blocking errors', () => {
  assert.deepEqual(published.model.errors, []);
  assert.deepEqual(published.model.toolContract?.errors || [], []);
  assert.equal(published.model.isValid, true);
  for (const question of published.questions) {
    assert.deepEqual(validateToolQuestion(question).errors, [], question.questionId);
  }
});

test('lesson shape: Warm-Up 2, Classwork 3, Practice 2, one concise one-attempt DOL', () => {
  assert.equal(raw.assignment.title, 'Algebra I — Multiple Representations of Linear Equations');
  assert.equal(raw.assignment.courseId, 'algebra1');
  assert.deepEqual(published.sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(published.sections.map((section) => section.questions.length), [2, 3, 2, 1]);
  const dol = published.sections[3];
  assert.equal(dol.attemptsAllowed, 1);
  assert.equal(dol.hintsAllowed, false);
  const dolQuestion = served('lmr-dol-1');
  assert.equal(dolQuestion.feedbackTiming, 'submitOnly');
  assert.equal(getEffectiveActivityPolicy(resolveQuestionActivityRole({ question: dolQuestion, assignment: published.model.assignmentV5 })).feedback, 'afterAssignmentSubmit');
  assert.ok(resolveRequiredCards(dolQuestion).length <= 6, 'the DOL board is concise');
  const teks = new Set(published.questions.flatMap((question) => (question.alignments || []).map((alignment) => alignment.code)));
  for (const code of ['A.2A', 'A.2B', 'A.2C', 'A.3A', 'A.3B', 'A.3C']) assert.ok(teks.has(code), `${code} is aligned`);
});

test('every board question compiles to the free-order board with its source intact', () => {
  for (const rawQuestion of rawQuestions.filter((question) => question.type === 'representationBridge')) {
    const question = served(rawQuestion.questionId);
    assert.equal(question.type, 'representationBridge', rawQuestion.questionId);
    assert.equal(question.mode, 'linearMultipleRepresentations', rawQuestion.questionId);
    assert.deepEqual(question.source, rawQuestion.source, `${rawQuestion.questionId} source survives import`);
    assert.deepEqual(question.requiredCards, rawQuestion.requiredCards, `${rawQuestion.questionId} requiredCards survive import`);
    assert.equal(question.stageGating, undefined);
  }
  for (const id of ['lmr-wu-1', 'lmr-wu-2']) {
    const warmup = served(id);
    assert.equal(warmup.type, 'representationMatch');
    assert.equal(warmup.mode, 'linearConnections');
    assert.equal(warmup.sets.length, 2);
  }
});

test('each question describes the line the lesson intends, and the GIVEN shows what was authored', () => {
  const facts = (id) => deriveLinearMultipleRepresentations(served(id));
  const expect = {
    'lmr-cw-1': { m: 0.5, b: -3, zero: 6, given: '2x - 4y = 12' },
    'lmr-cw-2': { m: -2, b: 4, zero: 2, given: 'y = -2x + 4' },
    'lmr-cw-3': { m: -1, b: 5, zero: 5, given: 'y - 2 = -1(x - 3)' },
    'lmr-pr-1': { m: 3, b: -6, zero: 2 },
    'lmr-pr-2': { m: -2, b: 18, zero: 9 },
    'lmr-dol-1': { m: -3, b: 24, zero: 8 },
  };
  for (const [id, line] of Object.entries(expect)) {
    const derived = facts(id);
    assert.equal(derived.isValid, true, id);
    assert.equal(derived.slopeNumber, line.m, `${id} slope`);
    assert.equal(derived.yInterceptNumber, line.b, `${id} y-intercept`);
    assert.equal(derived.zeroNumber, line.zero, `${id} x-intercept`);
    const given = describeGivenRepresentation(served(id), derived);
    if (line.given) assert.equal(given.latex, line.given, `${id} GIVEN is the authored equation`);
  }
  assert.deepEqual(facts('lmr-cw-3').sourcePoint, [3, 2], 'CW3 keeps the authored anchor (3, 2)');
  const table = describeGivenRepresentation(served('lmr-pr-1'));
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.rows.map((row) => [row.xLatex, row.yLatex]), [['-1', '-9'], ['1', '-3'], ['3', '3'], ['5', '9']]);
  const story = describeGivenRepresentation(served('lmr-pr-2'));
  assert.equal(story.kind, 'scenario');
  assert.match(story.text, /18 inches tall/);
});

test('no prompt hands over an answer the board asks for', () => {
  const leaks = {
    'lmr-cw-1': [/1\/2x|y\s*=\s*.*x\s*-\s*3|\(6,\s*0\)|\(0,\s*-3\)/],
    'lmr-cw-2': [/x\s*\+\s*y|2x\s*\+\s*y\s*=\s*4|\(2,\s*0\)/],
    'lmr-cw-3': [/y\s*=\s*-x\s*\+\s*5|\(5,\s*0\)|\(0,\s*5\)/],
    'lmr-pr-1': [/3x\s*-\s*6|slope (is )?3/],
    'lmr-pr-2': [/y\s*=\s*-2x|0\s*≤\s*x\s*≤\s*9|9 hours/],
    'lmr-dol-1': [/y\s*=\s*-3x|8 minutes|0\s*≤\s*x\s*≤\s*8/],
  };
  for (const [id, patterns] of Object.entries(leaks)) {
    const question = served(id);
    const visible = `${question.prompt} ${question.source?.prompt || ''}`;
    for (const pattern of patterns) assert.doesNotMatch(visible, pattern, `${id} prompt/story reveals ${pattern}`);
  }
});

// A complete, correct student response per question. If the answer key and
// the question disagreed, one of these would not score 100%.
const RESPONSES = {
  'lmr-cw-1': {
    slopeInterceptEquation: 'y = \\frac{1}{2}x - 3',
    pointSlopeEquation: 'y + 2 = \\frac{1}{2}\\left(x - 2\\right)',
    featureSlope: '\\frac{1}{2}',
    featureXIntercept: '(6, 0)',
    featureYIntercept: '(0, -3)',
    featurePoint1: '(2, -2)',
    featurePoint2: '(4, -1)',
    tableRows: [{ x: '0', y: '-3' }, { x: '2', y: '-2' }, { x: '4', y: '-1' }, { x: '1', y: '-5/2' }],
    graph1Points: [[6, 0], [0, -3]],
    graph2Points: [[0, -3], [2, -2]],
    graph3Points: [[2, -2], [4, -1]],
  },
  'lmr-cw-2': {
    standardFormEquation: '2x + y = 4',
    pointSlopeEquation: 'y - 0 = -2(x - 2)',
    featureSlope: '-2',
    featureXIntercept: '(2, 0)',
    featureYIntercept: '(0, 4)',
    featurePoint1: '(1, 2)',
    featurePoint2: '(3, -2)',
    tableRows: [{ x: '0', y: '4' }, { x: '1', y: '2' }, { x: '2', y: '0' }, { x: '3', y: '-2' }],
    graph1Points: [[2, 0], [0, 4]],
    graph2Points: [[0, 4], [1, 2]],
    graph3Points: [[2, 0], [3, -2]],
  },
  'lmr-cw-3': {
    standardFormEquation: 'x + y = 5',
    slopeInterceptEquation: 'y = -x + 5',
    featureSlope: '-1',
    featureXIntercept: '(5, 0)',
    featureYIntercept: '(0, 5)',
    featurePoint1: '(3, 2)',
    featurePoint2: '(1, 4)',
    tableRows: [{ x: '0', y: '5' }, { x: '1', y: '4' }, { x: '3', y: '2' }, { x: '5', y: '0' }],
    graph1Points: [[5, 0], [0, 5]],
    graph2Points: [[0, 5], [1, 4]],
    // The GIVEN anchor (3, 2), whatever else the student might prefer.
    graph3Points: [[3, 2], [4, 1]],
  },
  'lmr-pr-1': {
    standardFormEquation: '3x - y = 6',
    slopeInterceptEquation: 'y = 3x - 6',
    pointSlopeEquation: 'y - 3 = 3(x - 3)',
    featureSlope: '3',
    featureXIntercept: '(2, 0)',
    featureYIntercept: '(0, -6)',
    featurePoint1: '(1, -3)',
    featurePoint2: '(3, 3)',
    graph1Points: [[2, 0], [0, -6]],
    graph2Points: [[0, -6], [1, -3]],
    graph3Points: [[3, 3], [4, 6]],
  },
  'lmr-pr-2': {
    standardFormEquation: '2x + y = 18',
    slopeInterceptEquation: 'y = -2x + 18',
    pointSlopeEquation: 'y - 10 = -2(x - 4)',
    featureSlope: '-2',
    featureXIntercept: '(9, 0)',
    featureYIntercept: '(0, 18)',
    featurePoint1: '(4, 10)',
    featurePoint2: '(9, 0)',
    tableRows: [{ x: '0', y: '18' }, { x: '3', y: '12' }, { x: '6', y: '6' }, { x: '9', y: '0' }],
    graph1Points: [[9, 0], [0, 18]],
    graph2Points: [[0, 18], [1, 16]],
    graph3Points: [[4, 10], [5, 8]],
    contextIndependent: 'time since the candle was lit (hours)',
    contextDependent: 'height of the candle (inches)',
    contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.',
    contextYInterceptMeaning: 'The candle is 18 inches tall when it is lit.',
    contextXInterceptMeaning: 'The candle is completely burned down after 9 hours.',
    contextDomain: '0 ≤ x ≤ 9',
  },
  'lmr-dol-1': {
    slopeInterceptEquation: 'y = -3x + 24',
    standardFormEquation: '3x + y = 24',
    featureSlope: '-3',
    featureXIntercept: '(8, 0)',
    featureYIntercept: '(0, 24)',
    graph2Points: [[0, 24], [1, 21]],
    contextSlopeMeaning: 'The tank loses 3 liters of water every minute.',
    contextYInterceptMeaning: 'The tank holds 24 liters when it starts draining.',
    contextDomain: '0 ≤ x ≤ 8',
  },
};

test('a complete correct board scores 100% on every question (the key agrees with the question)', () => {
  for (const [id, response] of Object.entries(RESPONSES)) {
    const result = scoreLinearMultipleRepresentations(served(id), response);
    const wrong = Object.entries(result.parts).filter(([, ok]) => !ok).map(([part]) => part);
    assert.deepEqual(wrong, [], `${id} parts marked wrong`);
    assert.equal(result.score, 1, id);
  }
});

test('the given point-slope anchor is required on CW3: another valid point does not earn Graph 3', () => {
  const result = scoreLinearMultipleRepresentations(served('lmr-cw-3'), { ...RESPONSES['lmr-cw-3'], graph3Points: [[1, 4], [2, 3]] });
  assert.equal(result.parts.graph3, false);
});

test('the scenario domain is graded, endpoints included', () => {
  const question = served('lmr-pr-2');
  for (const [domain, ok] of [['0 ≤ x ≤ 9', true], ['0 ≤ x ≤ 18', false], ['x ≥ 0', false]]) {
    assert.equal(scoreLinearMultipleRepresentations(question, { ...RESPONSES['lmr-pr-2'], contextDomain: domain }).parts.contextDomain, ok, domain);
  }
});

test('two-points and graph sources survive Firestore-safe import (points stored as {x, y})', () => {
  const doc = {
    schemaVersion: 5,
    assignment: { title: 'Stored shape', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Stored shape',
      questions: [
        { kind: 'twoPoints', points: [[-2, -5], [4, -2]] },
        { kind: 'graph', points: [[0, 1], [3, -1]] },
      ].map((source, index) => ({
        questionId: `stored-${index}`,
        standard: 'A.2B',
        alignments: [{ framework: 'teks', code: 'A.2B', role: 'primary' }],
        type: 'representationBridge',
        mode: 'linearMultipleRepresentations',
        studentActions: ['connectLinearRepresentations'],
        prompt: 'Build the other representations.',
        source,
      })),
    }],
  };
  const stored = publish(JSON.stringify(doc));
  assert.deepEqual(stored.model.errors, []);
  const [twoPoints, graph] = stored.questions;
  // The import really did rewrite the coordinate lists…
  assert.deepEqual(stored.model.assignmentV5.sections[0].questions[0].source.points, [{ x: -2, y: -5 }, { x: 4, y: -2 }]);
  // …and the board still reads them.
  assert.equal(deriveLinearMultipleRepresentations(stored.model.assignmentV5.sections[0].questions[0]).slopeNumber, 0.5);
  assert.deepEqual(describeGivenRepresentation(stored.model.assignmentV5.sections[0].questions[0]).points.map((point) => point.latex), ['(-2, -5)', '(4, -2)']);
  assert.deepEqual(describeGivenRepresentation(stored.model.assignmentV5.sections[0].questions[1]).points, [[0, 1], [3, -1]]);
  assert.ok(twoPoints && graph);
});
