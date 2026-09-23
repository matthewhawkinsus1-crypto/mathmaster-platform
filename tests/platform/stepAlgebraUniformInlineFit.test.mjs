import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectDistributableGroup } from '../../src/algebraDistributionModel.js';

const core = fs.readFileSync('src/StepByStepAlgebraCore.jsx', 'utf8');
const css = fs.readFileSync('src/StepByStepAlgebra.css', 'utf8');
const systems = fs.readFileSync('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', 'utf8');

test('direct-manipulation expression tools are the default everywhere Step Algebra core is mounted', () => {
  assert.match(core, /inlineExpressionTools = true/);
  assert.match(systems, /function EmbeddedStepAlgebra\([\s\S]*inlineExpressionTools = true/);
});

test('equation sides fit to their visible width instead of requiring horizontal scroll', () => {
  assert.match(core, /function AutoFitEquationExpression/);
  assert.match(core, /content\.scrollWidth/);
  assert.match(core, /viewport\.clientWidth/);
  assert.match(core, /adaptiveBalanceColumns/);
  assert.match(css, /\.algebra-expression-anchor[\s\S]*overflow: hidden;/);
  assert.doesNotMatch(css, /\.algebra-expression-anchor[\s\S]{0,300}overflow-x:\s*auto/);
});

test('distribution mode preserves the same implicit multiplication typography as the normal equation', () => {
  const detected = detectDistributableGroup({
    left: '3*(-3 + 2*y) + 5*y',
    right: '24',
    variable: 'y',
  });
  assert.ok(detected);
  const ordinary = detected.sideTerms.find((term, index) => index !== detected.sideTermIndex);
  assert.ok(ordinary);
  assert.match(ordinary.latex, /5\s*y/);
  assert.doesNotMatch(ordinary.latex, /\\cdot|\\times|·/);
  assert.match(core, /sideTerm\.latex \|\| expressionToLatex\(sideTerm\.text\)/);
});

test('substitution token remains compact and only the live dragged-over variable gets the strong highlight', () => {
  assert.match(systems, /function SubstitutionToken\([\s\S]*label = null/);
  assert.match(systems, /dragOverVariable === part \? ' is-drag-over'/);
  assert.match(systems, /setDragOverVariable\(part\)/);
});
