import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dataModelingFixedPredictionTarget,
  dataModelingRequiredParts,
  lineFitNamesPrediction,
  lineFitUsesRegressionTechnology,
  numberVisiblePanels,
} from '../../src/tools/dataModeling/dataModelingPlan.js';
import { buildCandidateModels, chooseBestModel } from '../../src/tools/dataModeling/dataModelingMath.js';
import { linearRegression } from '../../src/tools/shared/toolMath.js';
import dataModelingGrader from '../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

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
  // Shown, with the authored target locked.
  assert.match(source, /const showPredictionPanel = [^;]*\|\| lineFitPrediction;/);
  assert.match(source, /const fixedPredictionTarget = dataModelingFixedPredictionTarget\(mode, questionData\);/);
  assert.match(source, /readOnly=\{fixedPredictionTarget\}/);
  assert.equal(dataModelingFixedPredictionTarget('lineFit', { predictionX: 7 }), true, 'the authored target is locked');
  assert.equal(dataModelingFixedPredictionTarget('lineFit', {}), false);

  // Graded — the lab's Check marks its work only through the shared grader
  // (the one the server runs), and that grader requires the prediction of a
  // line fit that names one.
  assert.match(region(source, 'const check = () => {', '\n  };', 'Check handler'), /gradeToolCheck\(dataModelingGrader, questionData, work\)/);
  assert.deepEqual(dataModelingRequiredParts('lineFit', { predictionX: 7 }), ['fit', 'prediction']);
  assert.deepEqual(dataModelingRequiredParts('lineFit', {}), ['fit']);
  const points = [[1, 1], [2, 4], [3, 9], [4, 16], [5, 25]];
  const question = { mode: 'lineFit', points, predictionX: 7 };
  const blank = dataModelingGrader.grade(question, { m: 6, b: -7, predictionY: '' });
  assert.deepEqual(blank.parts.map((part) => [part.id, part.isCorrect]), [['fit', true], ['prediction', false]]);
  assert.equal(blank.score, 0.5);

  // Checked against a LINEAR model: for this data a quadratic fits best by RMSE.
  // The line is y = 6x − 7, so at x = 7 it predicts 35; the quadratic, 49.
  const regression = linearRegression(points);
  assert.equal(chooseBestModel(buildCandidateModels(points, regression)).id, 'quadratic');
  assert.equal(dataModelingGrader.grade(question, { m: 6, b: -7, predictionY: '35' }).isCorrect, true);
  assert.equal(dataModelingGrader.grade(question, { m: 6, b: -7, predictionY: '49' }).isCorrect, false);
});


test('semantic fitDataModel enables regression technology inside a line-fit workspace', () => {
  assert.equal(lineFitUsesRegressionTechnology('lineFit', { studentActions: ['analyzeData', 'fitDataModel', 'predictFromModel'] }), true);
  assert.equal(lineFitUsesRegressionTechnology('lineFit', { studentActions: ['analyzeData'] }), false);
  assert.equal(lineFitUsesRegressionTechnology('linearFitPrediction', { studentActions: ['fitDataModel'] }), false);
});

test('line-fit regression result is student-triggered and can populate the active model', () => {
  const source = executableSource(componentSource('src/tools/dataModeling/DataModelingLab.jsx'));
  assert.match(source, /usePersistentToolState\('regressionTechnologyRun', false\)/);
  assert.match(source, />\s*Run linear regression\s*</);
  assert.match(source, /regressionTechnologyRun \? \(/);
  assert.match(source, /data-line-fit-regression-result/);
  assert.match(source, /setM\(round\(regression\.m, 3\)\)/);
  assert.match(source, /setB\(round\(regression\.b, 3\)\)/);
});
