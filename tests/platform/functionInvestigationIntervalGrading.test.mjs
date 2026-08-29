import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrivateToolGrading,
  gradePathResponse,
  pathAnalysisTextMatches,
} from '../../functions/shared/pathToolContracts.mjs';

const liveCubeRootDomainQuestion = {
  id: 'mm_A2_2A_gen3_cube-root-graph',
  type: 'functionInvestigation',
  prompt: 'Graph the cube-root function, then identify its domain.',
  functionSpec: { type: 'cubeRoot', a: 2, h: 0, k: 3 },
  pointTasks: [
    { id: 'left', x: -8, expected: [-8, -1] },
    { id: 'middle', x: 0, expected: [0, 3] },
    { id: 'right', x: 8, expected: [8, 7] },
  ],
  analysisRequests: [
    {
      id: 'domain',
      label: 'What is the domain?',
      kind: 'domain',
      responseMode: 'text',
      expected: ['all real numbers'],
    },
  ],
};

const correctPlacements = {
  left: [-8, -1],
  middle: [0, 3],
  right: [8, 7],
};

for (const response of [
  '(-\\infty,\\infty)',
  '\\left(-\\infty,\\infty\\right)',
  '(-∞,∞)',
  '(-inf,inf)',
  'all real numbers',
  'ℝ',
  '\\mathbb{R}',
]) {
  test(`secure functionInvestigation accepts all-real domain form: ${response}`, () => {
    const privateGrading = buildPrivateToolGrading(liveCubeRootDomainQuestion);
    const result = gradePathResponse({
      privateGrading,
      raw: {
        placements: correctPlacements,
        markerPlacements: {},
        selections: {},
        answers: { domain: response },
      },
    });

    assert.equal(result.rejected, false);
    assert.equal(result.isCorrect, true);
    assert.equal(result.parts.find((part) => part.id === 'domain')?.isCorrect, true);
  });
}

test('wrong restricted domain is still rejected', () => {
  const privateGrading = buildPrivateToolGrading(liveCubeRootDomainQuestion);
  const result = gradePathResponse({
    privateGrading,
    raw: {
      placements: correctPlacements,
      markerPlacements: {},
      selections: {},
      answers: { domain: '[0,\\infty)' },
    },
  });

  assert.equal(result.isCorrect, false);
  assert.equal(result.parts.find((part) => part.id === 'domain')?.isCorrect, false);
});

test('old issued private definitions without notation are repaired from the domain kind', () => {
  const oldPrivateGrading = {
    pathToolId: 'functionInvestigation',
    definition: {
      points: [
        { id: 'left', expected: [-8, -1] },
        { id: 'middle', expected: [0, 3] },
        { id: 'right', expected: [8, 7] },
      ],
      markers: [],
      analysis: [{
        id: 'domain',
        kind: 'domain',
        renderable: true,
        expected: ['all real numbers'],
        accepted: [],
      }],
      tolerance: 0.28,
    },
  };

  const result = gradePathResponse({
    privateGrading: oldPrivateGrading,
    raw: {
      placements: correctPlacements,
      markerPlacements: {},
      selections: {},
      answers: { domain: '(-\\infty,\\infty)' },
    },
  });

  assert.equal(result.isCorrect, true);
});

test('shared client/server matcher treats interval notation and all-real wording as one set', () => {
  assert.equal(
    pathAnalysisTextMatches(
      '\\left(-\\infty,\\infty\\right)',
      ['all real numbers'],
      { kind: 'domain' },
    ),
    true,
  );

  assert.equal(
    pathAnalysisTextMatches(
      'all real numbers',
      ['(-inf,inf)'],
      { kind: 'domain', notation: 'interval' },
    ),
    true,
  );
});
