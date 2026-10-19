import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseExactNumberLineValue } from '../../src/tools/intervalNumberLine/intervalMath.js';
import intervalGrader from '../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const src = fs.readFileSync(
  'src/tools/intervalNumberLine/IntervalNumberLine.jsx',
  'utf8',
);

test('number line separates readable major ticks from fine snapping', () => {
  assert.match(src, /const majorStep = useMemo\(\(\) => niceTickStep\(span\)/);
  assert.match(src, /const minorTicks = useMemo/);
  assert.match(src, /snapStep/);
  assert.doesNotMatch(src, /ticks\.map\(\(value\)/);
});

test('students can type an exact endpoint instead of precision clicking', () => {
  assert.match(src, /Exact endpoint, e\.g\. -13\/8/);
  assert.match(src, /Place endpoint/);
  assert.match(src, /parseExactNumberLineValue/);
});

test('exact endpoint entry accepts fractions and roots', () => {
  // The reader moved into the shared interval math so the grader reads typed
  // notation endpoints the same way; assert what it accepts, not its spelling.
  assert.equal(parseExactNumberLineValue('-13/8'), -1.625);
  assert.equal(parseExactNumberLineValue('\\frac{13}{8}'), 1.625);
  assert.equal(parseExactNumberLineValue('-\\dfrac{13}{8}'), -1.625);
  assert.ok(Math.abs(parseExactNumberLineValue('sqrt(5)') - Math.sqrt(5)) < 1e-9);
  assert.equal(parseExactNumberLineValue('\\sqrt{5}'), parseExactNumberLineValue('sqrt(5)'));
  assert.ok(Math.abs(parseExactNumberLineValue('pi') - Math.PI) < 1e-9);
  // Numeric only: function names outside sqrt/pi/e are refused even where the
  // evaluator underneath could compute them (cos(0) is 1 to mathjs).
  assert.equal(parseExactNumberLineValue('cos(0)'), null);
  assert.equal(parseExactNumberLineValue('x+1'), null);
  // And the typed-endpoint control places what that reader returns.
  const placeTyped = region(executableSource(src), 'const placeTypedEndpoint = () =>', 'const addRay', 'typed endpoint placement');
  assert.match(placeTyped, /const parsed = parseExactNumberLineValue\(exactEndpoint\);[\s\S]*placeEndpoint\(parsed\);/);
});

test('plotted endpoints are draggable', () => {
  assert.match(src, /beginDrag/);
  assert.match(src, /updateDraggedValue/);
  assert.match(src, /onPointerMove=\{updateDraggedValue\}/);
});

test('fraction endpoints are displayed as fractions when practical', () => {
  assert.match(src, /rationalLabel/);
  assert.match(src, /maxDenominator = 16/);
});

test('interval notation can be checked with exact fraction endpoints', () => {
  // The notation stage is marked by the tool's shared grader (the server runs
  // the same one), so the promise in the placeholder is asserted against it.
  const question = { intervals: [{ min: -1.625, max: 1.625, minClosed: true, maxClosed: false }], ask: ['interval'] };
  ['[-13/8, 13/8)', '\\left\\lbrack-\\frac{13}{8},\\frac{13}{8}\\right)', '[-1.625, 1.625)'].forEach((notation) => {
    assert.equal(intervalGrader.grade(question, { notation }).isCorrect, true, notation);
  });
  assert.equal(intervalGrader.grade(question, { notation: '[-13/8, 13/8]' }).isCorrect, false);
  assert.match(src, /placeholder="\[-13\/8, 13\/8\)"/);
  // The tool's Check is marked by that grader.
  const code = executableSource(src);
  assert.match(region(code, 'const check = () =>', 'const message = () =>', 'the Check handler'), /gradeToolCheck\(intervalNumberLineGrader, questionData, work\)/);
  assert.match(code, /import intervalNumberLineGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/intervalNumberLine\.mjs'/);
});

test('viewport is chosen for readability rather than exposing every snap tick', () => {
  assert.match(src, /deriveInitialViewport/);
  assert.match(src, /autoViewport === false/);
  assert.match(src, /niceTickStep/);
});


test('graph-only number-line mode does not advertise interval notation', () => {
  assert.match(src, /const asksInterval = ask\.includes\('interval'\)/);
  assert.match(src, /const asksNotation = asksInterval \|\| asksInequality/);
  assert.match(src, /: 'Graph an Inequality'/);
  // Notation only when notation is asked; graph-only work is titled for the
  // graph ("Check your graph", or "Your graph" where the action records the
  // answer — secureRichToolRuntimeWiring pins that branch).
  const title = src.match(/const responsePanelTitle = asksNotation \? 'Write it in notation' : ([^;\n]+);/);
  assert.ok(title, 'the response panel title depends on whether notation is asked');
  assert.doesNotMatch(title[1], /notation|interval/i);
  assert.match(title[1], /'Check your graph'/);
  assert.match(src, /\.\.\.\(asksInterval \? \[/);
  assert.match(src, /hints=\{hints\}/);
});
