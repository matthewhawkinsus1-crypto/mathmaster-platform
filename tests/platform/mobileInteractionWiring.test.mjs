import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepAlgebraSource } from './helpers/solverSource.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Step Algebra offers select-then-place instead of requiring a cross-viewport drag', () => {
  const src = stepAlgebraSource();
  assert.match(src, /tapPlacementArmed/);
  assert.match(src, /tapPlacementOnSide/);
  assert.match(src, /semanticPlacementFromTap/);
  assert.match(src, /algebra-mobile-operation-palette/);
  // This assertion used to pin `mobileInteraction.isMobile ? activateTapPlacement`
  // — the very gating that locked keyboard users out on a desktop. The
  // select-then-place route is now available to EVERY device, which satisfies
  // the original intent more strongly rather than less.
  assert.match(src, /onClick=\{activateTapPlacement\}/,
    'the non-drag route must not be gated behind a device check');
  assert.ok(!/onClick=\{mobileInteraction\.isMobile \? activateTapPlacement : undefined\}/.test(src),
    'a desktop keyboard user must not find onClick undefined');
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


test('compact phones open migrated rich tools directly in Work View', () => {
  const src = read('src/tools/shared/RegisteredToolWorkView.jsx');
  assert.match(src, /useMobileInteractionMode/);
  assert.match(src, /openEnlarged=\{Boolean\(mobile\?\.isCompactPhone\)\}/);
  assert.match(src, /mm\.workview\.phone\.dismissed/);
});

test('controlled sort uses fixed category buttons instead of answer-entry keyboards', () => {
  const src = read('src/tools/openSortBoard/OpenSortBoard.jsx');
  assert.match(src, /title=\{controlled \? 'Controlled Sort'/);
  assert.match(src, /Place every card into one of the provided categories/);
  assert.match(src, /placeItem\(item\.id, category\.id\)/);
});


test('hand-fit regression is button-driven and phone controls stack vertically', () => {
  const lab = read('src/tools/dataModeling/DataModelingLab.jsx');
  const css = read('src/components/student/MathToolMobileLayout.css');
  assert.match(lab, /const FitStepper =/);
  assert.match(lab, /exploratoryLineFit \? \(/);
  assert.match(lab, /Decrease \$\{label\}/);
  assert.match(lab, /Increase \$\{label\}/);
  const exploratoryStart = lab.indexOf(") : exploratoryLineFit ? (");
  const typedLinearStart = lab.indexOf(") : (", exploratoryStart + 10);
  const exploratoryBlock = lab.slice(exploratoryStart, typedLinearStart);
  assert.doesNotMatch(exploratoryBlock, /<input type="number"/,
    'lineFit/full exploration must not be bypassable by typing coefficients');
  assert.match(css, /\.mathmaster-line-fit-steppers\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});


test('calculator launcher has one global owner even while Work View is open', () => {
  const engine = read('src/QuestionEngine.jsx');
  assert.match(engine, /🧮 Calculator/);
  assert.match(engine, /showLauncher=\{false\}/);
  const contextStart = engine.indexOf('const questionContextPanel');
  const contextEnd = engine.indexOf('return (', contextStart);
  assert.doesNotMatch(engine.slice(contextStart, contextEnd), /<CalculatorPanel/,
    'the calculator launcher must not float inside the question context anymore');

  const providerStart = engine.indexOf('<WorkViewCapabilityProvider capabilities={{');
  const providerEnd = engine.indexOf('}}>', providerStart);
  const provider = engine.slice(providerStart, providerEnd);
  assert.doesNotMatch(provider, /secondaryActions|primaryActions|workspaceActions\.calculator|workspaceActions\.scratchpad|workspaceActions\.undo/,
    'global Undo/Scratchpad/Calculator/Submit belong to the shared sticky work bar, not a duplicate Work View toolbar');
});
