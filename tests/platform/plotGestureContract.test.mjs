import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const plane = read('src/tools/shared/CoordinatePlane.jsx');

/* ---------- the gesture ---------- */

test('a point is committed on release, not on press', () => {
  // On a phone the finger covers the target, so a press-to-plot lands the point
  // somewhere the student could not see and only finds out about afterwards.
  // Committing on lift means what they see before releasing is what they get.
  assert.match(plane, /const handlePointerUp = \(event\) => \{/);
  assert.match(plane, /if \(movedIndex != null\) onMovePoint\(movedIndex, point\);\s*\n\s*else onPlot\(point\);/);
  // The old click handler must be gone, or a mouse would plot twice.
  assert.doesNotMatch(plane, /onClick=\{handleClick\}/);
  assert.doesNotMatch(plane, /const handleClick = /);
});

test('the gesture survives the finger leaving the plane', () => {
  // Without capture, dragging toward the edge stops updating and the point
  // lands wherever tracking gave up.
  assert.match(plane, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(plane, /releasePointerCapture\?\.\(event\.pointerId\)/);
  assert.match(plane, /const handlePointerCancel = /);
  // A drag in progress must not be cancelled by the pointer crossing the edge.
  assert.match(plane, /const handlePointerLeave = \(\) => \{\s*\n\s*if \(gestureActive\) return;/);
});

/* ---------- moving a point already placed ---------- */

test('an existing point can be picked up, and only the student\'s own', () => {
  assert.match(plane, /onMovePoint = null/);
  assert.match(plane, /const canMovePoints = interactive && typeof onMovePoint === 'function'/);
  assert.match(plane, /const pointIndexNear = /);
  // Drawn where the finger is while held, or the drag looks broken until release.
  assert.match(plane, /if \(dragIndex === index && pointerPreview\) \[pointX, pointY\] = pointerPreview;/);
});

test('every tool that owns indexed points accepts a moved one', () => {
  // The plane reports an index into the combined list, which starts with the
  // given/source points. A tool that forgot the offset would move the wrong
  // point, or let a student drag a point that was never theirs.
  const graphing2 = read('src/tools/graphing2/Graphing2.jsx');
  assert.match(graphing2, /onMovePoint=\{movePoint\}/);
  assert.match(graphing2, /const studentIndex = index - givenPoints\.length;\s*\n\s*if \(studentIndex < 0\) return;/);

  const transformations = read('src/tools/transformations/TransformationsLab.jsx');
  assert.match(transformations, /onMovePoint=\{\(index, point\) => \{/);
  assert.match(transformations, /const studentIndex = index - sourcePoints\.length;\s*\n\s*if \(studentIndex < 0\) return;/);

  const sequence = read('src/tools/sequenceExplorer/SequenceExplorer.jsx');
  assert.equal((sequence.match(/onMovePoint=/g) || []).length, 2, 'both sequence planes accept a move');
});

/* ---------- the instructions describe the gesture that exists ---------- */

test('the on-screen directions match what the plane actually does', () => {
  // "Click the grid to plot" described a gesture that no longer exists, and a
  // student following it would never discover they can slide to correct.
  assert.match(plane, /Press the grid and slide to aim/);
  assert.match(plane, /the point lands where you\s*\n?\s*let go/);
  assert.doesNotMatch(plane, /Click the grid to plot/);
  // Keyboard plotting is unchanged and still described.
  assert.match(plane, /arrow keys move the\s*\n?\s*crosshair/);
});
