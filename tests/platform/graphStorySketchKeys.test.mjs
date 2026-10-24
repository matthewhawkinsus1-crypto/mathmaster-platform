/*
 * AX14: THE GRAPH STORY SKETCH HAS A KEYBOARD ROUTE — points joined in order.
 *
 * The sketch was freehand and pointer-only (VPAT 2.1.1, 2.5.1): a keyboard-only
 * or switch student could not finish a Graph Story item. The owner chose a
 * keyboard route over WCAG's path-dependent exception: arrow keys move a
 * crosshair over the grid, Enter places a point, and points placed one after
 * another join, in order, into one line, graded by the same rule as a drawn
 * stroke. Escape finishes the line (src/platform/graph/graphStorySketchKeys.js).
 *
 * Browser proof (keys, the drawing and the accessibility tree):
 * tests/browser/figureDescriptions.mjs ("graph story sketch by keyboard").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKETCH_KEYBOARD_HELP, SKETCH_START, moveSketchCursor, placeSketchPoint, sketchCursorPoint, sketchCursorWords,
  sketchFinishedWords, sketchKeyAction, sketchKeyGrid, sketchLineCount, sketchPlacedWords,
} from '../../src/platform/graph/graphStorySketchKeys.js';
import { compactSketchStrokes, isQualifyingStroke } from '../../functions/shared/toolMath/scenario/graphStoryMath.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

// GraphStory.jsx's drawing: 720 x 420, 44 of padding, a 42 grid.
const GRID = sketchKeyGrid({ width: 720, height: 420, pad: 44, step: 42 });
const key = (value, modifiers = {}) => ({ key: value, ...modifiers });

test('the crosshair walks the drawn grid from the corner where the axes meet', () => {
  assert.deepEqual(GRID, { left: 44, bottom: 376, step: 42, columns: 15, rows: 7 });
  assert.deepEqual(sketchCursorPoint(SKETCH_START, GRID), { x: 44, y: 376 }, 'on both axes');
  let cursor = null;
  cursor = moveSketchCursor(cursor, key('ArrowRight'), GRID);
  cursor = moveSketchCursor(cursor, key('ArrowUp'), GRID);
  cursor = moveSketchCursor(cursor, key('ArrowUp'), GRID);
  assert.deepEqual(cursor, { column: 1, row: 2 });
  assert.deepEqual(sketchCursorPoint(cursor, GRID), { x: 86, y: 292 });
  assert.deepEqual(moveSketchCursor(cursor, key('ArrowRight', { shiftKey: true }), GRID), { column: 6, row: 2 }, 'Shift for five');
  // Never off the grid, and never outside the drawing.
  assert.deepEqual(moveSketchCursor(SKETCH_START, key('ArrowLeft'), GRID), SKETCH_START);
  assert.deepEqual(moveSketchCursor(SKETCH_START, key('ArrowDown', { shiftKey: true }), GRID), SKETCH_START);
  const corner = moveSketchCursor(moveSketchCursor({ column: 14, row: 6 }, key('ArrowRight', { shiftKey: true }), GRID), key('ArrowUp', { shiftKey: true }), GRID);
  assert.deepEqual(corner, { column: 15, row: 7 });
  const far = sketchCursorPoint(corner, GRID);
  assert.ok(far.x <= 720 - 44 && far.y >= 44, `inside the drawing: ${JSON.stringify(far)}`);
});

test('arrows move, Enter or Space places, Escape finishes; nothing else is the sketch\'s', () => {
  for (const arrow of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) assert.equal(sketchKeyAction(key(arrow)), 'move');
  assert.equal(sketchKeyAction(key('ArrowUp', { shiftKey: true })), 'move');
  assert.equal(sketchKeyAction(key('Enter')), 'place');
  assert.equal(sketchKeyAction(key(' ')), 'place');
  assert.equal(sketchKeyAction(key('Escape')), 'finish');
  for (const other of ['Tab', 'a', 'Backspace', 'Home']) assert.equal(sketchKeyAction(key(other)), null, other);
  // Browser and system shortcuts stay theirs.
  assert.equal(sketchKeyAction(key('ArrowLeft', { altKey: true })), null);
  assert.equal(sketchKeyAction(key('Enter', { ctrlKey: true })), null);
  assert.equal(sketchKeyAction(key('ArrowUp', { metaKey: true })), null);
});

test('points placed one after another join in order into one line, a sketch by the grading rule', () => {
  const at = (column, row) => sketchCursorPoint({ column, row }, GRID);
  let state = placeSketchPoint([], null, at(0, 0));
  assert.deepEqual(state, { strokes: [[{ x: 44, y: 376 }]], lineIndex: 0, count: 1 });
  state = placeSketchPoint(state.strokes, state.lineIndex, at(3, 2));
  state = placeSketchPoint(state.strokes, state.lineIndex, at(6, 2));
  assert.equal(state.strokes.length, 1, 'one line');
  assert.deepEqual(state.strokes[0], [at(0, 0), at(3, 2), at(6, 2)], 'in the order placed');
  assert.equal(state.count, 3);
  // The rule the sketch part is graded by, on what the work carries.
  assert.ok(compactSketchStrokes(state.strokes).some(isQualifyingStroke), 'three points make a sketch');
  assert.ok(!compactSketchStrokes(placeSketchPoint([], null, at(1, 1)).strokes).some(isQualifyingStroke), 'one point does not');
});

test('a line ends with Escape, a drawn stroke, Undo of its first point or Clear graph', () => {
  const point = { x: 44, y: 376 };
  const drawn = [{ x: 100, y: 300 }, { x: 120, y: 280 }, { x: 140, y: 260 }];
  // After Escape the host forgets the line: the next point starts another.
  const first = placeSketchPoint([], null, point);
  const next = placeSketchPoint(first.strokes, null, point);
  assert.equal(next.strokes.length, 2);
  assert.equal(next.lineIndex, 1);
  // A stroke drawn with the pointer after it: the line is no longer last.
  const afterDrawing = placeSketchPoint([...first.strokes, drawn], first.lineIndex, point);
  assert.equal(afterDrawing.strokes.length, 3);
  assert.deepEqual(afterDrawing.strokes[1], drawn, 'the drawn stroke is untouched');
  // Undo took the line's only point away, or Clear graph emptied the sketch.
  assert.equal(placeSketchPoint([], 0, point).lineIndex, 0);
  assert.equal(placeSketchPoint([], 0, point).strokes.length, 1);
  // How many points the line being placed has (0: none is being placed).
  assert.equal(sketchLineCount([[point, point]], 0), 2);
  assert.equal(sketchLineCount([[point], drawn], 0), 0);
  assert.equal(sketchLineCount([], 0), 0);
  assert.equal(sketchLineCount([[point]], null), 0);
});

test('what a screen reader hears: where the crosshair is and what each key did, in squares', () => {
  assert.equal(sketchCursorWords({ column: 3, row: 2 }), '3 right, 2 up');
  assert.equal(sketchCursorWords(null), '0 right, 0 up');
  assert.equal(sketchPlacedWords(1, { column: 0, row: 0 }), 'Point 1 placed at 0 right, 0 up. The line has 1 point.');
  assert.equal(sketchPlacedWords(2, { column: 3, row: 2 }), 'Point 2 placed at 3 right, 2 up. The line has 2 points.');
  assert.equal(sketchFinishedWords(3), 'Line finished with 3 points. The next point starts a new line.');
  assert.match(SKETCH_KEYBOARD_HELP, /^Arrow keys move the crosshair one square \(Shift for five\)\. Enter places a point; points join in order into a line\. Escape finishes the line\.$/);
});

const story = executableSource(readFileSync(new URL('../../src/GraphStory.jsx', import.meta.url), 'utf8'));

test('GraphStory: the sketch takes keyboard focus and keys, and says so; a finished one is an image', () => {
  const svg = region(story, '<svg\n          viewBox=', '\n        >', 'the sketch');
  // Open: a widget that takes the keys. Finished (AX01): the student's work
  // to read, with nothing to offer a keyboard.
  assert.match(story, /const \{ terminal: questionClosed \} = useQuestionLifecycle\(\);\s*const keyboardRoute = !questionClosed;/);
  assert.match(svg, /tabIndex=\{keyboardRoute \? 0 : undefined\}/);
  assert.match(svg, /role=\{keyboardRoute \? 'application' : 'img'\}/, 'a screen reader hands the keys to the sketch');
  assert.match(svg, /aria-label="Graph story sketch"/);
  assert.match(svg, /aria-describedby=\{keyboardRoute \? `\$\{sketchDescriptionId\} \$\{sketchDescriptionId\}-keys` : sketchDescriptionId\}/, 'what is drawn, then the keyboard route');
  assert.match(svg, /onKeyDown=\{keyboardRoute \? handleSketchKeyDown : undefined\}/);
  assert.match(story, /const crosshair = keyboardRoute && keyActive \?/);
  assert.match(svg, /onPointerDown=\{startStroke\}/, 'the pointer still draws freehand');
  assert.match(story, /<span id=\{`\$\{sketchDescriptionId\}-keys`\} aria-hidden="true" style=\{VISUALLY_HIDDEN\}>\{SKETCH_KEYBOARD_HELP\}<\/span>/);
  assert.match(story, /<p aria-live="polite" style=\{VISUALLY_HIDDEN\}>\{keyAnnouncement\}<\/p>/);
});

test('GraphStory: Enter places a recorded point on the line; Escape is taken only to finish one', () => {
  const handler = region(story, 'const handleSketchKeyDown = (event) => {', '\n  };', 'the key handler');
  const finish = region(handler, "if (action === 'finish') {", 'event.preventDefault();\n    setKeyActive(true);', 'Escape');
  assert.match(finish, /const count = sketchLineCount\(values\.strokes, keyLine\);\s*if \(!count\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/, 'with no line being placed, Escape is left to Work View');
  assert.match(handler, /const next = moveSketchCursor\(keyCursor, event, KEY_GRID\);/);
  assert.match(handler, /const placed = placeSketchPoint\(values\.strokes, keyLine, sketchCursorPoint\(at, KEY_GRID\)\);/);
  // Recorded (no `record: false`): Undo takes back one point at a time.
  assert.match(handler, /history\.setValue\(\(current\) => \(\{ \.\.\.current, strokes: placed\.strokes \}\)\);/);
  assert.match(region(story, 'const startStroke = (event) => {', '\n  };', 'the pointer'), /setKeyLine\(null\);/, 'a drawn stroke ends the keyboard line');
  // A first point placed by keyboard is seen: one point is a dot, not an empty polyline.
  assert.match(story, /stroke\.length === 1\s*\? <circle key=\{index\} cx=\{stroke\[0\]\.x\} cy=\{stroke\[0\]\.y\}/);
});
