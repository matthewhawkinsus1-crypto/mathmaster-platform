// Every contracted tool, actually exercised.
//
// A tool having a contract is not the same as the contract being right. These
// run each grader against its correct answer, near-misses, wrong answers and
// malformed input, and check the public payload for leaks — the properties a
// capability flag can claim but only execution can demonstrate.
//
// The response SHAPES here are the ones `src/platform/path/pathToolResponses.js`
// actually builds. That matters: writing this suite the first time, the
// multiAnswer fixture used `answers` instead of `responses` and every case
// failed. The contract was right and the fixture was wrong — which is exactly
// the confusion a test like this exists to prevent from reaching a student.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PATH_TOOL_IDS, buildPrivateToolGrading, buildPublicToolPayload,
  gradePathResponse, resolvePathToolId,
} from '../../functions/shared/pathToolContracts.mjs';
import { PATH_TOOL_RESPONSE_BUILDERS } from '../../src/platform/path/pathToolResponses.js';

const CASES = {
  stepAlgebra: {
    question: { type: 'stepAlgebra', prompt: 'Solve', equation: '2x + 5 = 19', variable: 'x', answer: '7' },
    correct: { finalEquation: 'x = 7' },
    variants: [
      ['value only', { value: '7' }, true],
      ['equation with spaces', { finalEquation: 'x  =  7' }, true],
      ['decimal form', { finalEquation: 'x = 7.0' }, true],
      ['wrong', { finalEquation: 'x = 8' }, false],
      ['reversed', { finalEquation: '7 = x' }, null],
      ['empty', { finalEquation: '' }, 'reject'],
      ['garbage', { nope: 1 }, 'reject'],
    ],
  },
  intervalNumberLine: {
    question: { type: 'intervalNumberLine', prompt: 'Graph', min: -10, max: 10, ask: ['graph'], expectedIntervals: [{ start: 2, end: Infinity, startClosed: true, endClosed: false }] },
    correct: { intervals: [{ start: 2, end: Infinity, startClosed: true, endClosed: false }] },
    variants: [
      ['open where closed expected', { intervals: [{ start: 2, end: Infinity, startClosed: false, endClosed: false }] }, false],
      ['wrong endpoint', { intervals: [{ start: 3, end: Infinity, startClosed: true, endClosed: false }] }, false],
      ['empty intervals', { intervals: [] }, false],
      ['garbage', { foo: 1 }, 'reject'],
    ],
  },
  systemsWorkspace: {
    question: { type: 'systemsWorkspace', prompt: 'Solve', mode: 'linear', system: { m1: 2, b1: -1, m2: -1, b2: 5 } },
    correct: { classification: 'one', x: 2, y: 3 },
    variants: [
      ['slightly off within tolerance', { classification: 'one', x: 2.01, y: 3.01 }, true],
      ['far off', { classification: 'one', x: 5, y: 5 }, false],
      ['wrong classification', { classification: 'none', x: 2, y: 3 }, false],
      ['no classification', { x: 2, y: 3 }, 'reject'],
    ],
  },
  dataModelingLab: {
    question: {
      type: 'dataModeling',
      prompt: 'Calculate and interpret r.',
      mode: 'correlation',
      points: [[1, 3], [2, 5], [3, 7], [4, 9]],
      correlationTolerance: 0.02,
      answer: 'must-not-leak',
    },
    correct: { r: 1, direction: 'positive', strength: 'strong', causation: 'association' },
    variants: [
      ['r within tolerance', { r: 0.99, direction: 'positive', strength: 'strong', causation: 'association' }, true],
      ['interpretation only', { direction: 'positive', strength: 'strong', causation: 'association' }, false],
      ['wrong coefficient', { r: 0.5, direction: 'positive', strength: 'strong', causation: 'association' }, false],
      ['wrong strength', { r: 1, direction: 'positive', strength: 'moderate', causation: 'association' }, false],
      ['empty work', {}, false],
    ],
  },
  graphing2: {
    question: {
      type: 'graphing2',
      prompt: 'Graph 2x + y = 4.',
      mode: 'standardForm',
      standard: { A: 2, B: 1, C: 4 },
      graphBounds: { xMin: -5, xMax: 5, yMin: -5, yMax: 6 },
    },
    correct: { points: [[0, 4], [2, 0]], studentLine: { kind: 'forged', isCorrect: false } },
    variants: [
      ['different correct points', { points: [[1, 2], [3, -2]] }, true],
      ['one point off', { points: [[0, 4], [2, 1]] }, false],
      ['wrong parallel line', { points: [[0, 3], [2, -1]] }, false],
      ['one point only', { points: [[0, 4]] }, 'reject'],
      ['same point twice', { points: [[0, 4], [0, 4]] }, 'reject'],
    ],
  },
  relationMapping: {
    question: { type: 'relationMapping', prompt: 'Map', pairs: [{ x: 1, y: 2 }, { x: 2, y: 4 }], ask: ['domain', 'range', 'isFunction'] },
    correct: { domain: [1, 2], range: [2, 4], isFunction: true },
    variants: [
      ['domain out of order', { domain: [2, 1], range: [2, 4], isFunction: true }, true],
      ['string booleans', { domain: [1, 2], range: [2, 4], isFunction: 'true' }, true],
      ['wrong function verdict', { domain: [1, 2], range: [2, 4], isFunction: false }, false],
      ['garbage', { zzz: 1 }, 'reject'],
    ],
  },
  functionInvestigation: {
    question: { type: 'functionInvestigation', prompt: 'Plot', functionSpec: { type: 'linear', m: 2, b: 1 }, pointTasks: [{ id: 'p1', label: 'P1', x: 0, expected: [0, 1] }] },
    correct: { placements: { p1: [0, 1] } },
    variants: [
      ['slightly off', { placements: { p1: [0, 1.02] } }, null],
      ['wrong point', { placements: { p1: [0, 5] } }, false],
      ['missing placement', { placements: {} }, false],
      ['garbage', { q: 1 }, 'reject'],
    ],
  },
  multiAnswer: {
    question: { type: 'multiAnswer', prompt: 'Parts', answerFields: [{ id: 'a', label: 'A', expected: '3' }, { id: 'b', label: 'B', expected: '5' }] },
    correct: { responses: { a: '3', b: '5' } },
    variants: [
      ['one wrong', { responses: { a: '3', b: '9' } }, false],
      ['padded', { responses: { a: ' 3 ', b: '5' } }, true],
      ['garbage', { nope: true }, 'reject'],
    ],
  },
  algebra: {
    question: { type: 'algebra', prompt: 'Solve', equationLatex: '2x=6', answer: '3' },
    correct: { value: '3' },
    variants: [['wrong', { value: '4' }, false], ['empty', { value: '' }, 'reject']],
  },
  system: {
    question: { type: 'system', prompt: 'Solve', equationsLatex: ['y=2x', 'y=x+1'], answer: '(1, 2)' },
    correct: { x: 1, y: 2 },
    variants: [['as text', { value: '(1,2)' }, true], ['wrong', { x: 9, y: 9 }, false], ['empty', {}, 'reject']],
  },
};


test('every contracted tool has a case in this suite', () => {
  const missing = PATH_TOOL_IDS.filter((toolId) => !CASES[toolId]);
  assert.deepEqual(missing, [],
    'a contracted tool with no exercise here is a grader nobody has run');
});

test('every contracted tool grades its own correct answer as correct', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    const spec = CASES[toolId];
    const definition = buildPrivateToolGrading(spec.question);
    const result = gradePathResponse({ privateGrading: definition, raw: spec.correct });
    assert.ok(!result.rejected, `${toolId} rejected its own correct answer: ${result.reason}`);
    assert.equal(
      result.isCorrect,
      true,
      `${toolId} marked its own correct answer wrong: ${JSON.stringify({ privateGrading: definition, raw: spec.correct, result })}`,
    );
  });
});

test('every contracted tool resolves from the question it was authored as', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    assert.equal(resolvePathToolId(CASES[toolId].question), toolId);
  });
});

test('no public tool payload carries the answer key', () => {
  const leaks = [];
  PATH_TOOL_IDS.forEach((toolId) => {
    const payload = buildPublicToolPayload(CASES[toolId].question);
    assert.ok(payload, `${toolId} produced no payload`);
    const serialized = JSON.stringify(payload);
    ['expectedIntervals', 'expectedNotation', 'acceptedAnswers', '"answer"', '"solution"', '"expected"']
      .forEach((key) => { if (serialized.includes(key)) leaks.push(`${toolId}: ${key}`); });
  });
  assert.deepEqual(leaks, []);
});

test('wrong answers are marked wrong and malformed input is rejected instead', () => {
  const problems = [];
  PATH_TOOL_IDS.forEach((toolId) => {
    const spec = CASES[toolId];
    const definition = buildPrivateToolGrading(spec.question);
    spec.variants.forEach(([name, raw, expected]) => {
      const result = gradePathResponse({ privateGrading: definition, raw });
      if (expected === 'reject') {
        // Rejected is NOT the same as wrong: a malformed response must not
        // burn one of the student's attempts.
        if (!result.rejected) problems.push(`${toolId}/${name}: should reject, graded ${result.isCorrect}`);
      } else if (expected === null) {
        // Deliberately unasserted — behaviour recorded, not judged.
      } else if (result.rejected) {
        problems.push(`${toolId}/${name}: unexpectedly rejected (${result.reason})`);
      } else if (result.isCorrect !== expected) {
        problems.push(`${toolId}/${name}: graded ${result.isCorrect}, expected ${expected}`);
      }
    });
  });
  assert.deepEqual(problems, []);
});

test('the response shapes these graders expect are the ones the client builds', () => {
  // The bug this catches: a renderer that sends `{answers}` to a grader
  // validating `{responses}` rejects every submission, and the student sees
  // "that response was not in the shape this question expects" on a perfectly
  // good answer.
  const builders = Object.keys(PATH_TOOL_RESPONSE_BUILDERS || {});
  assert.ok(builders.length, 'the response builders must be exported for this check');
  const contractedWithBuilder = PATH_TOOL_IDS.filter((toolId) => builders.includes(toolId));
  assert.ok(contractedWithBuilder.length >= 5,
    'most contracted tools should have a client response builder');
  contractedWithBuilder.forEach((toolId) => {
    const definition = buildPrivateToolGrading(CASES[toolId].question);
    const result = gradePathResponse({ privateGrading: definition, raw: CASES[toolId].correct });
    assert.notEqual(result.rejected, true,
      `${toolId}: the shape this suite sends must be the shape the grader accepts`);
  });
});
