import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestionAlignments, validateAlignments } from '../../src/platform/contract/alignments.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateInstructionalScopeV5 } from '../../src/platform/curriculum/instructionalScope.js';

const scopeErrorsFor = (question) => validateInstructionalScopeV5({
  sections: [{ role: 'classwork', questions: [question] }],
}).errors;

// Issue #297 part F: platform-owned repairs so the original assignment
// imports/publishes without hand-editing around platform defects.

test('F1: legacy alignment role "supporting" is canonicalized to "secondary" instead of blocking import', () => {
  const normalized = normalizeQuestionAlignments({
    alignments: [{ framework: 'teks', code: 'A.3B', role: 'supporting' }],
  });
  assert.equal(normalized[0].role, 'secondary');

  const { errors } = validateAlignments({
    alignments: [{ framework: 'teks', code: 'A.3B', role: 'supporting' }],
  });
  assert.deepEqual(errors, []);
});

test('F1: a genuinely invalid role still blocks import (canonicalization is not a general escape hatch)', () => {
  const { errors } = validateAlignments({
    alignments: [{ framework: 'teks', code: 'A.3B', role: 'bogus' }],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /invalid role/);
});

test('F2: a graphing2 question satisfies the "graph shown" visual-fidelity promise without a redundant static graph object', () => {
  const result = validateQuestionSemantics({
    type: 'graphing2',
    mode: 'pointSlope',
    point: [14, 5],
    slope: -0.75,
    prompt: 'Graph the line shown by the point-slope equation below.',
  });
  assert.ok(
    !result.errors.some((message) => /refers to a graph/i.test(message)),
    `unexpected missing-graph error: ${JSON.stringify(result.errors)}`,
  );
});

test('F2: an incomplete graphing2 question (missing the data its mode needs) still gets flagged, so this is not a blanket exemption', () => {
  const result = validateQuestionSemantics({
    type: 'graphing2',
    mode: 'throughPoints',
    givenPoints: [],
    prompt: 'Graph the line shown below.',
  });
  assert.ok(result.errors.some((message) => /refers to a graph/i.test(message)));
});

test('F3: interpretPointInContext with an explicit nonvisual (showGraph: false) contextual interpretation does not require a fake graph', () => {
  const errors = scopeErrorsFor({
    studentActions: ['interpretPointInContext'],
    showGraph: false,
    scenario: 'A tank drains at a constant rate.',
    point: [0, 40],
    quantityChoices: ['The tank starts with 40 gallons.'],
  });
  assert.ok(
    !errors.some((message) => /interpreting a point from a graph requires a displayed graph/i.test(message)),
  );
});

test('F3: interpretPointInContext without the explicit nonvisual opt-in still requires a displayed graph (no weakening of the graph-specific action)', () => {
  const errors = scopeErrorsFor({
    studentActions: ['interpretPointInContext'],
    scenario: 'A tank drains at a constant rate.',
  });
  assert.ok(errors.some((message) => /interpreting a point from a graph requires a displayed graph/i.test(message)));
});

// Mutation guard: prove the F1 assertion can fail for a role that really is invalid.
test('mutation guard: F1 canonicalization only applies to the known legacy alias, not arbitrary strings', () => {
  const { errors } = validateAlignments({ alignments: [{ framework: 'teks', code: 'A.3B', role: 'auxiliary' }] });
  assert.equal(errors.length, 1);
});
