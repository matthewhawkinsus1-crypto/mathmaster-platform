import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(path, 'utf8');

// Assertions here are about what the code does; a comment explaining why a
// figure is NOT enlargeable would otherwise satisfy a test looking for the fact.
const codeOf = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('the shared coordinate plane can be opened full window', () => {
  // One component stands behind fifteen surfaces, so the width squeeze that
  // made a Path graph 587px wide on a 1366px Chromebook applies to all of them.
  const source = codeOf('src/tools/shared/CoordinatePlane.jsx');
  assert.match(source, /import EnlargeableFigure/);
  assert.match(source, /enlargeable = true/);
  // Every plane enlarges now, interactive ones included — see
  // enlargedToolPresentation.test.mjs for why that exclusion was dropped.
  assert.match(source, /if \(!enlargeable\) return plane;/);
  assert.match(source, /<EnlargeableFigure/);
});

test('enlarging a plane cannot move where a plotted point lands', async () => {
  // The figure changes the rendered box, not the viewBox. Every click is
  // converted through getBoundingClientRect at event time and normalised by the
  // measured width, so the same press yields the same coordinate at any size.
  // If this ever became a stored constant, plotting would silently drift the
  // moment a student enlarged the plane.
  const plane = codeOf('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /getBoundingClientRect\(\)/);
  assert.match(plane, /viewBox=\{`0 0 \$\{width\} \$\{height\}`\}/);

  // The conversion itself, measured rather than read: the same drawn point
  // maps to the same viewBox point at embedded size, enlarged size, and in a
  // box the 70dvh cap has letterboxed (the platform quirks audit found the
  // letterboxed case put a click on (6, 10) at (5.5, 10)).
  const { clientPointToViewBox } = await import('../../src/utils/responsiveCoordinates.js');
  const viewBox = { viewBoxWidth: 760, viewBoxHeight: 540 };
  const drawnAt = (rect, vx, vy) => {
    const scale = Math.min(rect.width / 760, rect.height / 540);
    return {
      clientX: rect.left + (rect.width - 760 * scale) / 2 + vx * scale,
      clientY: rect.top + (rect.height - 540 * scale) / 2 + vy * scale,
    };
  };
  for (const rect of [
    { left: 20, top: 300, width: 587, height: 587 * 540 / 760 },
    { left: 0, top: 60, width: 1300, height: 1300 * 540 / 760 },
    { left: 100, top: 200, width: 808, height: 528 },
  ]) {
    const point = clientPointToViewBox({ ...drawnAt(rect, 612, 118), rect, ...viewBox });
    assert.ok(Math.abs(point.x - 612) < 1e-9 && Math.abs(point.y - 118) < 1e-9, `${rect.width}x${rect.height}`);
  }
});

test('a plane inside another control does not grow a nested button', () => {
  // A <button> inside a <button> is invalid markup, and the enlarge press would
  // also fire the card selection underneath it.
  for (const path of [
    'src/tools/openSortBoard/OpenSortBoard.jsx',
    'src/tools/representationMatch/RepresentationMatch.jsx',
  ]) {
    const source = codeOf(path);
    const planes = source.match(/<CoordinatePlane/g) || [];
    const optOuts = source.match(/enlargeable=\{false\}/g) || [];
    assert.equal(planes.length, optOuts.length, `${path}: every nested plane must opt out`);
  }
});

test('the standalone student diagrams are enlargeable too', () => {
  // These draw their own SVG rather than using the shared plane, so wrapping
  // CoordinatePlane did not reach them.
  for (const [path, marker] of [
    // The first two wrap their whole split, so the panel a student answers in
    // comes with the figure rather than staying behind the backdrop.
    ['src/tools/relationMapping/RelationMapping.jsx', 'Mapping workspace'],
    ['src/tools/intervalNumberLine/IntervalNumberLine.jsx', 'Number line workspace'],
    ['src/GraphStory.jsx', 'Graph story plane'],
  ]) {
    const source = codeOf(path);
    assert.match(source, /import EnlargeableFigure/, path);
    assert.match(source, new RegExp(`<EnlargeableFigure[\\s\\S]{0,80}label="${marker}"`), path);
    const opened = (source.match(/<EnlargeableFigure/g) || []).length;
    const closed = (source.match(/<\/EnlargeableFigure>/g) || []).length;
    assert.equal(opened, closed, `${path}: unbalanced figure tags`);
  }
});

test('every enlargeable figure opens and closes in balance', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && path.endsWith('.jsx') ? [path] : [];
  });

  for (const path of walk('src')) {
    const source = read(path);
    if (path.endsWith('EnlargeableFigure.jsx')) continue;
    const opened = (source.match(/<EnlargeableFigure[\s>]/g) || []).length;
    if (!opened) continue;
    const closed = (source.match(/<\/EnlargeableFigure>/g) || []).length;
    assert.equal(opened, closed, `${path}: ${opened} opened, ${closed} closed`);
    assert.match(source, /import EnlargeableFigure/, `${path} uses the figure without importing it`);
  }
});

test('the enlarged view is a real dialog a keyboard can leave', () => {
  // A student who enlarges a graph and cannot get back to the question has been
  // trapped by a feature meant to help them.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  assert.match(source, /role=\{enlarged \? 'dialog' : undefined\}/);
  assert.match(source, /aria-modal=\{enlarged \? 'true' : undefined\}/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /openerRef\.current\?\.focus/);
  // Clicking the plane must not close the panel: plotting a point is a click.
  assert.match(source, /event\.target === event\.currentTarget/);
});

test('the enlarge and close controls are finger-sized', () => {
  // 44px, not the 34 this used to be. The mobile foundation stylesheet forces
  // 44 inside the phone layout, but it is scoped to that layout — a touchscreen
  // Chromebook at 1366px is outside it, and the button floating over the corner
  // of a graph is exactly the kind of control a finger misses.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  const control = source.match(/const CONTROL = \{[\s\S]*?\n\};/);
  assert.ok(control, 'CONTROL style block not found');
  assert.match(control[0], /minHeight: 44,/);
  assert.doesNotMatch(control[0], /minHeight: (?!44)\d+/, 'one size, so the two states cannot drift');
});

test('the task repeated inside the enlarged panel is rendered as mathematics', () => {
  // It IS the prompt, shown again where the modal covers it, so it carries the
  // same `$…$`. Printed raw, a student who enlarged a number-line question read
  // "Solve $-6x- 6 \ge 24$" instead of the inequality.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  assert.match(source, /import MathText/);
  assert.match(source, /mathmaster-work-view-persistent-task/);
  assert.match(source, /aria-label="Your task"/);
  assert.match(source, /<MathText>\{task\}<\/MathText>/);
});
