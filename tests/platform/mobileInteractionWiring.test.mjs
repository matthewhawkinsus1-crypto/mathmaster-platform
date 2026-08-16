import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Step Algebra uses tap-to-place on mobile instead of requiring a cross-viewport drag', () => {
  const src = read('src/StepByStepAlgebra.jsx');
  assert.match(src, /tapPlacementArmed/);
  assert.match(src, /tapPlacementOnSide/);
  assert.match(src, /semanticPlacementFromTap/);
  assert.match(src, /algebra-mobile-operation-palette/);
  assert.match(src, /mobileInteraction\.isMobile \? activateTapPlacement/);
  assert.match(src, /contextSymbols=\{operationContextSymbols\}/);
  assert.match(src, /collapseSignal=\{mathToolsCollapseSignal\}/);
});

test('mobile Algebra operation keypad is equation-aware and suppresses the full phone keyboard', () => {
  const src = read('src/MathInput.jsx');
  assert.match(src, /algebraOperationKeysForContext/);
  assert.match(src, /contextSymbols/);
  assert.match(src, /toolProfile !== 'function'/);
  assert.match(src, /mathmaster-math-input-tools-\$\{toolProfile\}/);
});

test('drag-oriented workflow surfaces keep a tap equivalent and turn off HTML drag on mobile', () => {
  const axis = read('src/GraphAxisEditor.jsx');
  assert.match(axis, /Tap a card, then tap the matching axis box/);
  assert.match(axis, /draggable=\{!mobileInteraction\.isMobile\}/);

  const match = read('src/GraphScenarioMatch.jsx');
  assert.match(match, /draggable=\{!mobileInteraction\.isMobile\}/);
  assert.match(match, /onClick=\{\(\) => selectGraph/);
  assert.match(match, /onClick=\{\(\) => selectScenario/);

  const graph = read('src/InteractiveGraphWorkspace.jsx');
  assert.match(graph, /Tap a point card, then tap its location on the coordinate plane/);
  assert.match(graph, /draggable=\{!mobileInteraction\.isMobile/);
  assert.match(graph, /onClick=\{handleGridClick\}/);

  const sort = read('src/tools/openSortBoard/OpenSortBoard.jsx');
  assert.match(sort, /Tap a card to select it, then tap a group to place it there/);
});

test('assignment action menus cannot render off the phone viewport', () => {
  const src = read('src/AssignmentCardMenu.jsx');
  assert.match(src, /createPortal/);
  assert.match(src, /getViewportSafePopoverLayout/);
  assert.match(src, /mathmaster-mobile-action-sheet/);
  assert.match(src, /window\.visualViewport/);
});

test('mobile viewport shell uses the visual viewport and clips accidental page-level x overflow', () => {
  const container = read('src/components/student/MobileViewportContainer.jsx');
  const css = read('src/platform/mobile/MobileInteractionFoundation.css');
  const layoutCss = read('src/components/student/MathToolMobileLayout.css');
  assert.match(container, /--mm-visual-viewport-height/);
  assert.match(layoutCss, /height: var\(--mm-visual-viewport-height, 100dvh\)/);
  assert.match(container, /scrollIntoView/);
  assert.match(container, /mathmaster-mobile-interaction-root/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /100vw - 16px/);
});
