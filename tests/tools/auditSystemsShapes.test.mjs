import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cornerlessVerticesRegion,
  runAudit,
  scanBank,
  separatedTwoByTwo,
} from '../../scripts/audit-systems-shapes.mjs';
import { eliminationSeparatedReduction } from '../../functions/shared/toolMath/systemsWorkspace/eliminationReduction.mjs';
import {
  applyEquationMultiplier,
  combineCoefficients,
  eliminatesVariable,
  equationMentionsVariable,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';

/*
 * scripts/audit-systems-shapes.mjs counts two shapes the Systems Workspace
 * cannot finish (docs/handoffs/STUDENT_PASS3_SYSTEMS_TOOLS.md, "Not done").
 * These tests pin each detector on synthetic items that must and must not
 * match, so a broken detector turns them red, and run the real banks once.
 */

const algebraic = (equations, extra = {}) => ({
  id: `alg-${equations.join('|')}`,
  type: 'systemsWorkspace',
  mode: 'algebraic',
  method: 'studentChoice',
  studentActions: ['solveSystem'],
  equations,
  ...extra,
});

const SEPARATED = [
  ['x = 3', 'y = -2'],
  ['2x = 6', '5y = 10'],
  ['y = 4', 'x = -1'],
  ['3 = x', '-y = 7'],
  ['x + y - y = 3', '2y = 8'], // y cancels: the coefficient decides, as eliminationSeparatedReduction reads it
];
const NOT_SEPARATED = [
  ['x - 2y = -3', '3x + 5y = 24'], // ordinary
  ['x = 3', 'x + y = 5'], // substitution works
  ['x = 3', '2x = 6'], // same single variable
  ['x = 3', '0 = 0'], // a row with no variable
  ['y = 2x - 1', 'y = 3'], // one row holds both
];

test('(a) matches a 2×2 whose rows each hold a different single variable', () => {
  for (const equations of SEPARATED) {
    assert.ok(separatedTwoByTwo(algebraic(equations)), equations.join(' , '));
  }
  const named = separatedTwoByTwo(algebraic(['a = 3', '4b = 8'], { variables: ['a', 'b'] }));
  assert.deepEqual(named?.rows.map((row) => row.variable), ['a', 'b']);
  // A V5 intent with no type routes to the algebraic workspace the same way.
  assert.ok(separatedTwoByTwo({ studentActions: ['solveSystem'], equations: ['x = 1', 'y = 2'] }));
});

test('(a) does not match systems the 2×2 workspace can solve, or other modes', () => {
  for (const equations of NOT_SEPARATED) {
    assert.equal(separatedTwoByTwo(algebraic(equations)), null, equations.join(' , '));
  }
  assert.equal(separatedTwoByTwo(algebraic(['x = 1', 'y = 2', 'z = 3'])), null, '3×3 has its own route');
  assert.equal(separatedTwoByTwo({ ...algebraic(['x = 1', 'y = 2']), type: 'multipleChoice', studentActions: [] }), null);
  assert.equal(separatedTwoByTwo({ ...algebraic(['x = 1', 'y = 2']), mode: 'linear', studentActions: ['graphSystem'] }), null);
});

test('(a) agrees with the workspace\'s own separated-rows rule on every fixture', () => {
  // eliminationSeparatedReduction is the 3×3 elimination's test for this exact
  // pair of rows; feed it the fixture as two brought-down rows.
  const separatedByWorkspace = (equations) => {
    const state = {
      variable: 'w',
      rounds: {
        round1: { pair: ['E1'], carried: true, combinedText: equations[0] },
        round2: { pair: ['E2'], carried: true, combinedText: equations[1] },
      },
    };
    return eliminationSeparatedReduction(state, { variables: ['w', 'x', 'y'] }) != null;
  };
  for (const equations of [...SEPARATED, ...NOT_SEPARATED.filter((eqs) => !eqs.includes('0 = 0'))]) {
    assert.equal(Boolean(separatedTwoByTwo(algebraic(equations))), separatedByWorkspace(equations), equations.join(' , '));
  }
});

test('(a) positives really are stuck under the 2×2 rules', () => {
  for (const equations of SEPARATED.slice(0, 4)) {
    const variables = ['x', 'y'];
    // Substitution: whatever the student may isolate, the other row does not hold it.
    for (const [source, other] of [[0, 1], [1, 0]]) {
      for (const name of variables.filter((v) => equationMentionsVariable(equations[source], v))) {
        assert.equal(equationMentionsVariable(equations[other], name), false);
      }
    }
    // Elimination: no nonzero factors cancel either variable.
    for (const m0 of [1, -1, 2, -3, 0.5]) {
      for (const m1 of [1, -1, 2, -3, 0.5]) {
        const a = applyEquationMultiplier(equations[0], m0, variables);
        const b = applyEquationMultiplier(equations[1], m1, variables);
        for (const op of ['add', 'subtract']) {
          const combined = combineCoefficients(a.coefficients, b.coefficients, op);
          assert.equal(eliminatesVariable(combined, 'x', variables) || eliminatesVariable(combined, 'y', variables), false);
        }
      }
    }
    assert.equal(applyEquationMultiplier(equations[0], 0, variables), null, 'a zero factor is refused');
  }
});

const region = (inequalities, extra = {}) => ({
  id: `ineq-${JSON.stringify(inequalities)}`,
  type: 'systemsWorkspace',
  mode: 'inequalities',
  studentBuild: { boundary: true, shading: true },
  reasoning: { vertices: true },
  inequalities,
  ...extra,
});

test('(b) matches a vertices step on a region with no corners', () => {
  const parallel = region([{ m: 2, b: 1, relation: '>=' }, { m: 2, b: -3, relation: '>=' }]);
  const strip = region([{ m: 1, b: 4, relation: '<=' }, { m: 1, b: -2, relation: '>=' }]);
  const single = region([{ m: -1, b: 2, relation: '<' }]);
  const empty = region([{ m: 1, b: 4, relation: '<=' }, { m: 1, b: 6, relation: '>=' }]);
  const verticalStrip = region([{ orientation: 'vertical', x: 1, relation: '>=' }, { orientation: 'vertical', x: 5, relation: '<=' }]);
  for (const question of [parallel, strip, single, empty, verticalStrip]) {
    assert.ok(cornerlessVerticesRegion(question), question.id);
  }
  assert.equal(cornerlessVerticesRegion(strip).classification, 'unbounded');
  assert.equal(cornerlessVerticesRegion(empty).classification, 'empty');
  // askVertices authored directly, as the task reads it.
  assert.ok(cornerlessVerticesRegion({ ...parallel, reasoning: undefined, askVertices: true }));
});

test('(b) does not match a region with corners, or one that never shows the step', () => {
  const triangle = [
    { orientation: 'vertical', x: 0, relation: '>=' },
    { orientation: 'horizontal', y: 0, relation: '>=' },
    { m: -1, b: 4, relation: '<=' },
  ];
  const wedge = [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 2, relation: '>=' }];
  assert.equal(cornerlessVerticesRegion(region(triangle)), null);
  assert.equal(cornerlessVerticesRegion(region(wedge)), null, 'unbounded but one corner');
  const parallel = [{ m: 2, b: 1, relation: '>=' }, { m: 2, b: -3, relation: '>=' }];
  assert.equal(cornerlessVerticesRegion(region(parallel, { reasoning: { vertices: false, classifyRegion: true } })), null, 'no vertices step');
  assert.equal(cornerlessVerticesRegion({ ...region(parallel), studentBuild: undefined, reasoning: undefined }), null, 'classic mode');
  assert.equal(cornerlessVerticesRegion({ ...region(parallel), mode: 'algebraic' }), null);
});

test('scanBank reports matches with item id and file, through generated templates', () => {
  const bank = {
    documents: [
      algebraic(['x = 3', 'y = -2'], { id: 'stuck-2x2' }),
      algebraic(['x + y = 3', 'x - y = 1'], { id: 'fine-2x2' }),
      region([{ m: 2, b: 1, relation: '>=' }, { m: 2, b: -3, relation: '>=' }], { id: 'stuck-region' }),
      {
        ...algebraic(['{{a}}x = {{c}}', '{{b}}y = {{d}}']),
        id: 'stuck-template',
        generator: { parameters: { a: { type: 'int', min: 1, max: 4 }, b: { type: 'int', min: 1, max: 4 }, c: { type: 'int', min: 1, max: 9 }, d: { type: 'int', min: 1, max: 9 } } },
      },
    ],
  };
  const result = scanBank(bank, 'synthetic.json', { draws: 3 });
  assert.equal(result.itemCount, 4);
  assert.deepEqual(result.matches.separated2x2.map((m) => m.id).sort(), ['stuck-2x2', 'stuck-template']);
  assert.deepEqual(result.matches.cornerlessVertices.map((m) => m.id), ['stuck-region']);
  assert.equal(result.matches.separated2x2[0].file, 'synthetic.json');
});

test('the real banks scan without throwing', () => {
  const report = runAudit({ draws: 4 });
  assert.ok(report.banks.length > 0);
  assert.ok(report.banks.some((bank) => bank.file.startsWith('seed/pathQuestionBank/') && bank.itemCount > 0));
  assert.ok(report.banks.some((bank) => bank.file.startsWith('teacher-import-jsons/')));
  // The Day 1 2×2 warm-ups are found and examined, so a zero is a real zero.
  assert.ok(report.examined.separated2x2 >= 3);
  for (const list of Object.values(report.totals)) {
    for (const match of list) assert.ok(match.id && match.file);
  }
});
