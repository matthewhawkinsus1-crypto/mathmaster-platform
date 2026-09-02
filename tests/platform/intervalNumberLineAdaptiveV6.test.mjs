import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  assert.match(src, /replaceLatexFractions/);
  assert.match(src, /replaceLatexRoots/);
  assert.match(src, /\['sqrt', 'pi', 'e'\]/);
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
  assert.match(src, /parseFlexibleIntervalNotation/);
  assert.match(src, /notationMatchesFlexible/);
  assert.match(src, /placeholder="\[-13\/8, 13\/8\)"/);
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
  assert.match(src, /const responsePanelTitle = asksNotation \? 'Write it in notation' : 'Check your graph'/);
  assert.match(src, /\.\.\.\(asksInterval \? \[/);
  assert.match(src, /hints=\{hints\}/);
});
