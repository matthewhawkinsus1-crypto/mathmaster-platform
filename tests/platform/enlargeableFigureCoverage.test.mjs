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
  assert.match(source, /if \(!enlargeable\) return plane;/);
  assert.match(source, /<EnlargeableFigure/);
});

test('enlarging a plane cannot move where a plotted point lands', () => {
  // The figure changes the rendered box, not the viewBox. Every click is
  // converted through getBoundingClientRect at event time and normalised by the
  // measured width, so the same press yields the same coordinate at any size.
  // If this ever became a stored constant, plotting would silently drift the
  // moment a student enlarged the plane.
  const plane = codeOf('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /getBoundingClientRect\(\)/);
  assert.match(plane, /viewBox=\{`0 0 \$\{width\} \$\{height\}`\}/);

  const mapping = read('src/utils/responsiveCoordinates.js');
  assert.match(mapping, /\(\(clientX - left\) \/ width\) \* viewBoxWidth/);
  assert.match(mapping, /\(\(clientY - top\) \/ height\) \* viewBoxHeight/);
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
    ['src/tools/relationMapping/RelationMapping.jsx', 'Mapping diagram'],
    ['src/tools/intervalNumberLine/IntervalNumberLine.jsx', 'Number line'],
    ['src/GraphStory.jsx', 'Graph story plane'],
  ]) {
    const source = codeOf(path);
    assert.match(source, /import EnlargeableFigure/, path);
    assert.match(source, new RegExp(`<EnlargeableFigure label="${marker}"`), path);
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
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /openerRef\.current\?\.focus/);
  // Clicking the plane must not close the panel: plotting a point is a click.
  assert.match(source, /event\.target === event\.currentTarget/);
});
