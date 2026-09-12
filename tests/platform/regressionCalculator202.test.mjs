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
  assert.equal('toolId' in question, false);
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
    regressionRun: { operation: 'linearRegression', table: points, r: stats.r },
    interpretation: { direction: 'positive', strength: 'strong' },
    isCorrect: false,
  });
  assert.equal(full.isCorrect, true, 'server ignores a client verdict and recomputes all four stages');
  assert.deepEqual(full.parts.map((part) => part.id), ['data-entry', 'linear-regression', 'correlation-produced', 'interpretation']);
});

test('changed table snapshot cannot reuse an earlier correct regression run', () => {
  const definition = buildRegressionCalculatorPrivateDefinition({ sourceData: points });
  const stats = regressionCalculatorStats(points);
  const result = gradeRegressionCalculatorResponse(definition, {
    table: points,
    regressionRun: { operation: 'linearRegression', table: [[1, 99], ...points.slice(1)], r: stats.r },
    interpretation: { direction: 'positive', strength: 'strong' },
  });
  assert.equal(result.parts.find((part) => part.id === 'linear-regression').isCorrect, false);
  assert.equal(result.parts.find((part) => part.id === 'correlation-produced').isCorrect, false);
});

test('public contract exposes source data but no server statistic', () => {
  const publicQuestion = sanitizeRegressionCalculatorPublicQuestion({ sourceData: points, r: 0.99, answer: 'strong' });
  assert.deepEqual(Object.keys(publicQuestion), ['prompt', 'sourceData', 'requireInterpretation']);
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
  assert.match(css, /min-height:44px/);
  assert.match(css, /max-width:390px[\s\S]*overflow-x:hidden/);
});
