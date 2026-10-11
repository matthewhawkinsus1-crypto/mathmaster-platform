import test from 'node:test';
import assert from 'node:assert/strict';
import Fraction from 'fraction.js';
import {
  buildDataModelingPrivateDefinition,
  gradeDataModelingResponse,
} from '../../functions/shared/pathDataModelingGrading.mjs';

// Independent oracle: the exact least-squares line and quadratic (fraction.js
// normal equations) and their exact sums of squared residuals.
const fr = (v) => new Fraction(String(v));
const solve = (m) => {
  const a = m.map((row) => row.slice());
  const n = a.length;
  for (let col = 0; col < n; col += 1) {
    const pivot = a.findIndex((row, i) => i >= col && !row[col].equals(0));
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = a[r][col].div(a[col][col]);
      a[r] = a[r].map((v, j) => v.sub(f.mul(a[col][j])));
    }
  }
  return a.map((row, i) => row[n].div(row[i]));
};
const exactFits = (points) => {
  const rows = points.map(([x, y]) => [fr(x), fr(y)]);
  const p = (k) => rows.reduce((s, [x]) => s.add(x.pow(k)), fr(0));
  const py = (k) => rows.reduce((s, [x, y]) => s.add(x.pow(k).mul(y)), fr(0));
  const [qa, qb, qc] = solve([
    [p(4), p(3), p(2), py(2)],
    [p(3), p(2), p(1), py(1)],
    [p(2), p(1), p(0), py(0)],
  ]);
  const [lm, lb] = solve([[p(2), p(1), py(1)], [p(1), p(0), py(0)]]);
  const sse = (f) => rows.reduce((s, [x, y]) => s.add(y.sub(f(x)).pow(2)), fr(0));
  return {
    a: qa,
    lineSse: sse((x) => lm.mul(x).add(lb)),
    quadSse: sse((x) => qa.mul(x).mul(x).add(qb.mul(x)).add(qc)),
  };
};

// Integer data on x = 0…4 whose least-squares quadratic has a = 0 exactly
// (2y0 − y1 − 2y2 − y3 + 2y4 = 0) and that is not itself a line.
const zeroCurvatureDatasets = () => {
  const out = [];
  for (let y0 = 0; y0 <= 16; y0 += 4) {
    for (let y1 = 0; y1 <= 24; y1 += 3) {
      for (let y2 = 0; y2 <= 24; y2 += 5) {
        for (let y3 = 0; y3 <= 32; y3 += 4) {
          const twiceY4 = y1 + 2 * y2 + y3 - 2 * y0;
          if (twiceY4 % 2 !== 0) continue;
          const y4 = twiceY4 / 2;
          const ys = [y0, y1, y2, y3, y4];
          const points = ys.map((y, x) => [x, y]);
          if (exactFits(points).lineSse.equals(0)) continue;
          out.push(points);
        }
      }
    }
  }
  return out;
};

const asObjects = (points) => points.map(([x, y]) => ({ x, y }));

test('a Path model-choice question whose best quadratic is the regression line accepts linear and quadratic, whichever the float noise ranks first', () => {
  const datasets = zeroCurvatureDatasets();
  assert.ok(datasets.length > 100, `${datasets.length} zero-curvature datasets`);
  // The verifier's example: the old solver ranked linear first, the new one quadratic.
  datasets.unshift([[0, 14], [1, 22], [2, 22], [3, 30], [4, 34]]);
  const expectedIds = new Set();
  let accepted = 0;
  for (const points of datasets) {
    const exact = exactFits(points);
    assert.ok(exact.a.equals(0) && exact.lineSse.equals(exact.quadSse), JSON.stringify(points));
    for (const mode of ['modelCompare', 'full']) {
      for (const modelMetric of [undefined, 'rmse', 'mae', 'sse']) {
        const definition = buildDataModelingPrivateDefinition({ points: asObjects(points), mode, ...(modelMetric ? { modelMetric } : {}) });
        if (mode === 'modelCompare' && !modelMetric) expectedIds.add(definition.expectedModelId);
        // The line and the a = 0 quadratic are the same function, so they
        // have the same error under every metric: the two choices must get the
        // same verdict. (Under mae another family can beat both.)
        const verdict = (choice) => gradeDataModelingResponse(definition, { modelChoice: choice }).parts.modelChoice;
        const label = `${JSON.stringify(points)} (${mode}, ${modelMetric}); expected ${definition.expectedModelId}`;
        assert.equal(verdict('linear'), verdict('quadratic'), label);
        if (['linear', 'quadratic'].includes(definition.expectedModelId)) {
          accepted += 1;
          assert.equal(verdict('linear'), true, label);
          assert.equal(verdict('exponential'), false, label);
        }
      }
    }
  }
  // Both rankings occur, so the test covers both directions of the tie.
  assert.ok(expectedIds.has('linear') && expectedIds.has('quadratic'), [...expectedIds].join());
  assert.ok(accepted > datasets.length * 4, `${accepted} line-quadratic ties checked`);
});

test('a genuinely curved data set still accepts only the family with the smallest error, and an authored family stays exact', () => {
  const curved = [[0, 1], [1, 2], [2, 5], [3, 10], [4, 17], [5, 26]];
  const exact = exactFits(curved);
  assert.ok(exact.quadSse.compare(exact.lineSse) < 0);
  const compare = buildDataModelingPrivateDefinition({ points: asObjects(curved), mode: 'modelCompare' });
  assert.equal(gradeDataModelingResponse(compare, { modelChoice: 'quadratic' }).isCorrect, true);
  assert.equal(gradeDataModelingResponse(compare, { modelChoice: 'linear' }).isCorrect, false);

  const tie = [[0, 14], [1, 22], [2, 22], [3, 30], [4, 34]];
  for (const expectedModel of ['linear', 'quadratic']) {
    const authored = buildDataModelingPrivateDefinition({ points: asObjects(tie), mode: 'modelCompare', expectedModel });
    const other = expectedModel === 'linear' ? 'quadratic' : 'linear';
    assert.equal(gradeDataModelingResponse(authored, { modelChoice: expectedModel }).isCorrect, true);
    assert.equal(gradeDataModelingResponse(authored, { modelChoice: other }).isCorrect, false);
  }
});
