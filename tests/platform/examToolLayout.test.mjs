// WHERE THE EXAM TOOLS SIT (src/platform/assessment/examToolLayout.js, used by
// SatReferenceSheet.jsx, GraphingCalculatorPanel.jsx and examToolDrawerHooks.js).
//
// Three promises: a docked tool never covers the question (the container pads
// the question column by exactly how far each drawer reaches into it); where
// two tools cannot both sit beside the question, opening one closes the
// other; and a tool sits above "Enlarge question" but under every layer that
// must cover it. The layer invariants are read from the files that own those
// layers, so moving one of them fails here instead of hiding a tool.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAM_TOOL_DRAWERS, EXAM_TOOL_IDS, EXAM_TOOL_LAYERS, EXAM_TOOL_NARROW_QUERY, examToolRoom, examToolYieldsTo, examToolsFitSideBySide,
} from '../../src/platform/assessment/examToolLayout.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const SHEET = read('src/components/assessment/SatReferenceSheet.jsx');
const PANEL = read('src/components/assessment/GraphingCalculatorPanel.jsx');
const HOOKS = read('src/components/assessment/examToolDrawerHooks.js');
const { GRAPHING_CALCULATOR: CALCULATOR, REFERENCE_SHEET } = EXAM_TOOL_IDS;

test('the question column is padded by how far each open drawer reaches into it — not more, not less', () => {
  // The app is a centred 1126px column (index.css #root): at 1366px it runs 120..1246.
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, left: 120, right: 1246, referenceSheetOpen: true, graphingCalculatorOpen: true }), { paddingLeft: 360, paddingRight: 320 },
    'the question gets all 446px between the drawers (padding by full widths left 170px)');
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, referenceSheetOpen: true, graphingCalculatorOpen: true }), { paddingLeft: 480, paddingRight: 440 }, 'a full-width column');
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, left: 120, right: 1246, referenceSheetOpen: true }), { paddingLeft: 0, paddingRight: 320 });
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, left: 120, right: 1246, graphingCalculatorOpen: true }), { paddingLeft: 360, paddingRight: 0 });
  assert.deepEqual(examToolRoom({ viewportWidth: 1920, left: 397, right: 1523, referenceSheetOpen: true, graphingCalculatorOpen: true }), { paddingLeft: 83, paddingRight: 43 }, 'a wide screen needs little');
  assert.deepEqual(examToolRoom({ viewportWidth: 2600, left: 737, right: 1863, referenceSheetOpen: true, graphingCalculatorOpen: true }), { paddingLeft: 0, paddingRight: 0 }, 'drawers that do not reach the column need none');
  // A classic 17px scrollbar: the fixed drawer's right edge is the layout width's.
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, layoutWidth: 1349, left: 111, right: 1237, referenceSheetOpen: true }), { paddingLeft: 0, paddingRight: 328 });
  assert.deepEqual(examToolRoom({ viewportWidth: 1366, left: 120, right: 1246 }), { paddingLeft: 0, paddingRight: 0 }, 'nothing open, no room');
});

test('a phone gets no room: its tools are bottom sheets the student closes to answer', () => {
  for (const viewportWidth of [320, 390, 719]) {
    assert.deepEqual(examToolRoom({ viewportWidth, referenceSheetOpen: true, graphingCalculatorOpen: true }), { paddingLeft: 0, paddingRight: 0 }, String(viewportWidth));
  }
  assert.equal(EXAM_TOOL_NARROW_QUERY, `(max-width: ${EXAM_TOOL_DRAWERS.dockFrom - 1}px)`, 'the drawers dock exactly where the room starts');
});

test('both tools stay open only where both sit beside a usable question; otherwise opening one closes the other', () => {
  assert.equal(EXAM_TOOL_DRAWERS[CALCULATOR] + EXAM_TOOL_DRAWERS[REFERENCE_SHEET] + EXAM_TOOL_DRAWERS.minQuestionWidth, 1280);
  assert.equal(examToolsFitSideBySide(1366), true, 'the Chromebook baseline keeps both');
  assert.equal(examToolsFitSideBySide(1280), true);
  assert.equal(examToolsFitSideBySide(1279), false);
  assert.equal(examToolsFitSideBySide(390), false);
  assert.equal(examToolYieldsTo(REFERENCE_SHEET, CALCULATOR, 390), true, 'on a phone the sheet steps aside for the calculator — it would otherwise hide it');
  assert.equal(examToolYieldsTo(CALCULATOR, REFERENCE_SHEET, 1024), true);
  assert.equal(examToolYieldsTo(CALCULATOR, REFERENCE_SHEET, 1366), false);
  assert.equal(examToolYieldsTo(REFERENCE_SHEET, REFERENCE_SHEET, 390), false, 'a tool never closes for itself');
  assert.equal(examToolYieldsTo(REFERENCE_SHEET, undefined, 390), false);
});

test('the tools sit above Work View and its keypad, and under the inactivity dialog, the integrity warning and the pause', () => {
  const workView = Number(read('src/components/common/WorkViewShell.css').match(/\.mathmaster-work-view-host\[data-open="true"\] \{[^}]*?z-index: (\d+);/)[1]);
  const workViewKeypad = Number(read('src/components/common/WorkViewShell.css').match(/\.mathmaster-mobile-numeric-keypad \{\s*z-index: (\d+)/)[1]);
  const idle = Number(region(read('src/App.jsx'), 'className="mathmaster-idle-overlay"', '}}', 'the inactivity dialog').match(/zIndex: (\d+)/)[1]);
  // The question list is a panel on the page now, not a layer; what must
  // cover a tool is the warning before a pause, and the pause itself.
  const container = read('src/components/assessment/SecureExamContainer.jsx');
  const warning = Number(container.match(/const WARNING_LAYER = (\d+);/)[1]);
  const pause = Number(container.match(/const PAUSE_LAYER = (\d+);/)[1]);
  for (const [tool, layer] of Object.entries(EXAM_TOOL_LAYERS)) {
    assert.ok(layer > workView && layer > workViewKeypad, `${tool} (${layer}) must sit above Work View (${workView}) and its keypad (${workViewKeypad})`);
    assert.ok(layer < idle && layer < warning && layer < pause, `${tool} (${layer}) must sit under the inactivity dialog (${idle}), the integrity warning (${warning}) and the pause (${pause})`);
  }
  assert.ok(EXAM_TOOL_LAYERS[REFERENCE_SHEET] > EXAM_TOOL_LAYERS[CALCULATOR], 'the sheet over the calculator, as before');
});

test('each drawer is portalled to the body, at its shared layer and width, and reports every open and close', () => {
  for (const [name, source, tool] of [['the reference sheet', SHEET, 'SatReferenceSheet'], ['the graphing calculator', PANEL, 'GraphingCalculatorPanel']]) {
    const code = executableSource(source);
    // A toolbar's stacking context held a drawer rendered inside it under Work View.
    assert.match(code, /createPortal\(\s*<section/, `${name} renders its panel in a portal`);
    assert.match(code, /<\/section>,\s*document\.body,\s*\)/, `${name} portals to the body`);
    assert.match(code, /zIndex: EXAM_TOOL_LAYERS\[TOOL\],/, `${name} uses its shared layer`);
    assert.match(code, /width: `min\(\$\{EXAM_TOOL_DRAWERS\[TOOL\]\}px, 100vw\)`/, `${name} is as wide as the room the container makes`);
    const component = region(source, `export default function ${tool}`, '\n}\n', name);
    const setOpen = region(component, 'const setOpen = useCallback((next) => {', '}, []);', `${name} setOpen`);
    assert.match(setOpen, /onOpenChangeRef\.current\?\.\(next\);/, `${name} reports every open and close, so the container can make room`);
    assert.match(setOpen, /if \(next && typeof window !== 'undefined'\) window\.dispatchEvent\(new CustomEvent\(EXAM_TOOL_OPEN_EVENT, \{ detail: \{ tool: TOOL \} \}\)\);/, `${name} says it opened`);
    const yieldTo = region(component, 'const yieldTo = (event) => {', '};', `${name} yields`);
    assert.match(yieldTo, /if \(openRef\.current && examToolYieldsTo\(TOOL, event\?\.detail\?\.tool, window\.innerWidth\)\) setOpen\(false\);/, `${name} steps aside where both do not fit`);
    // The offset an exam sets on the toolbar's ancestors does not reach a portal.
    assert.match(component, /const toolbarOffset = useExamToolbarOffset\(launcherRef, open\);/, `${name} reads the toolbar offset where its launcher sits`);
  }
  assert.match(SHEET, /\.\.\.\(toolbarOffset \? \{ '--mm-exam-toolbar-offset': toolbarOffset \} : null\),/);
  assert.match(PANEL, /'--mm-exam-toolbar-offset': toolbarOffset,/);
  assert.match(SHEET, /<SatReferenceSheetDialog open=\{open\} onClose=\{close\} id=\{dialogId\} toolbarOffset=\{toolbarOffset\} \/>/);
});

test('the container hook measures the column it pads and asks the pure rule', () => {
  const hook = region(HOOKS, 'export const useExamToolRoom = (', '\n};\n', 'useExamToolRoom');
  assert.match(hook, /const rect = columnRef\.current\?\.getBoundingClientRect\?\.\(\);/);
  assert.match(hook, /const layoutWidth = document\.documentElement\?\.clientWidth \|\| window\.innerWidth;/);
  assert.match(hook, /return examToolRoom\(\{ \.\.\.edges, referenceSheetOpen, graphingCalculatorOpen \}\);/);
  assert.match(hook, /window\.addEventListener\('resize', measure\);/);
  const offset = region(HOOKS, 'const readOffset = (anchor) => {', '\n};\n', 'readOffset');
  assert.match(offset, /getComputedStyle\(anchor\)\.getPropertyValue\('--mm-exam-toolbar-offset'\)/);
});
