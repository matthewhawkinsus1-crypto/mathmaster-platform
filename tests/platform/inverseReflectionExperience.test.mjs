import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  analysisKeypadProfile,
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
} from '../../functions/shared/pathToolContracts.mjs';

const legacyLiveQuestion = {
  id: 'mm_A2_2B_gen2_inverse-point-graph',
  type: 'functionInvestigation',
  prompt: 'Graph $f(x)=4x-5$ at $x=0$ and $x=3$. Then give the inverse point corresponding to $(3,7)$.',
  functionSpec: { type: 'linear', m: 4, b: -5 },
  graph: { xMin: -10, xMax: 10, yMin: -14, yMax: 14 },
  pointTasks: [
    { id: 'p0', label: 'Plot the point where $x=0$', x: 0, expected: [0, -5] },
    { id: 'px', label: 'Plot the point where $x=3$', x: 3, expected: [3, 7] },
  ],
  analysisRequests: [
    {
      id: 'inverse',
      label: 'Give the corresponding inverse point.',
      kind: 'value',
      responseMode: 'text',
      expected: ['(7,3)'],
    },
  ],
};

test('legacy live inverse-point question upgrades at issue time', () => {
  const payload = buildPublicToolPayload(legacyLiveQuestion);
  assert.equal(payload.serverGradingVersion, 2);
  assert.equal(payload.tool.inverseReflection.enabled, true);
  assert.deepEqual(payload.tool.inverseReflection.sourceTaskIds, ['p0', 'px']);
  assert.match(payload.tool.prompt, /reflect both plotted points/i);
  assert.match(payload.tool.prompt, /draw \$f\^\{-1\}\$/);

  const parts = payload.tool.analysisRequests;
  assert.deepEqual(parts.map((part) => part.kind), ['inversePoint', 'inversePoint', 'value']);
  assert.deepEqual(parts.slice(0, 2).map((part) => part.sourceTaskId), ['p0', 'px']);
  assert.equal(parts[2].notation, 'equation');

  const publicText = JSON.stringify(payload.tool);
  assert.equal(publicText.includes('[-5,0]'), false);
  assert.equal(publicText.includes('[7,3]'), false);
  assert.equal(publicText.includes('(x-(-5))/4'), false);
});

test('secure inverse graph payload carries only the allowlisted table stimulus', () => {
  const payload = buildPublicToolPayload({
    ...legacyLiveQuestion,
    id: 'a2-2b-table-secure-stimulus',
    stimulus: {
      kind: 'table',
      title: 'Values of f',
      note: 'Use the table to plot the original function.',
      table: {
        headers: ['x', 'f(x)'],
        rows: [
          [-1, -9],
          { cells: [0, -5] },
          [3, 7],
        ],
      },
      expected: 'DO-NOT-LEAK',
      answer: 'DO-NOT-LEAK',
      privateSolution: { reflected: [[-9, -1]] },
    },
  });

  assert.deepEqual(payload.tool.stimulus, {
    kind: 'table',
    title: 'Values of f',
    note: 'Use the table to plot the original function.',
    table: {
      headers: ['x', 'f(x)'],
      rows: [
        { cells: ['-1', '-9'] },
        { cells: ['0', '-5'] },
        { cells: ['3', '7'] },
      ],
    },
  });
  const publicText = JSON.stringify(payload.tool);
  assert.equal(publicText.includes('DO-NOT-LEAK'), false);
  assert.equal(publicText.includes('privateSolution'), false);
});

test('secure grader requires both reflected points and inverse equation', () => {
  const privateGrading = buildPrivateToolGrading(legacyLiveQuestion);
  const result = gradePathResponse({
    privateGrading,
    raw: {
      placements: { p0: [0, -5], px: [3, 7] },
      markerPlacements: {},
      selections: {
        'inverse-reflect-p0': [[-5, 0]],
        'inverse-reflect-px': [[7, 3]],
      },
      answers: {
        'inverse-equation': 'f^{-1}(x)=(x+5)/4',
      },
    },
  });

  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts.find((part) => part.id === 'inverse-reflect-p0')?.isCorrect, true);
  assert.equal(result.parts.find((part) => part.id === 'inverse-reflect-px')?.isCorrect, true);
  assert.equal(result.parts.find((part) => part.id === 'inverse-equation')?.isCorrect, true);
});

test('one wrong reflected point is still wrong', () => {
  const privateGrading = buildPrivateToolGrading(legacyLiveQuestion);
  const result = gradePathResponse({
    privateGrading,
    raw: {
      placements: { p0: [0, -5], px: [3, 7] },
      markerPlacements: {},
      selections: {
        'inverse-reflect-p0': [[-5, 0]],
        'inverse-reflect-px': [[3, 7]],
      },
      answers: {
        'inverse-equation': 'f^{-1}(x)=(x+5)/4',
      },
    },
  });
  assert.equal(result.isCorrect, false);
});

test('inverse equation part receives the equation keypad', () => {
  assert.equal(analysisKeypadProfile({ kind: 'value', notation: 'equation' }), 'equation');
});

test('workspace contains the full reflection interaction', () => {
  const source = readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
  assert.match(source, /request\.kind === 'inversePoint'/);
  assert.match(source, /Check Reflected Points/);
  assert.match(source, /PathQuestionStimulus/);
  assert.match(source, /stimulus=\{question\.stimulus\}/);
  assert.match(source, /inverseReflection\?\.inverseLineLabel/);
  assert.doesNotMatch(source, /Draw the inverse line through both points/);
  assert.match(source, />y = x</);
  assert.match(source, /inverseIdealPaths/);
  assert.match(source, /inverseSnapped/);
  assert.match(source, /Clear Inverse Sketch/);
  assert.match(source, /Reset Inverse/);
});

test('canonical Algebra II seed declares inverseReflection across the promoted A2.2B families in both mirrors', () => {
  for (const seedPath of [
    'functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
    'seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
  ]) {
    const parsed = JSON.parse(readFileSync(seedPath, 'utf8'));
    const docs = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    const families = docs.filter((entry) => (
      entry.assessedConstruct === 'A2.2B'
      && entry.type === 'functionInvestigation'
    ));
    assert.equal(families.length, 5, `${seedPath} must retain all five certified A2.2B inverse families`);
    for (const item of families) {
      assert.equal(item.inverseReflection?.enabled, true, item.id);
      assert.equal(item.inverseReflection?.requireInverseSketch, true, item.id);
      assert.equal(item.inverseReflection?.requireInverseEquation, true, item.id);
      assert.match(item.prompt, /reflect/i, item.id);
    }
  }
});
