import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeQuestionDifficulty } from '../../src/questionMetadata.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { sequenceEvidenceCount } from '../../src/tools/sequenceExplorer/sequenceMath.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';

test('sequence evidence stops before the requested term unless deliberately revealed', () => {
  assert.equal(sequenceEvidenceCount(7, 7), 6);
  assert.equal(sequenceEvidenceCount(6, 6), 5);
  assert.equal(sequenceEvidenceCount(7, 10), 7);
  assert.equal(sequenceEvidenceCount(7, 7, { revealTarget: true }), 7);
});

test('sequence schema blocks an AI from displaying the requested answer as evidence', () => {
  const result = validateToolQuestion({
    type: 'sequenceExplorer',
    mode: 'analyze',
    sequence: { kind: 'geometric', first: 2, ratio: 3 },
    targetN: 6,
    displayCount: 6,
    alignments: [{ framework: 'teks', code: 'A.12C', role: 'primary' }],
  });
  assert.equal(result.isValid, false);
  assert.match(result.errors.join('\n'), /must not display the requested target term/i);
  assert.equal(result.warnings.length, 0);
});

test('V4 top-level difficultyBand is honored by instructional metadata', () => {
  assert.equal(normalizeQuestionDifficulty({ difficultyBand: 5 }).generatorBand, 5);
  assert.equal(normalizeQuestionDifficulty({ difficultyBand: 1 }).generatorBand, 1);
});

test('closed registry tools have readable solution-review data', () => {
  const sequence = buildToolSolutionReviewModel({
    type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, difference: 4 }, targetN: 8,
  });
  assert.equal(sequence.items.find((item) => item.label === 'a8')?.value, '35');

  const mapping = buildToolSolutionReviewModel({
    type: 'relationMapping', pairs: [{ x: 1, y: 2 }, { x: 1, y: 5 }, { x: 3, y: 4 }],
  });
  assert.equal(mapping.items.find((item) => item.label === 'Function?')?.value, 'No');

  const investigation = buildToolSolutionReviewModel({
    type: 'functionInvestigation2', mode: 'domainRange', function: { type: 'quadratic', a: -1, h: 2, k: 6 },
  });
  assert.equal(investigation.items.find((item) => item.label === 'Domain')?.value, 'all real numbers');
  assert.equal(investigation.items.find((item) => item.label === 'Range')?.value, 'y ≤ 6');
});

test('student tool cards preserve the authored problem and closed tools render solution review', () => {
  const toolShell = fs.readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
  const questionEngine = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(toolShell, /const authoredPrompt = String\(question\?\.prompt/);
  assert.match(toolShell, /promptDiffers \? 'Problem' : 'Your task'/);
  // Standards are owned once by QuestionEngine (or the My Path session header),
  // not repeated again inside every interactive tool card.
  assert.doesNotMatch(toolShell, />Skill focus</);
  assert.doesNotMatch(toolShell, /StandardBadge/);
  assert.match(questionEngine, /<StandardBadge/);
  assert.match(questionEngine, /<ToolSolutionReview question=\{processedQuestion\}/);
});

test('graph matching can enforce discrete versus continuous representation fidelity', async () => {
  const { validateQuestionSemantics } = await import('../../src/platform/contract/semanticValidation.js');
  const broken = validateQuestionSemantics({
    type: 'graphScenarioMatch',
    prompt: 'Match each story to a graph.',
    scenarios: [{ id: 'count', title: 'Count', description: 'Whole items', relationshipType: 'discrete' }],
    graphs: [{ id: 'g', label: 'Graph A', graph: { xMin: 0, xMax: 5, yMin: 0, yMax: 10, functions: [{ type: 'line', m: 2, b: 0 }] } }],
    correctMatches: { count: 'g' },
  });
  assert.match(broken.errors.join('\n'), /point-only discrete graph/i);

  const good = validateQuestionSemantics({
    type: 'graphScenarioMatch',
    prompt: 'Match each story to a graph.',
    scenarios: [{ id: 'count', title: 'Count', description: 'Whole items', relationshipType: 'discrete' }],
    graphs: [{ id: 'g', label: 'Graph A', graph: { xMin: 0, xMax: 5, yMin: 0, yMax: 10, points: [[0,0],[1,2],[2,4]] } }],
    correctMatches: { count: 'g' },
  });
  assert.equal(good.errors.length, 0);
});
