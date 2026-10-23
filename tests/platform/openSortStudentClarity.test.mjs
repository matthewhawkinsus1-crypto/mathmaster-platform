// THE OPEN SORT BOARD, AS THE 2026-10-22 WALKTHROUGH FOUND IT (Algebra I DOL #3
// Review PR 10 and PR 12).
//
// - A placed card collapsed to "Card C ↩": the table, graph or sentence being
//   judged was hidden until the student took the card out again.
// - A wrong sort said "Your cards do not yet form one of the valid mathematical
//   partitions for this set…" — jargon for Algebra I.
// - "Multiple valid sorts" stood on items with exactly one.
// - The circle card drew its upper half solid blue and its lower half dashed
//   red: two relations, or a part left out, on a card sorted by "one output".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const board = executableSource(readFileSync(new URL('../../src/tools/openSortBoard/OpenSortBoard.jsx', import.meta.url), 'utf8'));

test('a placed card keeps its preview, with Move to take it out again', () => {
  const placed = region(board, 'const placedCard = (', '\n  };', 'the placed card');
  assert.match(placed, /<SortItemPreview item=\{item\} \/>/);
  assert.match(placed, /onClick=\{\(\) => returnItem\(id\)\}[^\n]*minHeight: 44,/);
  assert.match(placed, />\s*Move <span aria-hidden="true">↩<\/span>/);
  // Both modes use it.
  assert.equal((board.match(/group\.itemIds\.map\(\(id\) => placedCard\(\{ id, group, groupIndex, controlled: (true|false) \}\)\)/g) || []).length, 2);
});

test('a wrong sort is told what a good group is, in plain words', () => {
  assert.doesNotMatch(board, /valid mathematical partitions|sorting schemes authored/);
  assert.match(board, /Not every group holds together yet\. A group needs one feature that every card in it has and the cards in your other groups do not\./);
});

test('"Multiple valid sorts" only where the item accepts more than one', () => {
  assert.match(board, /const authoredSortCount = Array\.isArray\(questionData\.validSchemes\) \? questionData\.validSchemes\.length : 0;/);
  assert.match(board, /badge=\{controlled \? 'Fixed categories' : authoredSortCount > 1 \? 'Multiple valid sorts' : 'Make your own groups'\}/);
});

test('a circle and a sideways parabola are each one curve in one style', () => {
  const layers = region(board, 'const previewLayers = (', '\n};', 'the preview layers');
  const circle = region(layers, "if (type === 'circle') {", '\n  }', 'the circle');
  assert.match(circle, /return \{ functions: \[\], verticalLines: \[\], polylines: \[\{ points, \.\.\.SAME_CURVE \}\] \};/);
  assert.doesNotMatch(circle, /branch\(-1\)/);
  const sideways = region(layers, "if (type === 'sidewaysParabola') {", '\n  }', 'the sideways parabola');
  assert.match(sideways, /polylines: \[\{ points, \.\.\.SAME_CURVE \}\]/);
  assert.match(board, /polylines=\{layers\.polylines \|\| \[\]\}/);
});

// DOL #3 Review Q12, Card E (walkthrough 2026-10-23): the circle on a −6..6
// window was drawn in a 300 × 220 plane, so it showed as an ellipse.
test('a circle card is drawn with equal units, so it looks like a circle', async () => {
  const { readFileSync } = await import('node:fs');
  const { equalUnitPlaneHeight } = await import('../../src/tools/shared/planeEqualUnits.js');
  const board = readFileSync(new URL('../../src/tools/openSortBoard/OpenSortBoard.jsx', import.meta.url), 'utf8');
  assert.match(board, /equalUnits=\{item\.graphSpec\?\.type === 'circle'\}/);
  assert.equal(equalUnitPlaneHeight({ width: 300, pad: 42, xMin: -6, xMax: 6, yMin: -6, yMax: 6, fallback: 220 }), 300, 'a square window gets a square plane');
});
