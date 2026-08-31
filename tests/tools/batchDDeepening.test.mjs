import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  evaluateTransformedFunction,
  mapParentPoint,
  mappedPointIsCorrect,
  transformationDescriptor,
  transformationParameterScore,
  transformedAnchor,
  unmapTransformedPoint,
} from '../../src/tools/transformations/transformationsMath.js';
import {
  buildDefaultRepresentationSets,
  findTableMismatchIndexes,
  mismatchedRepresentationKinds,
  scoreRepresentationMatch,
  tableRowsForFunction,
} from '../../src/tools/representationMatch/representationMath.js';
import {
  behaviorForSpec,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  numericSetsMatch,
  parseNumericList,
} from '../../src/tools/functionInvestigation2/functionInvestigationMath.js';
import {
  constructionEvidence,
  lineFromPoints,
  lineFromStandard,
  linesEquivalent,
  pointOnLine,
  targetLineFromQuestion,
} from '../../src/tools/graphing2/graphingMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

test('transformation engine evaluates a/h/k form and maps parent points both directions', () => {
  const spec = { type: 'quadratic', a: -2, h: 1, k: 3 };
  assert.equal(evaluateTransformedFunction(spec, 2), 1);
  assert.deepEqual(mapParentPoint([2, 4], spec), [3, -5]);
  assert.deepEqual(unmapTransformedPoint([3, -5], spec), [2, 4]);
  assert.equal(mappedPointIsCorrect([3, -5], [2, 4], spec), true);
});

test('transformation descriptors distinguish reflection, scale, and translation directions', () => {
  assert.deepEqual(transformationDescriptor({ type: 'squareRoot', a: -0.5, h: 3, k: 2 }), {
    reflection: true,
    verticalScale: 0.5,
    verticalScaleKind: 'compression',
    horizontalReflection: false,
    horizontalScale: 1,
    horizontalScaleKind: 'unchanged',
    horizontalDirection: 'right',
    horizontalDistance: 3,
    verticalDirection: 'up',
    verticalDistance: 2,
  });
  const score = transformationParameterScore({ a: -2, h: 1, k: 0 }, { a: -2, h: 1, k: 3 });
  assert.equal(score.isCorrect, false);
  // Horizontal scale/reflection is now an independent transformation axis,
  // so this response gets three of the four parameter groups correct.
  assert.equal(score.score, 3 / 4);
});

test('transformation anchors are family-specific and preserve rational structural center semantics', () => {
  assert.deepEqual(transformedAnchor({ type: 'exponential', a: 2, h: 1, k: -3, base: 2 }).point, [1, -1]);
  assert.deepEqual(transformedAnchor({ type: 'logarithmic', a: 3, h: 2, k: 1, base: 2 }).point, [3, 1]);
  const rational = transformedAnchor({ type: 'rational', a: 3, h: -1, k: 2 });
  assert.deepEqual(rational.point, [-1, 2]);
  assert.equal(rational.isOnGraph, false);
});

test('representation scoring links all selected forms to the same relationship id', () => {
  assert.equal(buildDefaultRepresentationSets().length, 3);
  assert.deepEqual(scoreRepresentationMatch('linear', { equation: 'linear', table: 'linear', context: 'quadratic' }).checks, [true, true, false]);
  assert.deepEqual(mismatchedRepresentationKinds('linear', { equationId: 'linear', tableId: 'quadratic', contextId: 'linear' }), ['table']);
});

test('representation table engine generates valid rows and locates a corrupted row', () => {
  const spec = { type: 'linear', a: 2, h: 0, k: 1 };
  assert.deepEqual(tableRowsForFunction(spec, [-1, 0, 1]), [[-1, -1], [0, 1], [1, 3]]);
  assert.deepEqual(findTableMismatchIndexes(spec, [[-1, -1], [0, 1], [1, 4], [2, 5]]), [2]);
});

test('function investigation derives defining features and domain/range from family structure', () => {
  const rational = investigationFeatures({ type: 'rational', a: 2, h: 1, k: -2 });
  assert.equal(rational.anchor.label, 'asymptote intersection');
  assert.equal(rational.anchor.isOnGraph, false);
  assert.deepEqual(rational.verticalAsymptotes, [1]);
  assert.deepEqual(rational.horizontalAsymptotes, [-2]);
  assert.deepEqual(domainRangeForSpec({ type: 'squareRoot', a: -2, h: 3, k: 1 }), { domainCode: 'xGteH', rangeCode: 'yLteK' });
  assert.deepEqual(domainRangeForSpec({ type: 'exponential', a: 2, h: 0, k: -1, base: 2 }), { domainCode: 'allReal', rangeCode: 'yGtK' });
});

test('function investigation computes intercept sets without assuming a fixed graph-point position', () => {
  const quadratic = interceptsForSpec({ type: 'quadratic', a: 1, h: 1, k: -4 });
  assert.deepEqual(quadratic.x, [-1, 3]);
  assert.equal(quadratic.y, -3);
  const rational = interceptsForSpec({ type: 'rational', a: 2, h: 1, k: -2 });
  assert.deepEqual(rational.x, [2]);
  assert.equal(rational.y, -4);
  assert.deepEqual(parseNumericList('3, -1'), [-1, 3]);
  assert.equal(numericSetsMatch(parseNumericList('3 -1'), quadratic.x), true);
});

test('function behavior and same-input comparison respect family parameters', () => {
  assert.equal(behaviorForSpec({ type: 'exponential', a: 2, h: 0, k: 0, base: 0.5 }), 'decreasing');
  assert.equal(behaviorForSpec({ type: 'rational', a: -2, h: 0, k: 0 }), 'increasingBranches');
  assert.deepEqual(compareFunctionValues({ type: 'linear', a: 2, h: 0, k: 1 }, { type: 'quadratic', a: 1, h: 0, k: 0 }, 3), { relation: 'right', leftValue: 7, rightValue: 9 });
});

test('graphing engine derives ordinary and vertical lines from two plotted points', () => {
  assert.deepEqual(lineFromPoints([-2, -1], [2, 3]), { kind: 'slopeIntercept', m: 1, b: 1 });
  assert.deepEqual(lineFromPoints([3, -2], [3, 4]), { kind: 'vertical', x: 3 });
  assert.equal(pointOnLine({ kind: 'vertical', x: 3 }, [3, 10]), true);
});

test('graphing target engine supports slope-intercept, point-slope, standard, and vertical/horizontal forms', () => {
  assert.deepEqual(lineFromStandard({ A: 2, B: 1, C: 4 }), { kind: 'slopeIntercept', m: -2, b: 4 });
  assert.deepEqual(targetLineFromQuestion({ mode: 'pointSlope', point: [-1, 2], slope: -2 }), { kind: 'slopeIntercept', m: -2, b: 0 });
  assert.deepEqual(targetLineFromQuestion({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 }), { kind: 'vertical', x: 3 });
  assert.equal(linesEquivalent({ kind: 'slopeIntercept', m: 1, b: 1 }, lineFromPoints([0, 1], [2, 3])), true);
});

test('graph construction evidence awards full credit only when the two-point construction defines the target', () => {
  const target = { kind: 'slopeIntercept', m: 1.5, b: -2 };
  const correct = constructionEvidence([[0, -2], [2, 1]], target);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);
  const partial = constructionEvidence([[0, -2], [2, 2]], target);
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, 0.5);
});

test('all 19 Batch D deep-dive configurations pass hard validation', () => {
  const sample = JSON.parse(fs.readFileSync(new URL('../../SAMPLE_BATCH_D_DEEP_DIVE.json', import.meta.url), 'utf8'));
  assert.equal(sample.questions.length, 19);
  sample.questions.forEach((question) => {
    const result = validateToolQuestion(question);
    assert.equal(result.isValid, true, question.toolId + '/' + question.mode + ': ' + result.errors.join('; '));
  });
});

test('Batch D schemas reject degenerate functions, ambiguous representation audits, and invalid line tasks', () => {
  const invalid = [
    { toolId: 'transformationsLab', mode: 'identify', family: 'quadratic', function: { type: 'quadratic', a: 0, h: 0, k: 0 } },
    { toolId: 'transformationsLab', mode: 'pointMap', family: 'exponential', function: { type: 'exponential', a: 1, h: 0, k: 0, base: 1 }, parentPoint: [0, 1] },
    { toolId: 'representationMatch', mode: 'findMismatch', targetId: 'linear', mixedSet: { equationId: 'quadratic', tableId: 'quadratic', contextId: 'linear' } },
    { toolId: 'representationMatch', mode: 'tableAudit', function: { type: 'linear', a: 1, h: 0, k: 0 }, rows: [[0, 0], [1, 1]] },
    { toolId: 'functionInvestigation2', mode: 'features', function: { type: 'logarithmic', a: 1, h: 0, k: 0, base: 1 } },
    { toolId: 'functionInvestigation2', mode: 'compare', left: { type: 'linear', a: 1, h: 0, k: 0 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 } },
    { toolId: 'graphing2', mode: 'throughPoints', givenPoints: [[1, 1], [1, 1]] },
    { toolId: 'graphing2', mode: 'standardForm', standard: { A: 0, B: 0, C: 2 } },
  ];
  invalid.forEach((question) => assert.equal(validateToolQuestion({ ...question, masteryEvidenceKeys: ['batch-d:reject'] }).isValid, false));
});
