/*
 * A SECURE EXAM'S TOOLS OPEN WHERE THE TOOLBAR ENDS, AND A PHONE'S SHEET KEEPS
 * THE TEST UNDER IT OUT OF REACH (the handoff's "secure exam's tool drawers").
 *
 * Measured in the real app (tests/browser/secureExamToolFocus.mjs): a drawer
 * opened at the toolbar's height from the top of the screen, 95px, but under
 * the student's name bar and navigation the toolbar ran from 105 to 199px. At
 * 1366×768 the calculator covered the question list's button, and the
 * reference sheet both tool buttons, its own included. On a phone the toolbar
 * ran from 155 to 355px and the sheet started at 200: it covered the timer and
 * every button in the toolbar, and every Tab stop in the test was under it
 * (14 of 14 with the calculator, 36 of 36 with the reference sheet). Escape
 * closed a tool only from inside it.
 *
 * Now the exam keeps where the toolbar ends (never above the name bar) and an
 * open drawer follows it; on a phone the toolbar goes to the top when a sheet
 * opens, the question column is inert while it is open, and Escape anywhere
 * in the test closes it. The browser walk checks the behaviour; these pin the
 * wiring it depends on.
 *
 * After review r8 and CI:
 *   - A drawer followed a frame or two behind the page. On a phone a Tab that
 *     scrolled the toolbar back into view found its buttons still under the
 *     sheet (CI, pass3-secure-screens). The offset is now measured in the
 *     scroll's own handler and written onto each open drawer at once.
 *   - A tool taken away while open (no tools on the next item) left the exam
 *     thinking it open, and on a phone kept the question inert with nothing on
 *     the screen to close: no answer, no Next, no Submit. A tool now tells its
 *     host when it goes, and only a tool still offered holds the test.
 *   - On a phone the question list stayed in reach under a sheet; the list and
 *     a sheet now never share the screen.
 *   - Escape on the pause screen closed a sheet behind it; a dialog's Escape
 *     is now its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAM_TOOLBAR_MOVED_EVENT, EXAM_TOOL_CLOSE_EVENT, EXAM_TOOL_OPEN_EVENT } from '../../src/platform/assessment/examToolLayout.js';
import { identityStackOffset } from '../../src/platform/layout/stickyReveal.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const container = executableSource(read('src/components/assessment/SecureExamContainer.jsx'));
const hooks = executableSource(read('src/components/assessment/examToolDrawerHooks.js'));
const calculator = executableSource(read('src/components/assessment/GraphingCalculatorPanel.jsx'));
const sheet = executableSource(read('src/components/assessment/SatReferenceSheet.jsx'));

test('the exam\'s tool events are three different events', () => {
  const names = [EXAM_TOOL_OPEN_EVENT, EXAM_TOOLBAR_MOVED_EVENT, EXAM_TOOL_CLOSE_EVENT];
  assert.equal(new Set(names).size, 3);
  names.forEach((name) => assert.match(name, /^mathmaster:exam-/));
});

test('how far the name bar reaches is read from the page, and is 0 where there is none', () => {
  const page = (value) => ({ document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => value }) });
  assert.equal(identityStackOffset(page('47px')), 47);
  assert.equal(identityStackOffset(page('')), 0);
  assert.equal(identityStackOffset(page('auto')), 0);
  assert.equal(identityStackOffset(null), 0);
});

test('the exam keeps where the toolbar ends, as the page scrolls, without drawing the test again', () => {
  const effect = region(container, 'const surface = surfaceRef.current;', '}, [session?.examSessionId, session?.status]);', 'the toolbar edge');
  // The toolbar's bottom edge on the screen, never above the name bar.
  assert.match(effect, /Math\.ceil\(Math\.max\(0, identityStackOffset\(window\), toolbar\.getBoundingClientRect\(\)\.bottom\)\)/);
  assert.match(effect, /surface\.style\.setProperty\('--mm-exam-toolbar-offset', offset\);\s*document\.querySelectorAll\(EXAM_TOOL_PANEL_SELECTOR\)\.forEach\(\(panel\) => panel\.style\.setProperty\('--mm-exam-toolbar-offset', offset\)\);\s*window\.dispatchEvent\(new CustomEvent\(EXAM_TOOLBAR_MOVED_EVENT\)\);/);
  // In the scroll's own handler, before the frame is drawn: never a frame late.
  assert.match(effect, /window\.addEventListener\('scroll', measure, \{ capture: true, passive: true \}\);/);
  assert.match(effect, /window\.addEventListener\('resize', measure\);/);
  assert.match(effect, /new ResizeObserver\(measure\)/);
  assert.doesNotMatch(effect, /requestAnimationFrame|schedule/);
  assert.match(effect, /window\.removeEventListener\('scroll', measure, \{ capture: true \}\);/);
  // The toolbar also moves when something above it changes size.
  assert.match(effect, /observer\?\.observe\(toolbar\);\s*observer\?\.observe\(document\.body\);\s*const nameBar = document\.querySelector\('\.mm-identity-bar'\);\s*if \(nameBar\) observer\?\.observe\(nameBar\);/);
  // Set on the element, not kept in a React state: a state would draw the
  // whole test again on every frame of a scroll.
  assert.doesNotMatch(container, /toolbarHeight|setToolbarHeight/);
  assert.doesNotMatch(container, /'--mm-exam-toolbar-offset':/);
  assert.match(container, /<div inert=\{surfaceInert \|\| undefined\} data-secure-exam-surface="" ref=\{surfaceRef\}/);
  // An open drawer hears that the toolbar moved, and reads the new edge.
  assert.match(hooks, /window\.addEventListener\(EXAM_TOOLBAR_MOVED_EVENT, update\);/);
  assert.match(hooks, /window\.removeEventListener\(EXAM_TOOLBAR_MOVED_EVENT, update\);/);
});

test('on a phone the question is out of reach while a sheet is open, and Escape anywhere closes the sheet', () => {
  assert.match(container, /const narrow = useNarrowScreen\(\);\s*const toolSheetOpen = narrow && \(referenceSheetOpen \|\| graphingCalculatorOpen\);/);
  // Only a tool this item still offers holds the test out of reach.
  assert.match(container, /const sheetOverTest = toolSheetOpen && Boolean\(\s*\(referenceSheetOpen && tools\.referenceSheet\) \|\| \(graphingCalculatorOpen && tools\.graphingCalculator && !pause\),\s*\);/);
  assert.match(container, /data-secure-question-column="" inert=\{sheetOverTest \|\| undefined\}/);
  assert.doesNotMatch(container, /inert=\{toolSheetOpen/);
  const escape = region(container, 'const closeToolSheetOnEscape = sheetOverTest ? (event) => {', '} : undefined;', 'Escape on the test');
  assert.match(escape, /if \(event\.key !== 'Escape' \|\| event\.defaultPrevented\) return;/);
  // A dialog's Escape is its own: the pause screen keeps its off.
  assert.match(escape, /if \(event\.target\?\.closest\?\.\('\[role="dialog"\], \[role="alertdialog"\]'\) && !event\.target\.closest\(EXAM_TOOL_PANEL_SELECTOR\)\) return;/);
  assert.match(escape, /window\.dispatchEvent\(new CustomEvent\(EXAM_TOOL_CLOSE_EVENT\)\);/);
  assert.match(container, /return <div ref=\{rootRef\} data-secure-exam-status=\{session\.status\} onKeyDown=\{closeToolSheetOnEscape\}/);
  // The toolbar goes to the top first, under the name bar (the page's scroll
  // padding), and the question list closes: the two never share a phone's screen.
  assert.match(container, /if \(!toolSheetOpen\) return;\s*setNavigatorOpen\(false\);\s*rootRef\.current\?\.querySelector\('\[data-secure-exam-header\]'\)\?\.scrollIntoView\?\.\(\{ block: 'start', inline: 'nearest', behavior: 'instant' \}\);/);
  // And the list closes a sheet, leaving focus with the list's toggle.
  const openList = region(container, 'const openNavigator = useCallback(() => {', '}, [runAutosave]);', 'opening the list');
  assert.match(openList, /if \(toolSheetOpenRef\.current && typeof window !== 'undefined'\) \{\s*window\.dispatchEvent\(new CustomEvent\(EXAM_TOOL_CLOSE_EVENT, \{ detail: \{ returnFocus: false \} \}\)\);\s*\}\s*setNavigatorOpen\(true\);/);
});

test('each tool closes when the exam asks, as its own Close does, and Escape inside it goes no further', () => {
  for (const [name, source] of [['the graphing calculator', calculator], ['the reference sheet', sheet]]) {
    assert.match(source, /const closeRef = useRef\(close\);\s*closeRef\.current = close;/, name);
    assert.match(source, /if \(!open \|\| typeof window === 'undefined'\) return undefined;\s*const closeAsked = \(event\) => \(event\?\.detail\?\.returnFocus === false \? setOpen\(false\) : closeRef\.current\(\)\);\s*window\.addEventListener\(EXAM_TOOL_CLOSE_EVENT, closeAsked\);\s*return \(\) => window\.removeEventListener\(EXAM_TOOL_CLOSE_EVENT, closeAsked\);\s*\}, \[open, setOpen\]\);/, name);
    // Taken away while open, it tells its host it closed (not on development's second mount).
    assert.match(source, /const mountedRef = useRef\(false\);\s*useEffect\(\(\) => \{\s*mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;\s*queueMicrotask\(\(\) => \{\s*if \(!mountedRef\.current && openRef\.current\) onOpenChangeRef\.current\?\.\(false\);\s*\}\);\s*\};\s*\}, \[\]\);/, name);
    // Escape inside the tool: handled there, so the exam's own Escape never runs twice.
    assert.match(source, /if \(event\.key !== 'Escape'\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/, name);
  }
});

test('the browser walk that measured it runs in CI', () => {
  const driver = read('tests/browser/secureExamToolFocus.mjs');
  for (const label of [
    'no control of the toolbar is covered',
    'no stop in the test is hidden under the open tool (WCAG 2.4.11)',
    'each drawer opens where the toolbar ends and follows it, never over the name bar',
    'Escape on the toolbar closes it, and focus is back on its toolbar button',
  ]) assert.ok(driver.includes(label), label);
  assert.match(read('.github/workflows/student-runtime-browser-gates.yml'), /run: node tests\/browser\/secureExamToolFocus\.mjs/);
  // It reads the frame drawn after each key, and on a phone starts with the
  // toolbar part-way under the name bar, so every walk crosses a scroll.
  assert.match(driver, /const hiddenInNextFrame = \(\) => new Promise\(\(resolve\) => \{\s*window\.requestAnimationFrame\(\(\) => resolve\(window\.__mmHiddenUnderTool\(\)\)\);\s*\}\);/);
  assert.match(driver, /window\.scrollBy\(\{ top: 125, behavior: 'instant' \}\);/);
});

test('the journey that found a tool gone holding the test runs in CI with the others', () => {
  const driver = read('tests/browser/secureExamNavigation.mjs');
  assert.match(driver, /const toolGoneJourney = async \(context, device\) =>/);
  assert.match(driver, /const journeys = \[[^\]]*\btoolGoneJourney\b[^\]]*\]/);
  for (const label of [
    'Next onto an item with no tools: no drawer, no room kept for one, the question in reach',
    'made as narrow as a phone, the question is still in reach',
    'opening the question list closes the sheet',
    'opening a sheet closes the question list',
    'Escape on the pause screen leaves the reference sheet open behind it',
  ]) assert.ok(driver.includes(label), label);
  assert.match(read('tests/browser/secureExamNavigationMain.jsx'), /scenario === 'toolGone'/);
});
