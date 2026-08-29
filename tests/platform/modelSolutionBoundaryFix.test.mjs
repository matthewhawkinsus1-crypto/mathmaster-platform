import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gradeStage } from '../../src/platform/workflow/workflowGrading.js';
import { canonicalizeFunctionExpression, parseIntervalDomainRestriction } from '../../src/platform/workflow/modelExpression.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => fs.readFileSync(resolve(here, '../..', path), 'utf8');

test('function-model grading ignores arbitrary function and input-variable names', () => {
  const stage = { id: 'equation', kind: 'equationInput', prompt: 'Write a function that models the situation.' };
  const mark = (response) => gradeStage({ stage, rule: 'W(t)=18t', responses: { equation: response } });
  assert.equal(mark('f(x)=18x').isCorrect, true);
  assert.equal(mark('g(n)=18n').isCorrect, true);
  assert.equal(mark('y=18x').isCorrect, true);
  assert.equal(mark('f(x)=19x').isCorrect, false);
});

test('canonical model expression renames only the declared input symbol', () => {
  assert.equal(canonicalizeFunctionExpression('W(t)=18t'), canonicalizeFunctionExpression('f(x)=18x'));
  assert.notEqual(canonicalizeFunctionExpression('W(t)=18t+3'), canonicalizeFunctionExpression('f(x)=18x'));
});

test('finite domain notation becomes explicit open/closed graph boundaries', () => {
  assert.deepEqual(parseIntervalDomainRestriction('[0,12]'), { min: 0, max: 12, minInclusive: true, maxInclusive: true });
  assert.deepEqual(parseIntervalDomainRestriction('[0,12)'), { min: 0, max: 12, minInclusive: true, maxInclusive: false });
  assert.deepEqual(parseIntervalDomainRestriction('0<=t<12'), { min: 0, max: 12, minInclusive: true, maxInclusive: false });
  assert.equal(parseIntervalDomainRestriction('(-∞,12]'), null, 'unbounded continuation must not be misread as a finite boundary');
});

test('workflow graph uses the authored finite domain to require boundary markers', () => {
  const source = read('src/platform/workflow/WorkflowRunner.jsx');
  assert.match(source, /parseIntervalDomainRestriction\(grading\?\.domain\)/);
  assert.match(source, /domain: stage\.domainRestriction \|\| null/);
  assert.match(source, /requireEndpointMarkers: pointOnly \? false : \(stage\.requireEndpointMarkers \?\? Boolean\(stage\.domainRestriction\)\)/);
});

test('closed multi-stage questions receive a complete workflow solution review', () => {
  const solution = read('src/SolutionReview.jsx');
  const engine = read('src/QuestionEngine.jsx');
  assert.match(solution, /buildWorkflowSolution/);
  assert.match(solution, /Equivalent function names and input-variable letters are accepted/);
  assert.match(solution, /REVIEW THIS STEP/);
  assert.match(solution, /Step \$\{index \+ 1\}/);
  assert.match(engine, /incorrectParts=\{feedback\?\.incorrectParts \|\| \[\]\}/);
});

test('restricted graphs use boundary language rather than end-behavior language', () => {
  const source = read('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /Boundary Markers/);
  assert.match(source, /finite domain/);
  assert.match(source, /boundaryOnly \? \['open', 'closed'\]/);
  assert.match(source, /Show exactly where the relationship stops/);
});
