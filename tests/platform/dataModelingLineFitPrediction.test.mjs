import test from 'node:test';
import assert from 'node:assert/strict';

import { lineFitNamesPrediction, numberVisiblePanels } from '../../src/tools/dataModeling/dataModelingPlan.js';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

// Live QA, Algebra I District DOL #2, Classwork Q6: "use the regression
// calculator to find a linear model and use it to predict the score for 7
// hours of practice" was authored as `mode: 'lineFit'` with `predictionX: 7`.
// The lab showed no prediction field and never graded one.

test('a line fit that names a prediction target asks for the prediction', () => {
  assert.equal(lineFitNamesPrediction('lineFit', { predictionX: 7 }), true);
  assert.equal(lineFitNamesPrediction('lineFit', { predictionX: 0 }), true, 'x = 0 is a target');
  assert.equal(lineFitNamesPrediction('lineFit', {}), false);
  assert.equal(lineFitNamesPrediction('lineFit', { predictionX: '' }), false);
  assert.equal(lineFitNamesPrediction('linearFitPrediction', { predictionX: 7 }), false, 'that mode already asks for it');
});

test('visible panels are numbered in the order a student meets them', () => {
  assert.deepEqual(
    numberVisiblePanels([['model', true], ['association', false], ['residual', true], ['compare', false], ['prediction', true]]),
    { model: 1, residual: 2, prediction: 3 },
  );
});

test('DataModelingLab shows, locks and grades the line-fit prediction', () => {
  const source = executableSource(componentSource('src/tools/dataModeling/DataModelingLab.jsx'));
  assert.match(source, /const lineFitPrediction = lineFitNamesPrediction\(mode, questionData\)/);
  // Graded: the prediction is a required part of a line fit that names one.
  assert.match(source, /mode === 'lineFit' \|\| FIT_ONLY_MODELS\[mode\] \? \(lineFitPrediction \? \['fit', 'prediction'\] : \['fit'\]\)/);
  // Shown, with the authored target locked.
  assert.match(source, /const showPredictionPanel = [^;]*\|\| lineFitPrediction;/);
  assert.match(source, /const fixedPredictionTarget = Boolean\(\(FIT_PREDICTION_MODELS\[mode\] \|\| lineFitPrediction\)/);
  // Checked against a LINEAR model: for this data a quadratic fits best by RMSE.
  assert.match(source, /const expectedPrediction = lineFitPrediction\s*\?\s*regression\.m \* Number\(predictionX\) \+ regression\.b/);
});
