// A student who cannot use a trackpad has to be able to answer the question.
//
// WHAT THIS REPLACED. `InteractiveGraphWorkspace` — the renderer for
// `functionInvestigation`, `functionGraph` and `graphAnalysis`, and therefore
// for the single largest group of tool-backed questions in the shipped Path
// bank — contained zero `tabIndex` and zero `onKeyDown`. Every placement was a
// drag, or a click-the-card-then-click-the-exact-pixel. There was no keyboard
// path of any kind. A keyboard-only student could not answer those questions
// at all.
//
// `StepByStepAlgebra` had the same shape of failure for a different reason: the
// select-then-place route existed, but every part of it was gated on
// `mobileInteraction.isMobile`. On a desktop or a Chromebook with a fine
// pointer, `onClick` on the "Pick up" control resolved to `undefined` — so
// pressing Enter on it did nothing, and dragging was the only way through.
//
// These are source-level assertions rather than rendered-DOM ones because this
// sandbox cannot install a DOM test environment. They pin the specific
// mechanisms; the behaviour they guarantee is stated in each message.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepAlgebraSource } from './helpers/solverSource.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const graph = read('src/InteractiveGraphWorkspace.jsx');
const algebra = stepAlgebraSource();
const numberLine = read('src/tools/intervalNumberLine/IntervalNumberLine.jsx');
const relation = read('src/tools/relationMapping/RelationMapping.jsx');

// --- The graphing workspace ---------------------------------------------------

test('the coordinate plane can be focused and driven from the keyboard', () => {
  assert.match(graph, /tabIndex=\{0\}/, 'the plane must be reachable by Tab');
  assert.match(graph, /onKeyDown=\{handleGridKeyDown\}/, 'the plane must respond to keys');
  assert.match(graph, /ArrowLeft:.*ArrowRight:.*ArrowUp:.*ArrowDown:/s, 'all four arrows must move the cursor');
  assert.match(graph, /event\.key === 'Enter' \|\| event\.key === ' '/, 'Enter or Space must place');
});

test('the keyboard cursor is visible and announced', () => {
  assert.match(graph, /keyboardCursor && \(/, 'a sighted keyboard user must see where the cursor is');
  assert.match(graph, /aria-live="polite"/, 'a screen-reader student must hear what happened');
  assert.match(graph, /setKeyboardAnnouncement/, 'placements must be announced');
});

test('an exact coordinate can be typed instead of pointed at', () => {
  // The precision route. A trackpad on a school Chromebook cannot reliably hit
  // (2, -3.5), and fighting the interface is not part of the mathematics.
  assert.match(graph, /Place at this coordinate/, 'there must be an exact-entry control');
  assert.match(graph, /placeAtCoordinate/, 'exact entry must share the placement path');
  assert.match(graph, /id="graph-exact-place"/);
});

test('the keyboard route does not compute the answer for the student', () => {
  // The whole point: an alternative to POINTING, not an alternative to
  // THINKING. Nothing may solve for a coordinate on the student's behalf.
  assert.ok(!/evaluateGraphFunction\([^)]*\)[^;]*setTypedY/.test(graph),
    'the exact-entry box must never fill in y from the function');
  assert.ok(!/autoPlace|solveForStudent|fillCorrectPoint/i.test(graph),
    'no code path may place the correct point on the student\'s behalf');
});

test('keyboard placement and mouse placement reach the same grading path', () => {
  // Two routes to one answer. If keyboard placements went somewhere else they
  // could be graded differently, which is a worse failure than no keyboard.
  assert.match(graph, /placeAtCoordinate[\s\S]{0,2600}placeTask\(activeTaskId, target\)/,
    'keyboard placement must call the same placeTask the pointer uses');
  assert.match(graph, /placeAtCoordinate[\s\S]{0,2600}placeMarkerAt\(activeMarker, target\)/,
    'keyboard marker placement must call the same placeMarkerAt');
});

test('the selection cards report their state to assistive technology', () => {
  assert.match(graph, /aria-pressed=\{active\}/, 'a selected point task must say it is selected');
  assert.match(graph, /aria-pressed=\{activeMarker === type\}/, 'a selected marker must say so');
});

// --- The algebra workspace ----------------------------------------------------

test('select-then-place in the algebra workspace is not gated behind a device check', () => {
  assert.match(algebra, /onClick=\{activateTapPlacement\}/,
    'a desktop keyboard user must find a real click handler, not undefined');
  assert.ok(!/const activateTapPlacement = \(\) => \{\s*if \(!mobileInteraction\.isMobile/.test(algebra),
    'the function itself must not turn desktop callers away');
  assert.ok(!/const tapPlacementOnSide = \(side, event\) => \{\s*if \(!mobileInteraction\.isMobile/.test(algebra),
    'placing on a side must not require a coarse pointer');
});

test('an armed operation makes both equation sides keyboard-reachable', () => {
  assert.match(algebra, /tabIndex=\{tapPlacementArmed \? 0 : undefined\}/,
    'once an operation is armed, the sides must be tabbable on every device');
  assert.match(algebra, /if \(tapPlacementArmed && \(event\.key === 'Enter' \|\| event\.key === ' '\)\)/,
    'Enter or Space must apply the armed operation to the focused side');
});

test('dragging still works — the keyboard route is an addition, not a replacement', () => {
  assert.match(algebra, /onPointerDown=\{mobileInteraction\.isMobile \? undefined : \(event\) => beginPointerDrag/,
    'a student who prefers dragging must keep it');
});

// --- The tools that already got this right ------------------------------------

test('the number line keeps its exact-entry alternative to dragging', () => {
  assert.match(numberLine, /Place endpoint/, 'typed endpoints are the accessible route here');
  assert.ok(/onPointerDown/.test(numberLine), 'and dragging still exists for those who want it');
});

test('the relation mapping diagram is operable from the keyboard', () => {
  assert.match(relation, /tabIndex/, 'mapping nodes must be reachable');
  assert.match(relation, /Enter|' '/, 'and activatable without a pointer');
});
