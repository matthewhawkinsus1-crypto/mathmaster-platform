// Platform quirks audit: the line-fit steppers read "1.13" and "-0.1" while
// "Your model" printed y = 1.12571428571x − 0.128571428571. The steppers start
// a whole number of steps from the regression line, which is off their display
// grid, so the two disagreed on screen. The model text now uses the steppers'
// precision; the exact values still drive residuals and grading.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const source = readFileSync(new URL('../../src/tools/dataModeling/DataModelingLab.jsx', import.meta.url), 'utf8');

test('the stepper-driven model is shown at the steppers\' precision', () => {
  const display = region(source, 'const steppersDriveModel', 'const visiblePanelCount');
  assert.match(display, /const steppersDriveModel = exploratoryLineFit;/);
  assert.match(display, /Number\(m\)\.toFixed\(decimalsForStep\(fitControls\.slope\.step\)\)/);
  assert.match(display, /Math\.abs\(Number\(b\)\)\.toFixed\(decimalsForStep\(fitControls\.intercept\.step\)\)/);
  assert.match(source, /: <>y = \{shownSlope\}x \{Number\(b\) >= 0 \? '\+' : '−'\} \{shownInterceptMagnitude\}<\/>\}/);
  // The stepper itself formats the same way.
  assert.match(region(source, 'const FitStepper', 'const MODE_TASKS', 'FitStepper'), /const display = Number\(value\)\.toFixed\(decimals\);/);
});
