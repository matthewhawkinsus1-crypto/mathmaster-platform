// GRAPHS SPEAK (WCAG 2.1 1.1.1): a read-only coordinate plane used to be
// announced as "Coordinate plane" and nothing more, so a screen-reader student
// could not tell two graphs apart. The plane now describes itself from its
// data — and the description must never say more than the screen shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeCoordinatePlane, readValue } from '../../src/platform/language/graphDescription.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

// Words and shapes that would hand the student the rule instead of the picture.
const EQUATION_TALK = /slope|y\s*=|f\s*\(\s*x\s*\)|rate of change|equation|m\s*=|intercept form|\bb\s*=/i;
// The full, grid-readable reading — only for a closed question or a screen that
// asks nothing — on a plane that draws its snap-step minor grid.
const full = (options) => describeCoordinatePlane({ detail: 'features', minorGridDrawn: true, ...options });

const allText = (result) => [
  result.summary,
  ...result.tables.flatMap((table) => [table.caption, ...table.columns, ...table.rows.flat()]),
].join(' \n ');

test('two different line graphs announce differently, and each reads visually', () => {
  const a = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 2, b: 2 }] });
  const b = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: -1, b: 3 }] });
  assert.notEqual(a.description, b.description);
  assert.match(a.description, /x from −6 to 6, y from −6 to 6\./);
  assert.match(a.description, /Line 1 rises from left to right, crosses the y-axis at 2, crosses the x-axis at −1, and passes through \(0, 2\) and \(1, 4\)\./);
  assert.match(b.description, /Line 1 falls from left to right, crosses the y-axis at 3, crosses the x-axis at 3/);
});

test('no equation, slope or rule is ever spoken, for any kind of object', () => {
  const result = full({
    xMin: -6, xMax: 6, yMin: -6, yMax: 10,
    lines: [{ m: 0.5, b: -1, label: 'y = 0.5x - 1' }, { m: 0, b: 3 }],
    functions: [(x) => x * x - 4, (x) => 2 ** x],
    verticalLines: [3], horizontalLines: [-2],
    points: [{ x: 1, y: 1, label: 'A' }],
  });
  assert.doesNotMatch(allText(result), EQUATION_TALK);
  assert.match(result.description, /Line 2 is horizontal, crosses the y-axis at 3/);
});

test('off-grid values are "between" the drawn gridlines around them; on-grid values are exact', () => {
  assert.deepEqual(readValue(3, 1), { text: '3', exact: true, value: 3 });
  assert.equal(readValue(2.3, 1).text, 'between 2 and 3');
  assert.equal(readValue(2.3, 1).exact, false);
  assert.equal(readValue(-1.1, 1).text, 'between −2 and −1');
  assert.equal(readValue(0.5, 0.5).exact, true, 'a half-step question reads halves exactly');

  const result = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, points: [{ x: 2.3, y: -1 }, { x: 3, y: -2 }] });
  assert.match(result.description, /2 points: \(x between 2 and 3, y −1\); \(3, −2\)\./);
  // The table reads the same way: never more precise than the grid.
  assert.deepEqual(result.tables[0].rows[0], ['Point 1', 'between 2 and 3', '−1']);
  assert.doesNotMatch(allText(result), /2\.3/);
});

test('a line through no grid point still never states a computed value exactly', () => {
  const result = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 1 / 3, b: 0.4 }] });
  assert.match(result.description, /crosses the y-axis between 0 and 1/);
  assert.match(result.description, /crosses the x-axis between −2 and −1/);
  assert.doesNotMatch(allText(result), /0\.4|0\.33|−1\.2/);
});

test('labels are spoken only where the plane draws them: plain dots, never markers or lines', () => {
  const result = full({
    points: [
      { x: 3, y: -2, label: 'A' },
      { coordinates: [1, 1], marker: 'open', label: 'SECRET1' },
      { x: 2, y: 2, marker: 'arrow', vector: [0, 1], label: 'SECRET2' },
    ],
    lines: [{ m: 1, b: 0, label: 'SECRET3' }],
  });
  assert.match(result.description, /A at \(3, −2\)/);
  assert.match(result.description, /\(1, 1\), open dot/);
  assert.match(result.description, /arrowhead at \(2, 2\) pointing up/);
  assert.doesNotMatch(allText(result), /SECRET/);
  assert.deepEqual(result.tables[0].columns, ['Point', 'x', 'y']);
  assert.deepEqual(result.tables[0].rows[0], ['A', '3', '−2']);
});

test('dashed reference lines are read by where they cross an axis', () => {
  const result = full({ verticalLines: [3], horizontalLines: [-2] });
  assert.match(result.description, /Dashed vertical line through 3 on the x-axis\./);
  assert.match(result.description, /Dashed horizontal line through −2 on the y-axis\./);
});

test('shaded regions and connected paths list their corners', () => {
  const result = full({
    regions: [[[0, 0], [4, 0], [0, 4]]],
    polylines: [{ points: [{ x: -5, y: -5 }, { x: -2, y: 1 }] }],
  });
  assert.match(result.description, /Shaded region 1 with corners at \(0, 0\), \(4, 0\), and \(0, 4\)\./);
  assert.match(result.description, /Connected path 1 through \(−5, −5\) and \(−2, 1\)\./);
  const shapes = result.tables.find((table) => table.columns[0] === 'Shape');
  assert.equal(shapes.rows.length, 5);
});

test('a curve with a turning point names it, its axis crossings and where it leaves the window', () => {
  const result = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 10, functions: [(x) => x * x - 4] });
  assert.match(
    result.description,
    /Curve 1 comes in through the top edge at \(x between −4 and −3, y 10\), crosses the x-axis at −2, has a low point at \(0, −4\), crosses the x-axis at 2, and leaves through the top edge at \(x between 3 and 4, y 10\)\./,
  );
  const high = full({ functions: [(x) => -((x - 1) ** 2) + 3] });
  assert.match(high.description, /has a high point at \(1, 3\)/);
  // A curve that only touches the axis on a gridline says so.
  const touch = full({ functions: [(x) => (x - 2) ** 2] });
  assert.match(touch.description, /touches the x-axis at 2/);
  // Two curves are told apart by how they are drawn.
  const two = full({ functions: [(x) => x, (x) => -x] });
  assert.match(two.description, /Curve 1 \(solid\).*Curve 2 \(dashed\)/);
});

test('the line/curve table reads y at each labelled x, as the grid would', () => {
  const result = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 2, b: 2 }], functions: [(x) => Math.sqrt(x)] });
  const table = result.tables.find((t) => t.columns[0] === 'x');
  assert.deepEqual(table.columns, ['x', 'Line 1', 'Curve 1']);
  const row = (x) => table.rows.find((r) => r[0] === x);
  assert.deepEqual(row('0'), ['0', '2', '0']);
  assert.deepEqual(row('2'), ['2', '6', 'between 1 and 2']);
  assert.deepEqual(row('4'), ['4', 'off the graph', '2']);
  assert.deepEqual(row('−2'), ['−2', '−2', 'not drawn']);
});

test('tool-drawn marks are admitted, not hidden; an empty plane says so', () => {
  assert.match(full({}).description, /Nothing is plotted\./);
  const marked = full({ hasUndescribedMarks: true });
  assert.match(marked.description, /marks drawn by the activity that are not listed here/);
  assert.doesNotMatch(marked.description, /Nothing is plotted/);
});

// PR #454 review B2 (assessment safety, coordinator's call for the owner):
// while a question can be answered, the description names no feature value —
// District DOL #2 q04 "What is the y-intercept value?" was answered aloud
// ("crosses the y-axis at −4") in 65 of 65 renderings.
test('by default (still answerable) a description says what is drawn, never where', () => {
  const dol = describeCoordinatePlane({
    xMin: -6, xMax: 6, yMin: -6, yMax: 6, xTickStep: 2, yTickStep: 2,
    lines: [{ m: 1, b: -4 }], functions: [(x) => -((x - 2) ** 2) + 9], verticalLines: [3],
    points: [{ x: 3, y: -2, label: 'A' }, { x: 5, y: 1, marker: 'open' }],
    polylines: [[[0, 0], [2, 3]]], regions: [[[0, 0], [4, 0], [0, 4]]],
  });
  assert.equal(dol.detail, 'kinds');
  assert.match(dol.description, /^x from −6 to 6, y from −6 to 6\. 1 line\. 1 curve\. 1 dashed vertical line\. 1 connected path\. 1 shaded region\. 1 point labelled A and 1 open dot\. Positions are not read out while this question can be answered\.$/);
  // No crossing, extreme, touch, position or number beyond the window bounds.
  assert.doesNotMatch(dol.description, /cross|high point|low point|touch|through|at \(|between|−4|\b9\b|\b3\b|\b5\b|\b2\b/);
  assert.deepEqual(dol.tables, [], 'no data table while answerable');
});

test('a student\'s own plotted points are read back even while answerable', () => {
  const plotted = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, minorGridDrawn: true, listPlottedPoints: true, points: [[0, 0], [2, 1]] });
  assert.match(plotted.description, /You plotted 2 points: \(0, 0\); \(2, 1\)\./);
  // A fixed or marker point the activity drew is not the student's: no position.
  const given = describeCoordinatePlane({ minorGridDrawn: true, listPlottedPoints: true, points: [{ x: 4, y: 4, movable: false }, { x: 1, y: 1, marker: 'closed' }] });
  assert.doesNotMatch(given.description, /\(4, 4\)|\(1, 1\)/);
});

// DOL #2 q03: gridlines every 2, yet the old text said "crosses the x-axis at 3".
test('a value is never read more finely than the grid the plane draws', () => {
  const majorsOnly = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, xTickStep: 2, yTickStep: 2, minorGridDrawn: false, lines: [{ m: 1, b: -3 }] });
  assert.match(majorsOnly.description, /crosses the x-axis between 2 and 4/);
  assert.doesNotMatch(majorsOnly.description, /x-axis at 3/);
  const minor = full({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, xTickStep: 2, yTickStep: 2, lines: [{ m: 1, b: -3 }] });
  assert.match(minor.description, /crosses the x-axis at 3/);
});

test('a closed question gets the full reading whatever the readout setting (documented policy)', () => {
  const shown = full({ points: [{ x: 3, y: -2 }] });
  const hidden = full({ points: [{ x: 3, y: -2 }], revealCoordinates: false });
  assert.equal(hidden.description, shown.description);
  assert.match(read('src/platform/language/graphDescription.js'), /WHY THE FULL READING IS NOT HIDDEN WHEN revealCoordinates IS FALSE/);
});

test('the module stays pure: no React, no DOM', () => {
  const code = executableSource(read('src/platform/language/graphDescription.js'));
  assert.doesNotMatch(code, /from ['"]react['"]|\bdocument\.\w|\bwindow\.\w/);
});

/* ------------------------------------------------- CoordinatePlane wiring */

const PLANE = read('src/tools/shared/CoordinatePlane.jsx');
const planeCode = executableSource(PLANE);

test('CoordinatePlane imports the describer it calls, and memoises it on the data', () => {
  assert.match(planeCode, /import\s*\{\s*describeCoordinatePlane\s*\}\s*from\s*['"]\.\.\/\.\.\/platform\/language\/graphDescription\.js['"]/);
  const memo = region(planeCode, 'useMemo(() => describeCoordinatePlane(', '\n  const ', 'description memo');
  const call = memo.slice(0, memo.indexOf('}), ['));
  const deps = memo.slice(memo.indexOf('}), [') + 4);
  // Each drawn collection reaches the describer, and a change to it re-runs
  // the memo. The plane may pass a stabilised alias (empty lists share one
  // array) but the alias must come from the same prop.
  for (const prop of ['points', 'lines', 'functions', 'polylines', 'regions', 'verticalLines', 'horizontalLines']) {
    const passed = call.match(new RegExp(`\\b${prop}(?::\\s*(\\w+))?\\s*,`));
    assert.ok(passed, `the describer must be given ${prop}`);
    const name = passed[1] || prop;
    if (name !== prop) assert.match(planeCode, new RegExp(`const ${name} = orNone\\(${prop}\\);`), `${name} must be ${prop}`);
    assert.match(deps, new RegExp(`\\b${name}\\b`), `memo deps must include ${name}`);
  }
  for (const bound of ['xMin', 'xMax', 'yMin', 'yMax', 'snapStep']) {
    assert.match(deps, new RegExp(`\\b${bound}\\b`), `memo deps must include ${bound}`);
  }
});

test('the plane svg is described by the generated (or authored) summary paragraph', () => {
  const svg = region(planeCode, '<svg', '</svg>', 'plane svg');
  const openTag = svg.slice(0, svg.indexOf('>\n'));
  assert.match(openTag, /role=\{interactive \? 'application' : 'img'\}/);
  assert.match(openTag, /aria-describedby=\{descriptionId\}/, 'both the img and the application plane carry the description');
  const paragraph = planeCode.match(/<p id=\{descriptionId\}[^>]*>\{spokenDescription\}<\/p>/);
  assert.match(paragraph?.[0] || '', /style=\{SR_ONLY_STYLE\}/, 'hidden even where no UI kit CSS is loaded');
  assert.ok(paragraph, 'the described-by target holds the spoken description');
  assert.match(paragraph[0], /className="mm-sr-only"/, 'visually hidden, not removed');
  // Kept out of browse mode (no second reading), except inside a card control
  // whose name it forms.
  assert.match(paragraph[0], /aria-hidden=\{insideControl \? undefined : 'true'\}/);
  // Authored text wins over generated.
  assert.match(planeCode, /const spokenDescription = authoredDescription \|\| generatedDescription\.description;/);
});

test('the plane states feature values only once the question is closed, or when told', () => {
  // Fails closed: null decides from the question lifecycle; anything but an
  // explicit true is 'kinds' while answerable.
  assert.match(planeCode, /const \{ terminal: questionClosed \} = useQuestionLifecycle\(\);/);
  assert.match(planeCode, /const descriptionDetail = \(describeFeatures == null \? questionClosed : describeFeatures === true\) \? 'features' : 'kinds';/);
  const memo = region(planeCode, 'useMemo(() => describeCoordinatePlane(', '\n  const ', 'description memo');
  assert.match(memo, /detail: descriptionDetail,/);
  assert.match(memo, /minorGridDrawn: showMinorGrid,/, 'values at the grid actually drawn');
});

// PR #454 review B1: the table exposed what assessment graphs hide.
test('no data table while answerable, or where the plane withholds coordinates', () => {
  const gate = planeCode.match(/const showDataTable = ([^;]*);/)?.[1] || '';
  for (const condition of ["descriptionDetail === 'features'", 'revealCoordinates !== false', 'pointHoverEnabled !== false', 'dataTable !== false', 'insideControl === false', '!interactive']) {
    assert.ok(gate.includes(condition), `the table requires ${condition}`);
  }
});

test('read-only planes offer a real disclosure button over a captioned, scoped table', () => {
  assert.match(planeCode, /const showDataTable = !interactive && [^;]*insideControl === false[^;]*;/);
  const disclosure = region(planeCode, '{showDataTable ? (', '{zoomable ? (', 'data table disclosure');
  assert.match(disclosure, /<button\s+type="button"\s+aria-expanded=\{dataTableOpen\}\s+aria-controls=\{dataTableId\}/);
  assert.match(disclosure, /<caption[^>]*>\{table\.caption\}<\/caption>/);
  assert.match(disclosure, /<th key=\{column\} scope="col"/);
  assert.match(disclosure, /scope="row"/);
  assert.doesNotMatch(disclosure, /#[0-9a-f]{3,6}\b/i, 'tokens only — no hard-coded colours');
});
