import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import {
  buildRegressionCalculatorPrivateDefinition,
  gradeRegressionCalculatorResponse,
  regressionCalculatorStats,
  sanitizeRegressionCalculatorPublicQuestion,
} from '../../functions/shared/pathRegressionCalculatorGrading.mjs';
import { getPathToolContract, isPathEligible } from '../../functions/shared/pathToolContracts.mjs';

const points = [[1, 2], [2, 4], [3, 5], [4, 8]];

test('V5 semantic correlation action compiles to the first-class regression calculator', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Statistics', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [{ prompt: 'Calculate and interpret r.', studentActions: ['calculate correlation'], sourceData: points }] }],
  });
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'regressionCalculator');
  assert.equal(question.requireInterpretation, true);
  assert.deepEqual(question.sourceData, points.map(([x, y]) => ({ x, y })));
  assert.equal(question.sourceMode, 'data');
  assert.equal('toolId' in question, false);
});

test('V5 can infer scatterplot source mode from readGraph plus correlation technology', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Statistics', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [{
      prompt: 'Read the scatterplot and calculate r.',
      studentActions: ['readGraph', 'calculate correlation'],
      sourceData: points,
      graphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 },
    }] }],
  });
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'regressionCalculator');
  assert.equal(question.sourceMode, 'scatterplot');
  assert.deepEqual(question.sourceGraphBounds, { xMin: 0, xMax: 5, yMin: 0, yMax: 9 });
});

test('server requires table and executed LinReg evidence before r can earn full credit', () => {
  const definition = buildRegressionCalculatorPrivateDefinition({ sourceData: points });
  const stats = regressionCalculatorStats(points);
  const typedOnly = gradeRegressionCalculatorResponse(definition, {
    r: stats.r, isCorrect: true, interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(typedOnly.isCorrect, false);
  assert.equal(typedOnly.score, 0.25);

  const full = gradeRegressionCalculatorResponse(definition, {
    table: points,
    regressionRun: { operation: 'linearRegression', table: points, ...stats },
    interpretation: { direction: 'positive', strength: 'strong' },
    isCorrect: false,
  });
  assert.equal(full.isCorrect, true, 'server ignores a client verdict and recomputes all four stages');
  assert.deepEqual(full.parts.map((part) => part.id), ['data-entry', 'linear-regression', 'correlation-produced', 'interpretation']);
});

test('row order is irrelevant and the server validates submitted run statistics by recomputation', () => {
  const definition = buildRegressionCalculatorPrivateDefinition({ sourceData: points });
  const reordered = [...points].reverse();
  const stats = regressionCalculatorStats(reordered);
  const valid = gradeRegressionCalculatorResponse(definition, {
    table: reordered,
    regressionRun: { operation: 'linearRegression', table: reordered, ...stats },
    interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(valid.isCorrect, true);
  const forged = gradeRegressionCalculatorResponse(definition, {
    table: reordered,
    regressionRun: { operation: 'linearRegression', table: reordered, ...stats, r: stats.r - 0.2 },
    interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(forged.parts.find((part) => part.id === 'correlation-produced').isCorrect, false);
});

test('changed table snapshot cannot reuse an earlier correct regression run', () => {
  const definition = buildRegressionCalculatorPrivateDefinition({ sourceData: points });
  const stats = regressionCalculatorStats(points);
  const result = gradeRegressionCalculatorResponse(definition, {
    table: points,
    regressionRun: { operation: 'linearRegression', table: [[1, 99], ...points.slice(1)], ...stats },
    interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(result.parts.find((part) => part.id === 'linear-regression').isCorrect, false);
  assert.equal(result.parts.find((part) => part.id === 'correlation-produced').isCorrect, false);
});

test('public contract exposes only the source presentation needed by the tool and no server statistic', () => {
  const publicQuestion = sanitizeRegressionCalculatorPublicQuestion({ sourceData: points, sourceMode: 'scatterplot', sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 }, r: 0.99, answer: 'strong' });
  assert.deepEqual(Object.keys(publicQuestion), ['prompt', 'sourceData', 'sourceMode', 'sourceGraphBounds', 'requireInterpretation']);
  assert.equal(publicQuestion.sourceMode, 'scatterplot');
  assert.ok(getPathToolContract('regressionCalculator'));
  assert.equal(isPathEligible({ type: 'regressionCalculator', sourceData: points }), true);
});

test('calculator stays inside Work View and publishes touch-safe phone controls', async () => {
  const [registry, inventory, component, css] = await Promise.all([
    readFile(new URL('../../src/tools/toolRegistry.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/tools/workViewInventory.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/tools/regressionCalculator/RegressionCalculator.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/tools/regressionCalculator/RegressionCalculator.css', import.meta.url), 'utf8'),
  ]);
  assert.match(registry, /regressionCalculator: RegressionCalculator/);
  assert.match(registry, /'regressionCalculator'\]\)/);
  assert.match(inventory, /regressionCalculator: \{ status: 'migrated'/);
  assert.match(component, /x₁ \/ y₁ table[\s\S]*Run regression[\s\S]*Interpretation/);
  assert.match(component, /data-regression-source-graph[\s\S]*revealCoordinates=\{false\}[\s\S]*pointHoverEnabled=\{false\}/);
  assert.match(component, /CoordinatePlane[\s\S]*lines=\{run/);
  ['tableEdited', 'regressionSelected', 'regressionExecuted', 'correlationProduced']
    .forEach((event) => assert.match(component, new RegExp(`record\\('${event}'`)));
  assert.match(css, /min-height:44px/);
  assert.match(css, /max-width:390px[\s\S]*overflow-x:hidden/);
});


test('scatterplot source mode awards graph-to-table evidence instead of generic data-entry evidence', () => {
  const definition = buildRegressionCalculatorPrivateDefinition({ sourceData: points, sourceMode: 'scatterplot' });
  const stats = regressionCalculatorStats(points);
  const result = gradeRegressionCalculatorResponse(definition, {
    table: points,
    regressionRun: { operation: 'linearRegression', table: points, ...stats },
    interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts[0].id, 'graph-to-table');
});
