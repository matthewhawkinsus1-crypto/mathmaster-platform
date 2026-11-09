/*
 * HOW TO PLACE A BALANCED OPERATION IS SAID ON SCREEN (F-SW-PLACEMENT-HOW,
 * PR #537 walkthrough).
 *
 * In the relation solver — the Systems Workspace's Rewrite step and the
 * absolute-value lessons — choosing Subtract and typing 2x left "Commit step"
 * disabled under one 10.5 px line, "Place the balanced operation on both
 * sides."; how to place it (click a term, then Before, Under or After) was only
 * in a hover tooltip. The line now says how while nothing is placed, names the
 * keyboard route in the same line (AX32's rule, PLANE_KEYS' style), and a
 * choice made from the keyboard leaves focus on its term.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TERM_KEYS, placementInstruction } from '../../src/relationOperationPlacement.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// AX32's own detector (tests/platform/toolDirectionsNameKeyboardRoute.test.mjs).
const POINTER_VERB = /\b(?:click(?:s|ed|ing)?|tap(?:s|ped|ping)?|drag(?:s|ged|ging)?|swip(?:e|es|ed|ing))\b/i;
const KEYBOARD_ROUTE = /\b(?:Tab|arrow keys?|keyboard|Enter|Space)\b/;

const solver = executableSource(componentSource('src/MultiRelationAlgebraCore.jsx'));

test('once an operation and its value are chosen, the line says how to place it — with the keys, in the same line', () => {
  const subtract = placementInstruction({ operation: 'subtract' });
  assert.equal(subtract, 'Click or tap a term on each side (or Tab to it and press Enter), then choose where the operation goes.');
  assert.equal(placementInstruction({ operation: 'add' }), subtract);
  assert.equal(placementInstruction({ operation: 'add', regions: 3 }), 'Click or tap a term in each of the three regions (or Tab to it and press Enter), then choose where the operation goes.');
  for (const line of [subtract, placementInstruction({ operation: 'add', regions: 3 })]) {
    assert.match(line, POINTER_VERB);
    assert.match(line, KEYBOARD_ROUTE, `"${line}" names the keyboard route (AX32)`);
    assert.ok(line.includes(TERM_KEYS));
  }
  // Multiply and divide are placed with the button under each side.
  assert.equal(placementInstruction({ operation: 'multiply' }), 'Press “Place multiplier” under each side.');
  assert.equal(placementInstruction({ operation: 'divide', regions: 3 }), 'Press “Place divisor” under each of the three regions.');
  assert.equal(placementInstruction({ operation: '' }), null);
});

test('the route the line names is the one the solver offers', () => {
  // A term is a button (Tab reaches it); pressing it, as Enter does, opens Before / Under / After.
  const region_ = region(solver, 'function AdditiveExpressionRegion(', '\nfunction ', 'AdditiveExpressionRegion');
  assert.match(region_, /<button\s+type="button"\s+ref=\{\(element\) => \{ termButtonRefs\.current\[termIndex\] = element; \}\}/);
  assert.match(region_, /if \(placementMode\) \{\s*setPlacementTargetIndex\(\(current\) => \(\s*current === termIndex \? null : termIndex\s*\)\);/);
  const menu = region(solver, 'function PlacementMiniMenu(', '\nfunction ', 'PlacementMiniMenu');
  for (const choice of ['Before', 'Under', 'After']) assert.match(menu, new RegExp(`\\['\\w+', '${choice}'\\]`));
  assert.match(menu, /<button\s+type="button"\s+key=\{kind\}\s+onClick=\{\(\) => onChoose\(kind\)\}/);
  // A choice (or ×) puts focus back on the term it was made from, not the page.
  assert.match(region_, /const closePlacementMenu = \(termIndex\) => \{\s*setPlacementTargetIndex\(null\);\s*window\.requestAnimationFrame\(\(\) => termButtonRefs\.current\[termIndex\]\?\.focus\?\.\(\)\);/);
  assert.match(region_, /onPlacement\(\{ kind, termIndex \}\);\s*closePlacementMenu\(termIndex\);/);
  assert.match(region_, /onClose=\{\(\) => closePlacementMenu\(termIndex\)\}/);
  // The buttons the multiply and divide lines name are the ones the solver draws.
  assert.match(solver, /: 'Place divisor'\}/);
  assert.match(solver, /: 'Place multiplier'\}/);
});

test('the line under the operations says it while nothing is placed, at the size of a step', () => {
  assert.match(solver, /const placementHowTo = explicitOperationPlacementMode && !stagedBranchStats\.length && relationState\.branches\.length <= 1\s*\?\s*placementInstruction\(\{ operation, regions: relationState\.branches\?\.\[activeBranch\]\?\.expressions\?\.length \|\| 2 \}\)\s*:\s*null;/);
  const line = region(solver, "data-placement-how={placementHowTo ? 'true' : undefined}", '</div>', 'placement line');
  assert.match(line, /fontSize: placementHowTo \? 'calc\(13 \* var\(--mm-px\)\)' : 'calc\(10\.5 \* var\(--mm-px\)\)'/);
  assert.match(line, /\{placementHowTo \|\| \(explicitOperationPlacementMode/, 'the how-to comes first; the progress and the other lines are as they were');
  // Before an operation is chosen the line is unchanged.
  assert.match(line, /: 'Place the balanced operation on both sides\.'\)\}/);
});
