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
const allText = (result) => [
  result.summary,
  ...result.tables.flatMap((table) => [table.caption, ...table.columns, ...table.rows.flat()]),
].join(' \n ');

test('two different line graphs announce differently, and each reads visually', () => {
  const a = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 2, b: 2 }] });
  const b = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: -1, b: 3 }] });
  assert.notEqual(a.description, b.description);
  assert.match(a.description, /x from −6 to 6, y from −6 to 6\./);
  assert.match(a.description, /Line 1 rises from left to right, crosses the y-axis at 2, crosses the x-axis at −1, and passes through \(0, 2\) and \(1, 4\)\./);
  assert.match(b.description, /Line 1 falls from left to right, crosses the y-axis at 3, crosses the x-axis at 3/);
});

test('no equation, slope or rule is ever spoken, for any kind of object', () => {
  const result = describeCoordinatePlane({
    xMin: -6, xMax: 6, yMin: -6, yMax: 10,
    lines: [{ m: 0.5, b: -1, label: 'y = 0.5x - 1' }, { m: 0, b: 3 }],
    functions: [(x) => x * x - 4, (x) => 2 ** x],
    verticalLines: [3], horizontalLines: [-2],
    points: [{ x: 1, y: 1, label: 'A' }],
  });
  assert.doesNotMatch(allText(result), EQUATION_TALK);
  assert.match(result.description, /Line 2 is horizontal, crosses the y-axis at 3/);
});

test('off-grid values say "about", rounded to half a grid step; on-grid values are exact', () => {
  assert.deepEqual(readValue(3, 1), { text: '3', exact: true, value: 3 });
  assert.equal(readValue(2.3, 1).text, '2.5');
  assert.equal(readValue(2.3, 1).exact, false);
  assert.equal(readValue(-1.1, 1).text, '−1');
  assert.equal(readValue(0.5, 0.5).exact, true, 'a half-step question reads halves exactly');

  const result = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, points: [{ x: 2.3, y: -1 }, { x: 3, y: -2 }] });
  assert.match(result.description, /2 points: about \(2\.5, −1\); \(3, −2\)\./);
  // The table reads the same way: never more precise than the grid.
  assert.deepEqual(result.tables[0].rows[0], ['Point 1', 'about 2.5', '−1']);
  assert.doesNotMatch(allText(result), /2\.3/);
});

test('a line through no grid point still never states a computed value exactly', () => {
  const result = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 1 / 3, b: 0.4 }] });
  assert.match(result.description, /crosses the y-axis at about 0\.5/);
  assert.match(result.description, /crosses the x-axis at about −1/);
  assert.doesNotMatch(allText(result), /0\.4|0\.33|−1\.2/);
});

test('labels are spoken only where the plane draws them: plain dots, never markers or lines', () => {
  const result = describeCoordinatePlane({
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
  const result = describeCoordinatePlane({ verticalLines: [3], horizontalLines: [-2] });
  assert.match(result.description, /Dashed vertical line through 3 on the x-axis\./);
  assert.match(result.description, /Dashed horizontal line through −2 on the y-axis\./);
});

test('shaded regions and connected paths list their corners', () => {
  const result = describeCoordinatePlane({
    regions: [[[0, 0], [4, 0], [0, 4]]],
    polylines: [{ points: [{ x: -5, y: -5 }, { x: -2, y: 1 }] }],
  });
  assert.match(result.description, /Shaded region 1 with corners at \(0, 0\), \(4, 0\), and \(0, 4\)\./);
  assert.match(result.description, /Connected path 1 through \(−5, −5\) and \(−2, 1\)\./);
  const shapes = result.tables.find((table) => table.columns[0] === 'Shape');
  assert.equal(shapes.rows.length, 5);
});

test('a curve with a turning point names it, its axis crossings and where it leaves the window', () => {
  const result = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 10, functions: [(x) => x * x - 4] });
  assert.match(
    result.description,
    /Curve 1 comes in through the top edge at about \(−3\.5, 10\), crosses the x-axis at −2, has a low point at \(0, −4\), crosses the x-axis at 2, and leaves through the top edge at about \(3\.5, 10\)\./,
  );
  const high = describeCoordinatePlane({ functions: [(x) => -((x - 1) ** 2) + 3] });
  assert.match(high.description, /has a high point at \(1, 3\)/);
  // A curve that only touches the axis on a gridline says so.
  const touch = describeCoordinatePlane({ functions: [(x) => (x - 2) ** 2] });
  assert.match(touch.description, /touches the x-axis at 2/);
  // Two curves are told apart by how they are drawn.
  const two = describeCoordinatePlane({ functions: [(x) => x, (x) => -x] });
  assert.match(two.description, /Curve 1 \(solid\).*Curve 2 \(dashed\)/);
});

test('the line/curve table reads y at each labelled x, as the grid would', () => {
  const result = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 2, b: 2 }], functions: [(x) => Math.sqrt(x)] });
  const table = result.tables.find((t) => t.columns[0] === 'x');
  assert.deepEqual(table.columns, ['x', 'Line 1', 'Curve 1']);
  const row = (x) => table.rows.find((r) => r[0] === x);
  assert.deepEqual(row('0'), ['0', '2', '0']);
  assert.deepEqual(row('2'), ['2', '6', 'about 1.5']);
  assert.deepEqual(row('4'), ['4', 'off the graph', '2']);
  assert.deepEqual(row('−2'), ['−2', '−2', 'not drawn']);
});

test('tool-drawn marks are admitted, not hidden; an empty plane says so', () => {
  assert.match(describeCoordinatePlane({}).description, /Nothing is plotted\./);
  const marked = describeCoordinatePlane({ hasUndescribedMarks: true });
  assert.match(marked.description, /marks drawn by the activity that are not listed here/);
  assert.doesNotMatch(marked.description, /Nothing is plotted/);
});

test('revealCoordinates=false does not silence the description (documented policy)', () => {
  const shown = describeCoordinatePlane({ points: [{ x: 3, y: -2 }] });
  const hidden = describeCoordinatePlane({ points: [{ x: 3, y: -2 }], revealCoordinates: false });
  assert.equal(hidden.description, shown.description);
  assert.match(read('src/platform/language/graphDescription.js'), /deliberately NOT suppressed|not hidden when revealCoordinates is false/i);
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
  assert.ok(paragraph, 'the described-by target holds the spoken description');
  assert.match(paragraph[0], /className="mm-sr-only"/, 'visually hidden, not removed');
  // Kept out of browse mode (no second reading), except inside a card control
  // whose name it forms.
  assert.match(paragraph[0], /aria-hidden=\{insideControl \? undefined : 'true'\}/);
  // Authored text wins over generated.
  assert.match(planeCode, /const spokenDescription = authoredDescription \|\| generatedDescription\.description;/);
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
